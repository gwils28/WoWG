/* eslint-disable @typescript-eslint/no-explicit-any -- réponses JSON inspectées librement */
import { copyFileSync, mkdirSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { DatabaseSync } from 'node:sqlite';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createApp } from '../src/app';
import { MIGRATIONS, openDb } from '../src/db';

const FIXTURE = new URL('../../../packages/shared/test/fixtures/sample.json', import.meta.url);
const SPEC = 'course-a-pied';

let treesDir: string;
let app: ReturnType<typeof createApp>;
let clock: string;

async function call(method: string, path: string, body?: unknown, target = app) {
  const res = await target.request(`/api${path}`, {
    method,
    headers: { 'content-type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  return { status: res.status, body: (await res.json()) as any };
}

const addRank = (talentId: string) =>
  call('POST', `/specializations/${SPEC}/talents/${talentId}/ranks`);
const ranks = async () => (await call('GET', `/specializations/${SPEC}`)).body.ranks;
const quests = async () => (await call('GET', '/quests')).body;
const accept = (questId: string, extra: object = {}) =>
  call('POST', '/quests/accept', { source: 'tree', specializationId: SPEC, questId, ...extra });
const tick = (runId: number, occurredAt?: string) =>
  call('POST', `/quest-runs/${runId}/ticks`, occurredAt ? { occurredAt } : undefined);
const complete = (runId: number, body?: object) =>
  call('POST', `/quest-runs/${runId}/complete`, body);
const checkAllSteps = async (runId: number, count: number) => {
  for (let i = 0; i < count; i++)
    await call('PUT', `/quest-runs/${runId}/steps/${i}`, { done: true });
};

beforeEach(async () => {
  treesDir = mkdtempSync(join(tmpdir(), 'wowg-trees-'));
  mkdirSync(join(treesDir, 'sport-sante'));
  copyFileSync(FIXTURE, join(treesDir, 'sport-sante', 'course-a-pied.json'));
  clock = '2026-11-19T10:00:00.000Z'; // jeudi
  app = createApp({ db: openDb(':memory:'), treesDir, now: () => new Date(clock) });
  await call('POST', '/import/apply', { path: 'sport-sante/course-a-pied.json' });
});

afterEach(() => rmSync(treesDir, { recursive: true, force: true }));

describe('quêtes disponibles et acceptation', () => {
  it('liste les quêtes proposées disponibles, sans or ni suivi au départ', async () => {
    const q = await quests();
    expect(q.gold).toBe(0);
    expect(q.active).toEqual([]);
    expect(q.available.map((o: any) => o.questId)).toEqual(['sorties-regulieres']);
    expect(q.available[0]).toMatchObject({
      source: 'tree',
      specializationId: SPEC,
      gold: 4,
      recurrence: { times: 3, per: 'week', periods: 4 },
      origin: { specialization: { id: SPEC } },
    });
    expect(q.available[0].talents[0]).toMatchObject({
      talentId: 'endurance',
      name: 'Endurance de base',
      rank: 0,
      maxRank: 3,
      exists: true,
    });
    expect(q.available[0].talents[0].nextCriterion).toEqual(expect.any(String));
  });

  it('accepte une quête : échéance proposée, or figé, plus de doublon', async () => {
    const res = await accept('sorties-regulieres');
    expect(res.status).toBe(201);
    expect(res.body).toMatchObject({
      status: 'active',
      gold: 4,
      acceptedAt: clock,
      deadline: '2026-12-13',
      overdue: false,
      progress: { ready: false, recurrence: { successfulPeriods: 0, requiredPeriods: 4 } },
    });
    expect((await accept('sorties-regulieres')).status).toBe(409);
    const q = await quests();
    expect(q.active).toHaveLength(1);
    expect(q.available).toEqual([]);
  });

  it("échéance choisie ou absente à l'acceptation, modifiable ensuite", async () => {
    const run = (await accept('sorties-regulieres', { deadline: null })).body;
    expect(run.deadline).toBeNull();
    const patched = await call('PATCH', `/quest-runs/${run.id}`, { deadline: '2026-11-18' });
    expect(patched.body).toMatchObject({ deadline: '2026-11-18', overdue: true });
  });

  it('refuse une quête verrouillée ou inconnue', async () => {
    const locked = await accept('seance-piste');
    expect(locked.status).toBe(409);
    expect(locked.body.errors[0]).toBe(
      '"Séance sur piste" n\'est pas disponible : talent(s) verrouillé(s) : Fractionné',
    );
    expect((await accept('inconnue')).status).toBe(404);
    expect(
      (
        await call('POST', '/quests/accept', {
          source: 'tree',
          specializationId: 'x',
          questId: 'y',
        })
      ).status,
    ).toBe(404);
  });

  it("donne l'état des quêtes d'un arbre pour les marqueurs", async () => {
    const states = async () => (await call('GET', `/specializations/${SPEC}`)).body.questStates;
    expect((await states()).map((s: any) => [s.id, s.state])).toEqual([
      ['sorties-regulieres', 'available'],
      ['seance-piste', 'unavailable'],
      ['preparer-le-semi', 'unavailable'],
    ]);
    await addRank('endurance');
    await addRank('endurance');
    const run = (await accept('seance-piste')).body;
    expect((await states())[1]).toMatchObject({
      state: 'active',
      runId: run.id,
      talents: ['fractionne'],
    });
    await checkAllSteps(run.id, 3);
    expect((await states())[1].state).toBe('ready');
  });
});

describe('classe archivée', () => {
  const archive = (archived: boolean) => call('PUT', '/domains/sport-sante/archive', { archived });

  it('ses quêtes ne sont plus proposées ni acceptées', async () => {
    await archive(true);
    expect((await quests()).available).toEqual([]);
    expect((await accept('sorties-regulieres')).status).toBe(409);
    await archive(false);
    expect((await accept('sorties-regulieres')).status).toBe(201);
  });

  it('un suivi en cours ne se rend plus tant que la classe est archivée', async () => {
    await addRank('endurance');
    await addRank('endurance');
    const run = (await accept('seance-piste')).body;
    await checkAllSteps(run.id, 3);
    await archive(true);
    expect((await complete(run.id)).status).toBe(409);
    await archive(false);
    expect((await complete(run.id)).status).toBe(200);
  });
});

describe('progression et rendu', () => {
  it('étapes : rendu refusé tant que tout n’est pas coché, puis rangs et or', async () => {
    await addRank('endurance');
    await addRank('endurance');
    const run = (await accept('seance-piste')).body;
    expect(
      (await call('PUT', `/quest-runs/${run.id}/steps/0`, { done: true })).body.stepsDone,
    ).toEqual([0]);
    expect((await call('PUT', `/quest-runs/${run.id}/steps/9`, { done: true })).status).toBe(404);
    expect((await complete(run.id)).status).toBe(409);

    await checkAllSteps(run.id, 3);
    const unchecked = await call('PUT', `/quest-runs/${run.id}/steps/1`, { done: false });
    expect(unchecked.body.stepsDone).toEqual([0, 2]);
    await call('PUT', `/quest-runs/${run.id}/steps/1`, { done: true });

    const done = await complete(run.id, { note: 'piste du stade', occurredAt: '2026-11-20' });
    expect(done.status).toBe(200);
    expect(done.body).toMatchObject({
      gold: 2,
      skipped: [],
      run: {
        status: 'completed',
        completedAt: '2026-11-20T00:00:00.000Z',
        grants: [{ specializationId: SPEC, talentId: 'fractionne' }],
        note: 'piste du stade',
      },
    });
    expect(await ranks()).toMatchObject({ fractionne: 1 });

    // recherche par run (pas journal[0]) : le tri par date dépend de l'horloge
    const journal = (await call('GET', '/journal')).body;
    expect(journal.find((e: any) => e.questRunId === run.id)).toMatchObject({
      talentId: 'fractionne',
      questRunId: run.id,
      questName: 'Séance sur piste',
      note: 'piste du stade',
    });
    const gold = (await call('GET', '/gold')).body;
    expect(gold).toMatchObject({
      balance: 2,
      events: [{ amount: 2, reason: 'quest', questName: 'Séance sur piste' }],
    });
    expect((await call('GET', '/character')).body.gold).toBe(2);

    // une fois par rang : de nouveau disponible tant que Fractionné n'est pas au max
    const q = await quests();
    expect(q.completed.map((r: any) => r.id)).toEqual([run.id]);
    expect(q.available.map((o: any) => o.questId)).toContain('seance-piste');
    expect((await complete(run.id)).status).toBe(409);
  });

  it('rythme : occurrences par semaine, retard sans pénalité', async () => {
    await call('POST', `/specializations/${SPEC}/talents/endurance/ranks`);
    const run = (await accept('sorties-regulieres')).body;
    const before = await tick(run.id, '2026-11-15');
    expect(before.status).toBe(400);
    expect(before.body.errors[0]).toMatch(/antérieure à la période d'acceptation/);

    const days = [
      '2026-11-16',
      '2026-11-19',
      '2026-11-21',
      '2026-11-24',
      '2026-11-26',
      '2026-11-28',
    ];
    for (const d of days) await tick(run.id, d);
    let state = (await tick(run.id, '2026-12-01')).body;
    expect(state.progress.recurrence).toMatchObject({ successfulPeriods: 2, requiredPeriods: 4 });
    expect(state.ticks).toHaveLength(7);

    // retirer une occurrence
    state = (await call('DELETE', `/quest-runs/${run.id}/ticks/${state.ticks[0].id}`)).body;
    expect(state.progress.recurrence.successfulPeriods).toBe(1);
    await tick(run.id, '2026-11-17');

    for (const d of ['2026-12-03', '2026-12-05', '2026-12-08', '2026-12-10', '2026-12-12']) {
      await tick(run.id, d);
    }
    clock = '2026-12-20T09:00:00.000Z';
    const q = await quests();
    expect(q.active[0]).toMatchObject({ overdue: true, progress: { ready: true } });

    const done = await complete(run.id);
    expect(done.status).toBe(200);
    expect(done.body.gold).toBe(4);
    expect(await ranks()).toMatchObject({ endurance: 2 });
  });

  it("refuse une occurrence sur une quête sans rythme, ou sur un suivi qui n'est plus en cours", async () => {
    await addRank('endurance');
    await addRank('endurance');
    const run = (await accept('seance-piste')).body;
    expect((await tick(run.id)).status).toBe(409);
    await call('POST', `/quest-runs/${run.id}/abandon`);
    const res = await call('PUT', `/quest-runs/${run.id}/steps/0`, { done: true });
    expect(res.status).toBe(409);
    expect(res.body.errors[0]).toBe("cette quête n'est pas en cours (état : abandonnée)");
    expect((await call('POST', '/quest-runs/999/abandon')).status).toBe(404);
  });

  it('abandon : sans effet, la quête peut être reprise à neuf', async () => {
    const run = (await accept('sorties-regulieres')).body;
    await tick(run.id);
    const abandoned = await call('POST', `/quest-runs/${run.id}/abandon`);
    expect(abandoned.body.status).toBe('abandoned');
    const again = await accept('sorties-regulieres');
    expect(again.status).toBe(201);
    expect(again.body.ticks).toEqual([]);
    expect((await quests()).gold).toBe(0);
  });

  it('ignore un talent déjà au max au moment du rendu, l’or reste dû', async () => {
    await addRank('endurance');
    await addRank('endurance');
    await addRank('cadence');
    expect((await accept('preparer-le-semi')).status).toBe(409); // Semi-marathon verrouillé
    await addRank('fractionne');
    await addRank('fractionne');
    const r = await accept('preparer-le-semi');
    expect(r.status).toBe(201);
    await addRank('recuperation'); // maxé avant le rendu
    const done = await complete(r.body.id);
    expect(done.body.skipped).toEqual([
      {
        ref: { specializationId: SPEC, talentId: 'recuperation' },
        reason: '"Récupération" est déjà au rang max',
      },
    ]);
    expect(done.body.gold).toBe(5);
    expect(await ranks()).toMatchObject({ 'semi-marathon': 1 });
  });
});

describe("annulation d'un rendu", () => {
  it('retire rangs et or, et remet la quête en cours', async () => {
    const run = (await accept('sorties-regulieres', { deadline: null })).body;
    for (const d of ['16', '17', '18', '23', '24', '25', '30']) await tick(run.id, `2026-11-${d}`);
    for (const d of ['01', '02', '07', '08', '09']) await tick(run.id, `2026-12-${d}`);
    clock = '2026-12-10T10:00:00.000Z';
    expect((await complete(run.id)).status).toBe(200);
    expect(await ranks()).toMatchObject({ endurance: 1 });

    const undone = await call('POST', `/quest-runs/${run.id}/undo`);
    expect(undone.status).toBe(200);
    expect(undone.body).toMatchObject({
      gold: 0,
      run: { status: 'active', completedAt: null, grants: null, progress: { ready: true } },
    });
    expect(await ranks()).toMatchObject({ endurance: 0 });
    const gold = (await call('GET', '/gold')).body.events.map((e: any) => [e.amount, e.reason]);
    expect(gold).toEqual([
      [-4, 'quest-undo'],
      [4, 'quest'],
    ]);
    expect((await call('POST', `/quest-runs/${run.id}/undo`)).status).toBe(409);
  });

  it('refusée si un enfant dépend du rang accordé', async () => {
    await addRank('endurance');
    const cq = (
      await call('POST', '/custom-quests', {
        name: 'Sortie longue',
        talents: [{ specializationId: SPEC, talentId: 'endurance' }],
      })
    ).body;
    const run = (
      await call('POST', '/quests/accept', { source: 'custom', customQuestId: cq.customQuestId })
    ).body;
    await complete(run.id);
    await addRank('fractionne'); // demande Endurance 2
    const res = await call('POST', `/quest-runs/${run.id}/undo`);
    expect(res.status).toBe(409);
    expect(res.body.errors[0]).toBe('impossible : "Fractionné" dépend(ent) de ce rang');
  });

  it('refusée si la même quête a été reprise entre-temps', async () => {
    await addRank('endurance');
    await addRank('endurance');
    const run = (await accept('seance-piste')).body;
    await checkAllSteps(run.id, 3);
    await complete(run.id);
    expect((await accept('seance-piste')).status).toBe(201);
    expect((await call('POST', `/quest-runs/${run.id}/undo`)).status).toBe(409);
  });
});

describe('quêtes personnelles', () => {
  it('or seul : se rend sans rang et se refait à volonté', async () => {
    const created = await call('POST', '/custom-quests', {
      name: 'Ranger le garage',
      size: 'medium',
    });
    expect(created.status).toBe(201);
    expect(created.body).toMatchObject({ source: 'custom', gold: 2, talents: [], description: '' });
    const id = created.body.customQuestId;

    const run = (await call('POST', '/quests/accept', { source: 'custom', customQuestId: id }))
      .body;
    expect(run).toMatchObject({ source: 'custom', customQuestId: id, deadline: null, gold: 2 });
    expect(
      (await call('POST', '/quests/accept', { source: 'custom', customQuestId: id })).status,
    ).toBe(409);
    expect((await complete(run.id)).body.gold).toBe(2);
    expect(await ranks()).toEqual({});
    expect((await quests()).available.some((o: any) => o.customQuestId === id)).toBe(true);
  });

  it('valide la quête et ses talents', async () => {
    expect((await call('POST', '/custom-quests', { name: 'Sans taille' })).status).toBe(400);
    const res = await call('POST', '/custom-quests', {
      name: 'Fantôme',
      talents: [{ specializationId: SPEC, talentId: 'inconnu' }],
    });
    expect(res.status).toBe(400);
    expect(res.body.errors).toEqual(['talent "course-a-pied/inconnu" inconnu']);
  });

  it('modification et suppression ne touchent pas un suivi en cours', async () => {
    const id = (
      await call('POST', '/custom-quests', { name: 'Lire', size: 'small', steps: ['a', 'b'] })
    ).body.customQuestId;
    const run = (await call('POST', '/quests/accept', { source: 'custom', customQuestId: id }))
      .body;
    const edited = await call('PUT', `/custom-quests/${id}`, {
      name: 'Lire un livre',
      size: 'large',
    });
    expect(edited.body).toMatchObject({ name: 'Lire un livre', gold: 4 });
    expect((await call('DELETE', `/custom-quests/${id}`)).status).toBe(200);
    expect((await call('PUT', `/custom-quests/${id}`, { name: 'x', size: 'small' })).status).toBe(
      404,
    );

    const active = (await quests()).active[0];
    expect(active).toMatchObject({
      id: run.id,
      definition: { name: 'Lire', steps: ['a', 'b'] },
      gold: 1,
    });
    await checkAllSteps(run.id, 2);
    expect((await complete(run.id)).body.gold).toBe(1);
  });

  it('refuse le rendu si un talent récompensé est verrouillé', async () => {
    const cq = (
      await call('POST', '/custom-quests', {
        name: 'Semi improvisé',
        talents: [{ specializationId: SPEC, talentId: 'semi-marathon' }],
      })
    ).body;
    const run = (
      await call('POST', '/quests/accept', { source: 'custom', customQuestId: cq.customQuestId })
    ).body;
    const res = await complete(run.id);
    expect(res.status).toBe(409);
    expect(res.body.errors[0]).toMatch(/^Semi-marathon : prérequis manquants/);
    expect((await quests()).gold).toBe(0);
  });
});

describe('sauvegarde et migration', () => {
  async function seed() {
    await addRank('endurance');
    await addRank('endurance');
    const run = (await accept('seance-piste')).body;
    await checkAllSteps(run.id, 3);
    await complete(run.id);
    const id = (await call('POST', '/custom-quests', { name: 'Ranger', size: 'small' })).body
      .customQuestId;
    await call('POST', '/quests/accept', { source: 'custom', customQuestId: id });
    await accept('sorties-regulieres').then((r) => tick(r.body.id));
  }

  it('sauvegarde et restaure quêtes, suivis, occurrences et or', async () => {
    await seed();
    const backup = (await call('GET', '/backup')).body;
    expect(backup.questRuns).toHaveLength(3);
    expect(backup.questTicks).toHaveLength(1);
    expect(backup.goldEvents).toHaveLength(1);
    expect(backup.customQuests).toHaveLength(1);

    const fresh = createApp({ db: openDb(':memory:'), treesDir, now: () => new Date(clock) });
    const res = await call('POST', '/backup', backup, fresh);
    expect(res.body).toMatchObject({ questRuns: 3, goldEvents: 1 });
    expect((await call('GET', '/quests', undefined, fresh)).body).toEqual(await quests());
    const journal = (await call('GET', '/journal', undefined, fresh)).body;
    expect(journal.find((e: any) => e.questRunId !== null)?.questName).toBe('Séance sur piste');
  });

  it('restaure une sauvegarde antérieure aux quêtes, refuse un suivi manquant', async () => {
    await seed();
    const backup = (await call('GET', '/backup')).body;
    const old = structuredClone(backup);
    for (const k of ['customQuests', 'questRuns', 'questTicks', 'goldEvents']) delete old[k];
    for (const e of old.events) delete e.questRunId;
    expect((await call('POST', '/backup', old)).status).toBe(200);
    expect((await quests()).gold).toBe(0);

    backup.questRuns = backup.questRuns.slice(1);
    const res = await call('POST', '/backup', backup);
    expect(res.status).toBe(400);
    expect(res.body.errors[0]).toMatch(/suivi de quête absent/);
  });

  it('migre une base existante sans perdre la progression', () => {
    const path = join(treesDir, 'v2.sqlite');
    const legacy = new DatabaseSync(path);
    legacy.exec(MIGRATIONS[0]! + MIGRATIONS[1]! + 'PRAGMA user_version = 2;');
    legacy.exec(
      `INSERT INTO specializations (id, domain_id, definition, source_path, imported_at, updated_at)
       VALUES ('x', 'd', '{}', NULL, 'a', 'a')`,
    );
    legacy
      .prepare(
        `INSERT INTO rank_events (specialization_id, talent_id, delta, occurred_at, note, created_at)
         VALUES ('x', 'y', 1, 'a', NULL, 'b')`,
      )
      .run();
    legacy.close();
    const db = openDb(path);
    expect(db.prepare('PRAGMA user_version').get()).toEqual({ user_version: MIGRATIONS.length });
    expect(db.prepare('SELECT talent_id, quest_run_id FROM rank_events').all()).toEqual([
      { talent_id: 'y', quest_run_id: null },
    ]);
    db.close();
    expect(readFileSync(path).length).toBeGreaterThan(0);
  });
});
