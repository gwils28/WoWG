import type { Hono } from 'hono';
import { z } from 'zod';
import {
  canUndoTurnIn,
  CustomQuestSchema,
  customQuestDefinition,
  dayOf,
  findTalent,
  isOverdue,
  periodKey,
  planTurnIn,
  questGold,
  questProgress,
  suggestedDeadline,
  treeQuestAvailability,
  treeQuestDefinition,
  weeklyTurnInCheck,
  type CustomQuest,
  type QuestDefinition,
  type QuestTalentRef,
  type TreeContext,
  type TreeLookup,
} from '@wowg/shared';
import { transaction, type Db } from './db';
import { badRequest, conflict, DateInput, notFound, readBody, toIso } from './http';
import { createMarketRepository } from './market-repository';
import {
  createQuestRepository,
  type QuestRepository,
  type StoredCustomQuest,
  type StoredQuestRun,
} from './quest-repository';
import type { Repository, StoredSpecialization } from './repository';

const deadline = z.iso.date().nullable().optional();

const AcceptBody = z.discriminatedUnion('source', [
  z.object({
    source: z.literal('tree'),
    specializationId: z.string().min(1),
    questId: z.string().min(1),
    deadline,
  }),
  z.object({ source: z.literal('custom'), customQuestId: z.number().int(), deadline }),
]);

const PatchRunBody = z.object({ deadline: z.iso.date().nullable() });
const StepBody = z.object({ done: z.boolean() });
const TickBody = z.object({ occurredAt: DateInput.optional() });
const CompleteBody = z.object({
  note: z.string().trim().max(2000).optional(),
  occurredAt: DateInput.optional(),
});

/** Arbres et rangs courants, lus une fois par requête. */
export function treeLookup(repo: Repository): TreeLookup {
  const cache = new Map<string, TreeContext | undefined>();
  return (id) => {
    if (!cache.has(id)) {
      const spec = repo.getSpecialization(id);
      cache.set(id, spec ? { tree: spec.tree, ranks: repo.ranks(id) } : undefined);
    }
    return cache.get(id);
  };
}

function talentView(ref: QuestTalentRef, lookup: TreeLookup) {
  const ctx = lookup(ref.specializationId);
  const talent = ctx && findTalent(ctx.tree, ref.talentId);
  const rank = ctx?.ranks[ref.talentId] ?? 0;
  return {
    ...ref,
    exists: !!talent,
    name: talent?.name ?? ref.talentId,
    icon: talent?.icon ?? null,
    rank,
    maxRank: talent?.maxRank ?? null,
    /** Critère du prochain rang, rappelé au rendu. */
    nextCriterion: talent && rank < talent.maxRank ? (talent.ranks[rank] ?? null) : null,
    specializationName: ctx?.tree.specialization.name ?? ref.specializationId,
  };
}

function definitionView(def: QuestDefinition, lookup: TreeLookup) {
  return { ...def, talents: def.talents.map((t) => talentView(t, lookup)) };
}

function specOf(spec: StoredSpecialization | null | undefined) {
  return spec ? { domain: spec.tree.domain, specialization: spec.tree.specialization } : null;
}

export function createQuestViews(repo: Repository, questRepo: QuestRepository) {
  function runView(run: StoredQuestRun, lookup: TreeLookup, now: string) {
    const ticks = questRepo.listTicks(run.id);
    const progress = questProgress(run.definition, run, ticks, now);
    return {
      ...run,
      definition: definitionView(run.definition, lookup),
      ticks: ticks.map(({ id, occurredAt }) => ({ id, occurredAt })),
      progress,
      overdue: run.status === 'active' && isOverdue(run.deadline, now),
      origin: run.specializationId ? specOf(repo.getSpecialization(run.specializationId)) : null,
    };
  }

  function treeOffer(spec: StoredSpecialization, questId: string, lookup: TreeLookup) {
    const quest = spec.tree.quests!.find((q) => q.id === questId)!;
    const def = treeQuestDefinition(spec.id, quest);
    return {
      source: 'tree' as const,
      specializationId: spec.id,
      questId,
      ...definitionView(def, lookup),
      gold: questGold(def, lookup),
      origin: specOf(spec),
    };
  }

  function customView(cq: StoredCustomQuest, lookup: TreeLookup) {
    const def = customQuestDefinition(cq.quest);
    return {
      source: 'custom' as const,
      customQuestId: cq.id,
      ...definitionView(def, lookup),
      gold: questGold(def, lookup),
      createdAt: cq.createdAt,
      updatedAt: cq.updatedAt,
    };
  }

  /** État des quêtes proposées d'un arbre, pour les marqueurs « ! » et « ? ». */
  function treeQuestStates(spec: StoredSpecialization, now: string) {
    const ranks = repo.ranks(spec.id);
    const active = new Map(
      questRepo
        .listRuns('active')
        .filter((r) => r.source === 'tree' && r.specializationId === spec.id)
        .map((r) => [r.questId, r]),
    );
    return (spec.tree.quests ?? []).map((quest) => {
      const run = active.get(quest.id);
      if (run) {
        const ready = questProgress(run.definition, run, questRepo.listTicks(run.id), now).ready;
        return {
          id: quest.id,
          talents: quest.talents,
          state: ready ? 'ready' : 'active',
          runId: run.id,
        };
      }
      const check = treeQuestAvailability(spec.tree, ranks, quest);
      return check.ok
        ? { id: quest.id, talents: quest.talents, state: 'available', runId: null }
        : {
            id: quest.id,
            talents: quest.talents,
            state: 'unavailable',
            runId: null,
            reason: check.reason,
          };
    });
  }

  return { runView, treeOffer, customView, treeQuestStates };
}

export function registerQuestRoutes(
  app: Hono,
  { db, repo, now }: { db: Db; repo: Repository; now: () => string },
) {
  const questRepo = createQuestRepository(db);
  const views = createQuestViews(repo, questRepo);

  const requireRun = (raw: string, status?: StoredQuestRun['status']) => {
    const run = questRepo.getRun(Number(raw));
    if (!run) notFound(`suivi de quête "${raw}" inconnu`);
    if (status && run.status !== status) {
      const label = { active: 'en cours', completed: 'rendue', abandoned: 'abandonnée' };
      conflict(`cette quête n'est pas ${label[status]} (état : ${label[run.status]})`);
    }
    return run;
  };

  const requireCustom = (raw: string | number) => {
    const cq = questRepo.getCustomQuest(Number(raw));
    if (!cq) notFound(`quête personnelle "${raw}" inconnue`);
    return cq;
  };

  /** Talents référencés par une quête personnelle : ils doivent exister. */
  const checkCustomTalents = (quest: CustomQuest) => {
    const lookup = treeLookup(repo);
    const unknown = quest.talents.filter((t) => {
      const ctx = lookup(t.specializationId);
      return !ctx || !findTalent(ctx.tree, t.talentId);
    });
    if (unknown.length > 0) {
      badRequest(unknown.map((t) => `talent "${t.specializationId}/${t.talentId}" inconnu`));
    }
  };

  const activeRunOf = (
    run: Pick<StoredQuestRun, 'source' | 'specializationId' | 'questId' | 'customQuestId'>,
  ) =>
    questRepo
      .listRuns('active')
      .find((r) =>
        run.source === 'tree'
          ? r.source === 'tree' &&
            r.specializationId === run.specializationId &&
            r.questId === run.questId
          : r.source === 'custom' && r.customQuestId === run.customQuestId,
      );

  const runResponse = (run: StoredQuestRun) =>
    views.runView(questRepo.getRun(run.id)!, treeLookup(repo), now());

  app.get('/quests', (c) => {
    const lookup = treeLookup(repo);
    const at = now();
    const runs = questRepo.listRuns();
    const activeTree = new Set(
      runs
        .filter((r) => r.status === 'active' && r.source === 'tree')
        .map((r) => `${r.specializationId}/${r.questId}`),
    );
    const activeCustom = new Set(
      runs
        .filter((r) => r.status === 'active' && r.source === 'custom')
        .map((r) => r.customQuestId),
    );
    const customQuests = questRepo.listCustomQuests();

    const available = [
      ...repo.listSpecializations().flatMap((spec) =>
        (spec.tree.quests ?? [])
          .filter((q) => !activeTree.has(`${spec.id}/${q.id}`))
          .filter((q) => treeQuestAvailability(spec.tree, lookup(spec.id)!.ranks, q).ok)
          .map((q) => views.treeOffer(spec, q.id, lookup)),
      ),
      ...customQuests
        .filter((cq) => !activeCustom.has(cq.id))
        .map((cq) => views.customView(cq, lookup)),
    ];

    return c.json({
      gold: questRepo.goldBalance(),
      active: runs.filter((r) => r.status === 'active').map((r) => views.runView(r, lookup, at)),
      available,
      completed: runs
        .filter((r) => r.status === 'completed')
        .sort((a, b) => (b.completedAt ?? '').localeCompare(a.completedAt ?? '') || b.id - a.id)
        .map((r) => views.runView(r, lookup, at)),
      custom: customQuests.map((cq) => views.customView(cq, lookup)),
    });
  });

  app.post('/quests/accept', async (c) => {
    const body = await readBody(c, AcceptBody);
    const lookup = treeLookup(repo);
    const acceptedAt = now();
    let def: QuestDefinition;
    let origin: { specializationId?: string; questId?: string; customQuestId?: number };

    if (body.source === 'tree') {
      const spec = repo.getSpecialization(body.specializationId);
      if (!spec) notFound(`spécialisation "${body.specializationId}" inconnue`);
      const quest = spec.tree.quests?.find((q) => q.id === body.questId);
      if (!quest) notFound(`quête "${body.questId}" inconnue dans "${spec.id}"`);
      if (
        activeRunOf({
          source: 'tree',
          specializationId: spec.id,
          questId: quest.id,
          customQuestId: null,
        })
      ) {
        conflict(`"${quest.name}" est déjà en cours`);
      }
      const check = treeQuestAvailability(spec.tree, lookup(spec.id)!.ranks, quest);
      if (!check.ok) conflict(`"${quest.name}" n'est pas disponible : ${check.reason}`);
      def = treeQuestDefinition(spec.id, quest);
      origin = { specializationId: spec.id, questId: quest.id };
    } else {
      const cq = requireCustom(body.customQuestId);
      if (
        activeRunOf({
          source: 'custom',
          specializationId: null,
          questId: null,
          customQuestId: cq.id,
        })
      ) {
        conflict(`"${cq.quest.name}" est déjà en cours`);
      }
      def = customQuestDefinition(cq.quest);
      origin = { customQuestId: cq.id };
    }

    const run = questRepo.createRun({
      source: body.source,
      ...origin,
      definition: def,
      gold: questGold(def, lookup),
      acceptedAt,
      deadline:
        body.deadline !== undefined
          ? body.deadline
          : def.recurrence
            ? suggestedDeadline(def.recurrence, acceptedAt)
            : null,
    });
    return c.json(views.runView(run, lookup, acceptedAt), 201);
  });

  app.patch('/quest-runs/:id', async (c) => {
    const run = requireRun(c.req.param('id'), 'active');
    const body = await readBody(c, PatchRunBody);
    return c.json(runResponse(questRepo.updateRun(run.id, { deadline: body.deadline })));
  });

  app.put('/quest-runs/:id/steps/:index', async (c) => {
    const run = requireRun(c.req.param('id'), 'active');
    const index = Number(c.req.param('index'));
    if (!Number.isInteger(index) || index < 0 || index >= run.definition.steps.length) {
      notFound(`étape ${c.req.param('index')} inconnue`);
    }
    const { done } = await readBody(c, StepBody);
    const others = run.stepsDone.filter((i) => i !== index);
    const stepsDone = done ? [...others, index].sort((a, b) => a - b) : others;
    return c.json(runResponse(questRepo.updateRun(run.id, { stepsDone })));
  });

  app.post('/quest-runs/:id/ticks', async (c) => {
    const run = requireRun(c.req.param('id'), 'active');
    if (!run.definition.recurrence) conflict("cette quête n'a pas de rythme");
    const body = await readBody(c, TickBody, true);
    const occurredAt = toIso(body.occurredAt) ?? now();
    // la période d'acceptation compte en entier (ex. sortie du lundi, quête acceptée le jeudi)
    const per = run.definition.recurrence.per;
    if (periodKey(occurredAt, per) < periodKey(run.acceptedAt, per)) {
      badRequest([`occurrence antérieure à la période d'acceptation (${dayOf(run.acceptedAt)})`]);
    }
    questRepo.addTick(run.id, occurredAt);
    return c.json(runResponse(run), 201);
  });

  app.delete('/quest-runs/:id/ticks/:tickId', (c) => {
    const run = requireRun(c.req.param('id'), 'active');
    const tick = questRepo.getTick(Number(c.req.param('tickId')));
    if (!tick || tick.runId !== run.id) notFound(`occurrence "${c.req.param('tickId')}" inconnue`);
    questRepo.deleteTick(tick.id);
    return c.json(runResponse(run));
  });

  app.post('/quest-runs/:id/complete', async (c) => {
    const run = requireRun(c.req.param('id'), 'active');
    const body = await readBody(c, CompleteBody, true);
    const at = now();
    const lookup = treeLookup(repo);
    const progress = questProgress(run.definition, run, questRepo.listTicks(run.id), at);
    const plan = planTurnIn(run.definition, progress, lookup);
    if (!plan.ok) conflict(plan.reason);
    const occurredAt = toIso(body.occurredAt) ?? at;
    if (run.source === 'custom' && run.customQuestId !== null) {
      // limiteur anti-farm (SPEC 10.3) : un rendu non annulé par semaine ISO
      const done = questRepo
        .listRuns('completed')
        .filter((r) => r.customQuestId === run.customQuestId && r.completedAt)
        .map((r) => r.completedAt!);
      const weekly = weeklyTurnInCheck(done, occurredAt);
      if (!weekly.ok) conflict(weekly.reason);
    }
    const note = body.note || null;

    transaction(db, () => {
      for (const g of plan.grants) {
        repo.addEvent(g.specializationId, {
          talentId: g.talentId,
          delta: 1,
          occurredAt,
          note,
          questRunId: run.id,
        });
      }
      questRepo.addGoldEvent({ amount: run.gold, reason: 'quest', runId: run.id, occurredAt });
      questRepo.updateRun(run.id, {
        status: 'completed',
        completedAt: occurredAt,
        grants: plan.grants,
        note,
      });
    });
    return c.json({
      run: runResponse(run),
      gold: questRepo.goldBalance(),
      skipped: plan.skipped,
    });
  });

  app.post('/quest-runs/:id/abandon', (c) => {
    const run = requireRun(c.req.param('id'), 'active');
    return c.json(runResponse(questRepo.updateRun(run.id, { status: 'abandoned' })));
  });

  app.post('/quest-runs/:id/undo', (c) => {
    const run = requireRun(c.req.param('id'), 'completed');
    if (activeRunOf(run))
      conflict('cette quête est de nouveau en cours : abandonne-la avant d’annuler ce rendu');
    const grants = run.grants ?? [];
    const check = canUndoTurnIn(grants, run.gold, questRepo.goldBalance(), treeLookup(repo));
    if (!check.ok) conflict(check.reason);
    const at = now();

    transaction(db, () => {
      for (const g of grants) {
        repo.addEvent(g.specializationId, {
          talentId: g.talentId,
          delta: -1,
          occurredAt: at,
          questRunId: run.id,
        });
      }
      questRepo.addGoldEvent({
        amount: -run.gold,
        reason: 'quest-undo',
        runId: run.id,
        occurredAt: at,
      });
      questRepo.updateRun(run.id, {
        status: 'active',
        completedAt: null,
        grants: null,
        note: null,
      });
    });
    return c.json({ run: runResponse(run), gold: questRepo.goldBalance() });
  });

  app.post('/custom-quests', async (c) => {
    const quest = await readBody(c, CustomQuestSchema);
    checkCustomTalents(quest);
    return c.json(views.customView(questRepo.createCustomQuest(quest), treeLookup(repo)), 201);
  });

  app.put('/custom-quests/:id', async (c) => {
    const cq = requireCustom(c.req.param('id'));
    const quest = await readBody(c, CustomQuestSchema);
    checkCustomTalents(quest);
    return c.json(views.customView(questRepo.updateCustomQuest(cq.id, quest), treeLookup(repo)));
  });

  app.delete('/custom-quests/:id', (c) => {
    const cq = requireCustom(c.req.param('id'));
    questRepo.deleteCustomQuest(cq.id);
    return c.json({ deleted: cq.id });
  });

  app.get('/gold', (c) => {
    const names = new Map(questRepo.listRuns().map((r) => [r.id, r.definition.name]));
    const purchases = new Map(
      createMarketRepository(db)
        .listPurchases()
        .map((p) => [p.id, p]),
    );
    const purchaseView = (id: number | null) => {
      const p = id === null ? undefined : purchases.get(id);
      return p ? { id: p.id, ...p.snapshot, undone: p.undoneAt !== null } : null;
    };
    const events = questRepo
      .listGoldEvents()
      .map((e) => ({
        ...e,
        questName: e.runId === null ? null : (names.get(e.runId) ?? null),
        purchase: purchaseView(e.purchaseId),
      }))
      .sort((a, b) => b.occurredAt.localeCompare(a.occurredAt) || b.id - a.id);
    return c.json({ balance: questRepo.goldBalance(), events });
  });

  return { questRepo, views };
}
