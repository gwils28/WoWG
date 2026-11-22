import { existsSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { Hono } from 'hono';
import { HTTPException } from 'hono/http-exception';
import { z } from 'zod';
import {
  canAddRank,
  canRemoveRank,
  CustomQuestSchema,
  diffTrees,
  QuestDefinitionSchema,
  QuestTalentRefSchema,
  PurchaseSnapshotSchema,
  RewardCardSchema,
  formatIssues,
  parseTree,
  TreeFileStructureSchema,
  type TreeFile,
} from '@wowg/shared';
import type { Db } from './db';
import { badRequest, DateInput, readBody, toIso } from './http';
import { createRepository } from './repository';
import { registerMarketRoutes } from './market';
import { registerQuestRoutes } from './quests';
import {
  canonicalTreePath,
  listTreeFiles,
  PathError,
  readTreeFile,
  writeTreeFile,
} from './tree-files';
import { character, PINNED_DOMAINS, pinnedDomains, specDetail, specSummary } from './views';

export interface AppOptions {
  db: Db;
  treesDir: string;
  /** Dossier des portraits palier-1.png ... palier-5.png (hors git). Absent : pas de portrait. */
  portraitsDir?: string;
  /** Horloge (injectée dans les tests des rythmes de quête). */
  now?: () => Date;
}

const PORTRAIT_TYPES: Record<string, string> = {
  png: 'image/png',
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  webp: 'image/webp',
};

const RankBody = z.object({
  note: z.string().trim().max(2000).optional(),
  occurredAt: DateInput.optional(),
});

const ImportBody = z
  .object({ path: z.string().min(1).optional(), content: z.unknown().optional() })
  .refine((b) => (b.path === undefined) !== (b.content === undefined), {
    message: 'fournir soit "path" (relatif à trees/), soit "content"',
  });

const JournalQuery = z.object({
  domain: z.string().optional(),
  spec: z.string().optional(),
  from: z.iso.date().optional(),
  to: z.iso.date().optional(),
});

const PinBody = z.object({ pinned: z.boolean() });

const BackupSchema = z.object({
  format: z.literal('wowg-backup'),
  version: z.literal(1),
  // absent des sauvegardes antérieures aux épingles
  preferences: z.record(z.string(), z.unknown()).optional(),
  specializations: z.array(
    z.object({
      tree: TreeFileStructureSchema,
      sourcePath: z.string().nullable(),
      importedAt: z.string(),
      updatedAt: z.string(),
    }),
  ),
  events: z.array(
    z.object({
      id: z.number().int(),
      specializationId: z.string(),
      talentId: z.string(),
      delta: z.union([z.literal(1), z.literal(-1)]),
      occurredAt: z.string(),
      note: z.string().nullable().optional(),
      createdAt: z.string(),
      questRunId: z.number().int().nullable().optional(),
    }),
  ),
  // absents des sauvegardes antérieures aux quêtes
  customQuests: z
    .array(
      z.object({
        id: z.number().int(),
        quest: CustomQuestSchema,
        createdAt: z.string(),
        updatedAt: z.string(),
      }),
    )
    .optional(),
  questRuns: z
    .array(
      z.object({
        id: z.number().int(),
        source: z.enum(['tree', 'custom']),
        specializationId: z.string().nullable(),
        questId: z.string().nullable(),
        customQuestId: z.number().int().nullable(),
        definition: QuestDefinitionSchema,
        gold: z.number().int(),
        acceptedAt: z.string(),
        deadline: z.string().nullable(),
        stepsDone: z.array(z.number().int()),
        status: z.enum(['active', 'completed', 'abandoned']),
        completedAt: z.string().nullable(),
        grants: z.array(QuestTalentRefSchema).nullable(),
        note: z.string().nullable(),
        createdAt: z.string(),
      }),
    )
    .optional(),
  questTicks: z
    .array(
      z.object({
        id: z.number().int(),
        runId: z.number().int(),
        occurredAt: z.string(),
        createdAt: z.string(),
      }),
    )
    .optional(),
  goldEvents: z
    .array(
      z.object({
        id: z.number().int(),
        amount: z.number().int(),
        reason: z.enum(['quest', 'quest-undo', 'purchase', 'purchase-undo']),
        runId: z.number().int().nullable(),
        purchaseId: z.number().int().nullable().optional(),
        occurredAt: z.string(),
        createdAt: z.string(),
      }),
    )
    .optional(),
  // absents des sauvegardes antérieures à l'Étal
  rewardCards: z
    .array(
      z.object({
        id: z.number().int(),
        card: RewardCardSchema,
        archived: z.boolean(),
        createdAt: z.string(),
        updatedAt: z.string(),
      }),
    )
    .optional(),
  purchases: z
    .array(
      z.object({
        id: z.number().int(),
        cardId: z.number().int(),
        snapshot: PurchaseSnapshotSchema,
        purchasedAt: z.string(),
        undoneAt: z.string().nullable(),
        archivedCard: z.boolean(),
        createdAt: z.string(),
      }),
    )
    .optional(),
});

export function createApp({ db, treesDir, portraitsDir, now = () => new Date() }: AppOptions) {
  const repo = createRepository(db);
  const app = new Hono().basePath('/api');
  const nowIso = () => now().toISOString();
  const { questRepo, views: questViews } = registerQuestRoutes(app, { db, repo, now: nowIso });
  const { marketRepo } = registerMarketRoutes(app, { db, repo, questRepo, now: nowIso });

  app.onError((err, c) => {
    if (err instanceof HTTPException) return err.getResponse();
    if (err instanceof PathError) return c.json({ errors: [err.message] }, 400);
    if ((err as NodeJS.ErrnoException).code === 'ENOENT') {
      return c.json({ errors: ['fichier introuvable dans trees/'] }, 404);
    }
    console.error(err);
    return c.json({ errors: ['erreur interne'] }, 500);
  });

  const requireSpec = (id: string) => {
    const spec = repo.getSpecialization(id);
    if (!spec)
      throw new HTTPException(404, {
        res: Response.json({ errors: [`spécialisation "${id}" inconnue`] }, { status: 404 }),
      });
    return spec;
  };

  /** Charge et valide un arbre depuis trees/ ou depuis le contenu fourni. */
  async function loadImport(body: z.infer<typeof ImportBody>): Promise<TreeFile> {
    const source = body.path !== undefined ? await readTreeFile(treesDir, body.path) : body.content;
    const res = parseTree(source);
    if (!res.ok) badRequest(res.errors);
    return res.tree;
  }

  /** Fichier du portrait d'un palier, s'il existe. */
  function portraitFile(tier: number): { path: string; type: string } | null {
    if (!portraitsDir) return null;
    for (const [ext, type] of Object.entries(PORTRAIT_TYPES)) {
      const path = join(portraitsDir, `palier-${tier}.${ext}`);
      if (existsSync(path)) return { path, type };
    }
    return null;
  }

  app.get('/character', (c) =>
    c.json({
      ...character(repo, (tier) => (portraitFile(tier) ? `/api/portraits/${tier}` : null)),
      gold: questRepo.goldBalance(),
    }),
  );

  app.get('/portraits/:tier{[1-5]}', async (c) => {
    const file = portraitFile(Number(c.req.param('tier')));
    if (!file) return c.json({ errors: ['portrait introuvable'] }, 404);
    return c.body(await readFile(file.path), 200, {
      'content-type': file.type,
      'cache-control': 'no-cache',
    });
  });

  app.put('/domains/:id/pin', async (c) => {
    const id = c.req.param('id');
    const { pinned } = await readBody(c, PinBody);
    if (!repo.listSpecializations().some((s) => s.domainId === id)) {
      return c.json({ errors: [`domaine "${id}" inconnu`] }, 404);
    }
    const current = pinnedDomains(repo).filter((d) => d !== id);
    const next = pinned ? [...current, id] : current;
    repo.setPreference(PINNED_DOMAINS, next);
    return c.json({ pinned: next });
  });

  app.get('/specializations', (c) =>
    c.json(repo.listSpecializations().map((s) => specSummary(s, repo.ranks(s.id)))),
  );

  app.get('/specializations/:id', (c) => {
    const spec = requireSpec(c.req.param('id'));
    return c.json({
      ...specDetail(spec, repo.ranks(spec.id)),
      questStates: questViews.treeQuestStates(spec, nowIso()),
    });
  });

  app.put('/specializations/:id', async (c) => {
    const id = c.req.param('id');
    const existing = requireSpec(id);
    const res = parseTree(await readBody(c, z.unknown()));
    if (!res.ok) badRequest(res.errors);
    if (res.tree.specialization.id !== id) {
      badRequest([`l'id de spécialisation ne peut pas changer ("${id}" attendu)`]);
    }
    const ranks = repo.ranks(id);
    const diff = diffTrees(existing.tree, res.tree, ranks);
    const sourcePath = await writeTreeFile(treesDir, res.tree);
    const saved = repo.saveSpecialization(res.tree, sourcePath);
    return c.json({ specialization: specDetail(saved, ranks), diff });
  });

  app.post('/specializations/:id/talents/:talentId/ranks', async (c) => {
    const spec = requireSpec(c.req.param('id'));
    const talentId = c.req.param('talentId');
    const body = await readBody(c, RankBody, true);
    const check = canAddRank(spec.tree, repo.ranks(spec.id), talentId);
    if (!check.ok) return c.json({ errors: [check.reason] }, 409);
    const event = repo.addEvent(spec.id, {
      talentId,
      delta: 1,
      note: body.note || null,
      occurredAt: toIso(body.occurredAt),
    });
    return c.json({ event, specialization: specDetail(spec, repo.ranks(spec.id)) }, 201);
  });

  app.delete('/specializations/:id/talents/:talentId/ranks', (c) => {
    const spec = requireSpec(c.req.param('id'));
    const talentId = c.req.param('talentId');
    const check = canRemoveRank(spec.tree, repo.ranks(spec.id), talentId);
    if (!check.ok) return c.json({ errors: [check.reason] }, 409);
    const event = repo.addEvent(spec.id, { talentId, delta: -1 });
    return c.json({ event, specialization: specDetail(spec, repo.ranks(spec.id)) });
  });

  app.get('/tree-files', async (c) => c.json(await listTreeFiles(treesDir)));

  app.post('/import/preview', async (c) => {
    const body = await readBody(c, ImportBody);
    const tree = await loadImport(body);
    const existing = repo.getSpecialization(tree.specialization.id);
    const ranks = existing ? repo.ranks(existing.id) : {};
    const diff = diffTrees(existing?.tree ?? null, tree, ranks);
    return c.json({ tree, ranks, diff, targetPath: body.path ?? canonicalTreePath(tree) });
  });

  app.post('/import/apply', async (c) => {
    const body = await readBody(c, ImportBody);
    const tree = await loadImport(body);
    const existing = repo.getSpecialization(tree.specialization.id);
    const ranks = existing ? repo.ranks(existing.id) : {};
    const diff = diffTrees(existing?.tree ?? null, tree, ranks);
    // un contenu envoyé directement est versionné dans trees/ comme les autres
    const sourcePath = body.path ?? (await writeTreeFile(treesDir, tree));
    const saved = repo.saveSpecialization(tree, sourcePath);
    return c.json({ specialization: specDetail(saved, ranks), diff }, existing ? 200 : 201);
  });

  app.get('/journal', (c) => {
    const q = JournalQuery.safeParse(c.req.query());
    if (!q.success) badRequest(formatIssues(q.error));
    const { domain, spec, from, to } = q.data;
    const specs = new Map(repo.listSpecializations().map((s) => [s.id, s]));
    const questNames = new Map(questRepo.listRuns().map((r) => [r.id, r.definition.name]));
    const running = new Map<string, number>();
    const entries = repo.listEvents().map((e) => {
      const key = `${e.specializationId}/${e.talentId}`;
      const rankAfter = Math.max(0, (running.get(key) ?? 0) + e.delta);
      running.set(key, rankAfter);
      const s = specs.get(e.specializationId);
      const talent = s?.tree.talents.find((t) => t.id === e.talentId);
      return {
        ...e,
        rankAfter,
        maxRank: talent?.maxRank ?? null,
        talentName: talent?.name ?? e.talentId,
        talentIcon: talent?.icon ?? null,
        orphan: !talent,
        questName: e.questRunId === null ? null : (questNames.get(e.questRunId) ?? null),
        domain: s?.tree.domain ?? null,
        specialization: s?.tree.specialization ?? null,
      };
    });
    const filtered = entries
      .filter((e) => !domain || e.domain?.id === domain)
      .filter((e) => !spec || e.specializationId === spec)
      .filter((e) => !from || e.occurredAt.slice(0, 10) >= from)
      .filter((e) => !to || e.occurredAt.slice(0, 10) <= to)
      .sort((a, b) => b.occurredAt.localeCompare(a.occurredAt) || b.id - a.id);
    return c.json(filtered);
  });

  app.get('/backup', (c) => {
    const backup = {
      format: 'wowg-backup',
      version: 1,
      exportedAt: new Date().toISOString(),
      specializations: repo
        .listSpecializations()
        .map(({ tree, sourcePath, importedAt, updatedAt }) => ({
          tree,
          sourcePath,
          importedAt,
          updatedAt,
        })),
      events: repo.listEvents(),
      preferences: repo.preferences(),
      ...questRepo.exportAll(),
      ...marketRepo.exportAll(),
    };
    const date = backup.exportedAt.slice(0, 10);
    c.header('Content-Disposition', `attachment; filename="wowg-backup-${date}.json"`);
    return c.json(backup);
  });

  app.post('/backup', async (c) => {
    const backup = await readBody(c, BackupSchema);
    const ids = new Set(backup.specializations.map((s) => s.tree.specialization.id));
    const unknown = backup.events.filter((e) => !ids.has(e.specializationId));
    if (unknown.length) {
      badRequest([
        `${unknown.length} événement(s) référencent une spécialisation absente de la sauvegarde`,
      ]);
    }
    const runIds = new Set((backup.questRuns ?? []).map((r) => r.id));
    const dangling = [
      ...backup.events.map((e) => e.questRunId),
      ...(backup.questTicks ?? []).map((t) => t.runId),
      ...(backup.goldEvents ?? []).map((g) => g.runId),
    ].filter((id) => id !== null && id !== undefined && !runIds.has(id));
    if (dangling.length) {
      badRequest([
        `${dangling.length} élément(s) référencent un suivi de quête absent de la sauvegarde`,
      ]);
    }
    const cardIds = new Set((backup.rewardCards ?? []).map((card) => card.id));
    const purchaseIds = new Set((backup.purchases ?? []).map((p) => p.id));
    const orphans = [
      ...(backup.purchases ?? []).filter((p) => !cardIds.has(p.cardId)),
      ...(backup.goldEvents ?? []).filter(
        (g) =>
          g.purchaseId !== null && g.purchaseId !== undefined && !purchaseIds.has(g.purchaseId),
      ),
    ];
    if (orphans.length) {
      badRequest([`${orphans.length} élément(s) référencent une carte ou un achat absent`]);
    }
    repo.replaceAll(
      backup.specializations.map((s) => ({ ...s, id: s.tree.specialization.id })),
      backup.events,
      backup.preferences,
      {
        customQuests: backup.customQuests ?? [],
        questRuns: backup.questRuns ?? [],
        questTicks: backup.questTicks ?? [],
        goldEvents: (backup.goldEvents ?? []).map((g) => ({
          ...g,
          purchaseId: g.purchaseId ?? null,
        })),
      },
      { rewardCards: backup.rewardCards ?? [], purchases: backup.purchases ?? [] },
    );
    return c.json({
      specializations: backup.specializations.length,
      events: backup.events.length,
      questRuns: backup.questRuns?.length ?? 0,
      goldEvents: backup.goldEvents?.length ?? 0,
      purchases: backup.purchases?.length ?? 0,
    });
  });

  return app;
}
