import { Hono, type Context } from 'hono';
import { HTTPException } from 'hono/http-exception';
import { z } from 'zod';
import {
  canAddRank,
  canRemoveRank,
  diffTrees,
  formatIssues,
  parseTree,
  TreeFileStructureSchema,
  type TreeFile,
} from '@wowg/shared';
import type { Db } from './db';
import { createRepository } from './repository';
import {
  canonicalTreePath,
  listTreeFiles,
  PathError,
  readTreeFile,
  writeTreeFile,
} from './tree-files';
import { character, specDetail, specSummary } from './views';

export interface AppOptions {
  db: Db;
  treesDir: string;
}

const RankBody = z.object({
  note: z.string().trim().max(2000).optional(),
  occurredAt: z.union([z.iso.date(), z.iso.datetime({ offset: true })]).optional(),
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

const BackupSchema = z.object({
  format: z.literal('wowg-backup'),
  version: z.literal(1),
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
    }),
  ),
});

function badRequest(errors: string[]): never {
  throw new HTTPException(400, { res: Response.json({ errors }, { status: 400 }) });
}

async function readBody<T extends z.ZodType>(
  c: Context,
  schema: T,
  optional = false,
): Promise<z.infer<T>> {
  let raw: unknown = {};
  const text = await c.req.text();
  if (text.trim()) {
    try {
      raw = JSON.parse(text);
    } catch {
      badRequest(['corps JSON invalide']);
    }
  } else if (!optional) {
    badRequest(['corps JSON attendu']);
  }
  const res = schema.safeParse(raw);
  if (!res.success) badRequest(formatIssues(res.error));
  return res.data;
}

const toIso = (d?: string) => (d ? new Date(d).toISOString() : undefined);

export function createApp({ db, treesDir }: AppOptions) {
  const repo = createRepository(db);
  const app = new Hono().basePath('/api');

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

  app.get('/character', (c) => c.json(character(repo)));

  app.get('/specializations', (c) =>
    c.json(repo.listSpecializations().map((s) => specSummary(s, repo.ranks(s.id)))),
  );

  app.get('/specializations/:id', (c) => {
    const spec = requireSpec(c.req.param('id'));
    return c.json(specDetail(spec, repo.ranks(spec.id)));
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
    const diff = diffTrees(existing?.tree ?? null, tree, existing ? repo.ranks(existing.id) : {});
    return c.json({ tree, diff, targetPath: body.path ?? canonicalTreePath(tree) });
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
    repo.replaceAll(
      backup.specializations.map((s) => ({ ...s, id: s.tree.specialization.id })),
      backup.events,
    );
    return c.json({ specializations: backup.specializations.length, events: backup.events.length });
  });

  return app;
}
