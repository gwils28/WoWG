/* eslint-disable @typescript-eslint/no-explicit-any -- réponses JSON inspectées librement */
import { copyFileSync, mkdirSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createApp } from '../src/app';
import { openDb } from '../src/db';

const FIXTURE = new URL('../../../packages/shared/test/fixtures/sample.json', import.meta.url);

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

const market = async () => (await call('GET', '/market')).body;
const createCard = async (card: object) => (await call('POST', '/reward-cards', card)).body;
const buy = (id: number, body?: object) => call('POST', `/reward-cards/${id}/purchase`, body);

/** Gagne de l'or en rendant une quête perso sans talent (« large » : 4 or), une fois par semaine. */
async function earn(size: 'small' | 'medium' | 'large' = 'large') {
  const id = (await call('POST', '/custom-quests', { name: `Or ${size}`, size })).body
    .customQuestId;
  const run = (await call('POST', '/quests/accept', { source: 'custom', customQuestId: id })).body;
  return call('POST', `/quest-runs/${run.id}/complete`);
}

beforeEach(async () => {
  treesDir = mkdtempSync(join(tmpdir(), 'wowg-trees-'));
  mkdirSync(join(treesDir, 'sport-sante'));
  copyFileSync(FIXTURE, join(treesDir, 'sport-sante', 'course-a-pied.json'));
  clock = '2026-11-19T10:00:00.000Z'; // jeudi
  app = createApp({ db: openDb(':memory:'), treesDir, now: () => new Date(clock) });
  await call('POST', '/import/apply', { path: 'sport-sante/course-a-pied.json' });
});

afterEach(() => rmSync(treesDir, { recursive: true, force: true }));

describe('limiteur hebdomadaire des quêtes personnelles', () => {
  it('refuse un second rendu la même semaine ISO, accepte le lundi suivant', async () => {
    const id = (await call('POST', '/custom-quests', { name: 'Ranger', size: 'large' })).body
      .customQuestId;
    const accept = async () =>
      (await call('POST', '/quests/accept', { source: 'custom', customQuestId: id })).body.id;
    expect((await call('POST', `/quest-runs/${await accept()}/complete`)).status).toBe(200);

    const second = await accept();
    const refused = await call('POST', `/quest-runs/${second}/complete`);
    expect(refused.status).toBe(409);
    expect(refused.body.errors[0]).toBe(
      'quête personnelle déjà rendue cette semaine, de nouveau possible le lundi 23/11',
    );
    clock = '2026-11-23T08:00:00.000Z';
    expect((await call('POST', `/quest-runs/${second}/complete`)).status).toBe(200);
    expect((await call('GET', '/gold')).body.balance).toBe(8);
  });

  it('un rendu annulé ne compte plus', async () => {
    const id = (await call('POST', '/custom-quests', { name: 'Ranger', size: 'small' })).body
      .customQuestId;
    const run = (await call('POST', '/quests/accept', { source: 'custom', customQuestId: id }))
      .body;
    await call('POST', `/quest-runs/${run.id}/complete`);
    await call('POST', `/quest-runs/${run.id}/undo`);
    expect((await call('POST', `/quest-runs/${run.id}/complete`)).status).toBe(200);
  });
});

describe('cartes', () => {
  it('crée, liste par rareté puis prix, modifie, refuse une carte invalide', async () => {
    await createCard({ name: 'Concert', rarity: 'rare', price: 30, cooldownDays: 30 });
    const cafe = await createCard({
      name: 'Bon café',
      rarity: 'common',
      price: 2,
      cooldownDays: 1,
    });
    await createCard({ name: 'Take five', rarity: 'common', price: 1 });
    expect(cafe).toMatchObject({
      name: 'Bon café',
      description: '',
      unique: false,
      archived: false,
      availability: { ok: false, reason: 'insufficient', missing: 2 },
      lastPurchasedAt: null,
    });
    const m = await market();
    expect(m.cards.map((c: any) => c.name)).toEqual(['Take five', 'Bon café', 'Concert']);
    expect(m).toMatchObject({ balance: 0, weeklyIncome: 0, goal: null, archived: [] });

    const res = await call('PUT', `/reward-cards/${cafe.id}`, {
      name: 'Café de spécialité',
      rarity: 'common',
      price: 3,
    });
    expect(res.body).toMatchObject({ name: 'Café de spécialité', price: 3 });
    expect(
      (await call('POST', '/reward-cards', { name: 'x', rarity: 'rare', price: 0 })).status,
    ).toBe(400);
  });

  it('supprime une carte jamais achetée, refuse si elle a un achat', async () => {
    const a = await createCard({ name: 'A', rarity: 'common', price: 1 });
    const b = await createCard({ name: 'B', rarity: 'common', price: 1 });
    await earn();
    await buy(b.id);
    expect((await call('DELETE', `/reward-cards/${a.id}`)).status).toBe(200);
    const res = await call('DELETE', `/reward-cards/${b.id}`);
    expect(res.status).toBe(409);
    expect(res.body.errors[0]).toMatch(/archive-la/);
  });
});

describe('achats', () => {
  it('achète : débite, journalise, met la carte en recharge', async () => {
    const card = await createCard({
      name: 'Cinéma',
      rarity: 'uncommon',
      price: 3,
      cooldownDays: 7,
    });
    await earn();
    const res = await buy(card.id);
    expect(res.status).toBe(201);
    expect(res.body.gold).toBe(1);
    expect(res.body.purchase).toMatchObject({
      cardId: card.id,
      snapshot: { name: 'Cinéma', rarity: 'uncommon', price: 3 },
      undoneAt: null,
    });
    expect(res.body.card.availability).toEqual({
      ok: false,
      reason: 'cooldown',
      availableOn: '2026-11-26',
      daysLeft: 7,
    });
    const gold = (await call('GET', '/gold')).body;
    expect(gold.events[0]).toMatchObject({
      amount: -3,
      reason: 'purchase',
      purchase: { name: 'Cinéma', price: 3, undone: false },
    });
  });

  it('refuse : solde insuffisant, recharge, carte archivée', async () => {
    const card = await createCard({
      name: 'Cinéma',
      rarity: 'uncommon',
      price: 2,
      cooldownDays: 7,
    });
    let res = await buy(card.id);
    expect(res.status).toBe(409);
    expect(res.body.errors[0]).toBe('solde insuffisant : 0 or, il manque 2 or');

    await earn();
    await buy(card.id);
    res = await buy(card.id);
    expect(res.status).toBe(409);
    expect(res.body.errors[0]).toBe('carte en recharge : de nouveau achetable dans 7 jour(s)');

    clock = '2026-11-26T00:00:00.000Z';
    await call('PUT', `/reward-cards/${card.id}/archive`, { archived: true });
    res = await buy(card.id);
    expect(res.status).toBe(409);
    expect(res.body.errors[0]).toMatch(/archivée/);
    await call('PUT', `/reward-cards/${card.id}/archive`, { archived: false });
    expect((await buy(card.id)).status).toBe(201);
  });

  it('solde exactement égal au prix : accepté, date d’achat modifiable', async () => {
    const card = await createCard({ name: 'Snack', rarity: 'common', price: 4 });
    await earn();
    const res = await buy(card.id, { occurredAt: '2026-11-18' });
    expect(res.status).toBe(201);
    expect(res.body.purchase.purchasedAt).toBe('2026-11-18T00:00:00.000Z');
    expect(res.body.gold).toBe(0);
  });

  it('achat unique : archive la carte et la retire de l’objectif ; annuler la réactive', async () => {
    const card = await createCard({ name: 'Casque', rarity: 'epic', price: 4, unique: true });
    await call('PUT', '/market/goal', { cardId: card.id });
    await earn();
    const { purchase } = (await buy(card.id)).body;
    let m = await market();
    expect(m.cards).toEqual([]);
    expect(m.archived.map((c: any) => c.name)).toEqual(['Casque']);
    expect(m.goal).toBeNull();

    const undo = await call('POST', `/purchases/${purchase.id}/undo`);
    expect(undo.status).toBe(200);
    expect(undo.body.gold).toBe(4);
    m = await market();
    expect(m.cards[0]).toMatchObject({
      name: 'Casque',
      archived: false,
      availability: { ok: true },
    });

    const again = await call('POST', `/purchases/${purchase.id}/undo`);
    expect(again.status).toBe(409);
    const gold = (await call('GET', '/gold')).body;
    expect(gold.events[0]).toMatchObject({ amount: 4, reason: 'purchase-undo' });
    expect(gold.events[1].purchase.undone).toBe(true);
  });

  it('un achat annulé ne compte pas pour la recharge', async () => {
    const card = await createCard({ name: 'Bière', rarity: 'common', price: 1, cooldownDays: 2 });
    await earn();
    const { purchase } = (await buy(card.id)).body;
    await call('POST', `/purchases/${purchase.id}/undo`);
    expect((await buy(card.id)).status).toBe(201);
  });

  it('annuler un rendu reste refusé si l’or a été dépensé', async () => {
    const card = await createCard({ name: 'Bière', rarity: 'common', price: 3 });
    const res = await earn();
    await buy(card.id);
    const undo = await call('POST', `/quest-runs/${res.body.run.id}/undo`);
    expect(undo.status).toBe(409);
    expect(undo.body.errors[0]).toMatch(/solde d'or insuffisant/);
  });
});

describe("objectif d'épargne", () => {
  it('épingle une carte et estime les semaines restantes au rythme récent', async () => {
    const card = await createCard({ name: 'Vélo', rarity: 'legendary', price: 20, unique: true });
    expect((await call('PUT', '/market/goal', { cardId: card.id })).status).toBe(200);
    let m = await market();
    expect(m.goal).toMatchObject({ cardId: card.id, name: 'Vélo', price: 20, weeksLeft: null });

    await earn(); // 4 or, première semaine : revenu 4 / semaine
    m = await market();
    expect(m.weeklyIncome).toBe(4);
    expect(m.goal.weeksLeft).toBe(4); // (20 - 4) / 4

    expect((await call('PUT', '/market/goal', { cardId: null })).body).toEqual({ cardId: null });
    expect((await market()).goal).toBeNull();
    expect((await call('PUT', '/market/goal', { cardId: 999 })).status).toBe(404);
  });

  it('refuse une carte archivée ; archiver retire l’épinglage', async () => {
    const card = await createCard({ name: 'Rhum', rarity: 'rare', price: 40 });
    await call('PUT', '/market/goal', { cardId: card.id });
    await call('PUT', `/reward-cards/${card.id}/archive`, { archived: true });
    expect((await market()).goal).toBeNull();
    await call('PUT', `/reward-cards/${card.id}/archive`, { archived: false });
    expect((await market()).goal).toBeNull(); // pas de ré-épinglage implicite
    await call('PUT', `/reward-cards/${card.id}/archive`, { archived: true });
    expect((await call('PUT', '/market/goal', { cardId: card.id })).status).toBe(400);
  });
});

describe('sauvegarde', () => {
  it('sauvegarde et restaure cartes, achats, objectif et or', async () => {
    const card = await createCard({
      name: 'Cinéma',
      rarity: 'uncommon',
      price: 2,
      cooldownDays: 7,
    });
    const goal = await createCard({ name: 'Vélo', rarity: 'legendary', price: 200 });
    await call('PUT', '/market/goal', { cardId: goal.id });
    await earn();
    await buy(card.id);
    const backup = (await call('GET', '/backup')).body;
    expect(backup.rewardCards).toHaveLength(2);
    expect(backup.purchases).toHaveLength(1);

    const fresh = createApp({ db: openDb(':memory:'), treesDir, now: () => new Date(clock) });
    const res = await call('POST', '/backup', backup, fresh);
    expect(res.body).toMatchObject({ purchases: 1, goldEvents: 2 });
    expect((await call('GET', '/market', undefined, fresh)).body).toEqual(await market());
    expect((await call('GET', '/gold', undefined, fresh)).body).toEqual(
      (await call('GET', '/gold')).body,
    );
  });

  it('restaure une sauvegarde antérieure à l’Étal, refuse un achat orphelin', async () => {
    const card = await createCard({ name: 'Cinéma', rarity: 'uncommon', price: 2 });
    await earn();
    await buy(card.id);
    const backup = (await call('GET', '/backup')).body;
    const old = structuredClone(backup);
    delete old.rewardCards;
    delete old.purchases;
    old.goldEvents = old.goldEvents.filter((g: any) => g.reason === 'quest');
    for (const g of old.goldEvents) delete g.purchaseId;
    expect((await call('POST', '/backup', old)).status).toBe(200);
    expect((await market()).cards).toEqual([]);

    backup.rewardCards = [];
    const res = await call('POST', '/backup', backup);
    expect(res.status).toBe(400);
    expect(res.body.errors[0]).toMatch(/carte ou un achat absent/);
  });
});
