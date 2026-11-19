/* eslint-disable @typescript-eslint/no-explicit-any -- réponses JSON inspectées librement */
import {
  mkdtempSync,
  mkdirSync,
  readFileSync,
  existsSync,
  copyFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createApp } from '../src/app';
import { openDb } from '../src/db';

const FIXTURE = new URL('../../../packages/shared/test/fixtures/sample.json', import.meta.url);
const sample = () => JSON.parse(readFileSync(FIXTURE, 'utf-8'));

let treesDir: string;
let app: ReturnType<typeof createApp>;

async function call(method: string, path: string, body?: unknown) {
  const res = await app.request(`/api${path}`, {
    method,
    headers: { 'content-type': 'application/json' },
    body: body === undefined ? undefined : typeof body === 'string' ? body : JSON.stringify(body),
  });
  return { status: res.status, body: (await res.json()) as any };
}

const addRank = (talentId: string, body?: unknown) =>
  call('POST', `/specializations/course-a-pied/talents/${talentId}/ranks`, body);
const removeRank = (talentId: string) =>
  call('DELETE', `/specializations/course-a-pied/talents/${talentId}/ranks`);

beforeEach(() => {
  treesDir = mkdtempSync(join(tmpdir(), 'wowg-trees-'));
  mkdirSync(join(treesDir, 'sport-sante'));
  copyFileSync(FIXTURE, join(treesDir, 'sport-sante', 'course-a-pied.json'));
  app = createApp({ db: openDb(':memory:'), treesDir });
});

afterEach(() => rmSync(treesDir, { recursive: true, force: true }));

describe('import', () => {
  it('liste les fichiers de trees/', async () => {
    expect((await call('GET', '/tree-files')).body).toEqual(['sport-sante/course-a-pied.json']);
  });

  it('prévisualise un nouvel arbre puis l’applique', async () => {
    const preview = await call('POST', '/import/preview', {
      path: 'sport-sante/course-a-pied.json',
    });
    expect(preview.status).toBe(200);
    expect(preview.body.diff.isNew).toBe(true);
    expect(preview.body.diff.added).toHaveLength(5);
    expect((await call('GET', '/specializations')).body).toEqual([]);

    const applied = await call('POST', '/import/apply', { path: 'sport-sante/course-a-pied.json' });
    expect(applied.status).toBe(201);
    expect(applied.body.specialization).toMatchObject({
      id: 'course-a-pied',
      points: 0,
      maxPoints: 9,
    });
  });

  it('renvoie des erreurs lisibles pour un arbre invalide', async () => {
    const tree = sample();
    tree.talents[1].column = 1;
    const res = await call('POST', '/import/preview', { content: tree });
    expect(res.status).toBe(400);
    expect(res.body.errors[0]).toMatch(/déjà occupée/);
  });

  it('refuse les chemins hors de trees/', async () => {
    for (const path of ['../package.json', '/etc/passwd', 'sport-sante/notes.txt']) {
      const res = await call('POST', '/import/preview', { path });
      expect(res.status).toBe(400);
      expect(res.body.errors[0]).toMatch(/chemin refusé/);
    }
  });

  it('exige exactement une source et un JSON valide', async () => {
    expect((await call('POST', '/import/preview', {})).status).toBe(400);
    expect((await call('POST', '/import/preview', '{ cassé')).body.errors).toEqual([
      'corps JSON invalide',
    ]);
    expect((await call('POST', '/import/preview', { path: 'x/absent.json' })).status).toBe(404);
  });

  it('écrit dans trees/ un arbre importé par contenu', async () => {
    const tree = sample();
    tree.specialization.id = 'natation';
    const res = await call('POST', '/import/apply', { content: tree });
    expect(res.status).toBe(201);
    expect(existsSync(join(treesDir, 'sport-sante', 'natation.json'))).toBe(true);
    expect(res.body.specialization.sourcePath).toBe('sport-sante/natation.json');
  });

  it('montre orphelins et dépassements lors d’une réimport', async () => {
    await call('POST', '/import/apply', { path: 'sport-sante/course-a-pied.json' });
    await addRank('recuperation');
    const tree = sample();
    tree.talents = tree.talents.filter((t: { id: string }) => t.id !== 'recuperation');
    const preview = await call('POST', '/import/preview', { content: tree });
    expect(preview.body.diff.orphans).toEqual([
      { id: 'recuperation', name: 'Récupération', rank: 1 },
    ]);
    expect(preview.body.ranks).toEqual({ recuperation: 1 });

    await call('POST', '/import/apply', { content: tree });
    const detail = await call('GET', '/specializations/course-a-pied');
    expect(detail.body.orphans).toEqual([{ talentId: 'recuperation', rank: 1 }]);
    expect(detail.body.points).toBe(0);
  });
});

describe('rangs', () => {
  beforeEach(async () => {
    await call('POST', '/import/apply', { path: 'sport-sante/course-a-pied.json' });
  });

  it('ajoute un rang avec note et date', async () => {
    const res = await addRank('endurance', {
      note: '  20 min au parc  ',
      occurredAt: '2026-11-01',
    });
    expect(res.status).toBe(201);
    expect(res.body.event).toMatchObject({
      talentId: 'endurance',
      delta: 1,
      note: '20 min au parc',
      occurredAt: '2026-11-01T00:00:00.000Z',
    });
    expect(res.body.specialization.ranks).toEqual({ endurance: 1 });
  });

  it('accepte un ajout sans corps', async () => {
    expect((await addRank('endurance')).status).toBe(201);
  });

  it('refuse un prérequis manquant ou le rang max (409)', async () => {
    const res = await addRank('fractionne');
    expect(res.status).toBe(409);
    expect(res.body.errors).toEqual(['prérequis manquants : Endurance de base 0/2']);
    await addRank('recuperation');
    expect((await addRank('recuperation')).status).toBe(409);
  });

  it('valide le corps de la requête', async () => {
    expect((await addRank('endurance', { occurredAt: 'hier' })).status).toBe(400);
    expect((await addRank('endurance', { note: 'x'.repeat(2001) })).status).toBe(400);
  });

  it('retire un rang, sauf si un enfant en dépend', async () => {
    await addRank('endurance');
    await addRank('endurance');
    await addRank('fractionne');
    const refused = await removeRank('endurance');
    expect(refused.status).toBe(409);
    expect(refused.body.errors[0]).toMatch(/"Fractionné" dépend/);

    await removeRank('fractionne');
    const ok = await removeRank('endurance');
    expect(ok.status).toBe(200);
    expect(ok.body.specialization.ranks).toEqual({ endurance: 1, fractionne: 0 });
  });

  it('renvoie 404 pour une spécialisation inconnue', async () => {
    expect((await call('GET', '/specializations/nope')).status).toBe(404);
  });
});

describe('édition', () => {
  beforeEach(async () => {
    await call('POST', '/import/apply', { path: 'sport-sante/course-a-pied.json' });
  });

  it('enregistre la définition et réécrit le fichier de trees/', async () => {
    const tree = sample();
    tree.talents[0].name = 'Fond';
    const res = await call('PUT', '/specializations/course-a-pied', tree);
    expect(res.status).toBe(200);
    expect(res.body.diff.modified).toEqual([{ id: 'endurance', name: 'Fond', fields: ['name'] }]);
    const written = JSON.parse(
      readFileSync(join(treesDir, 'sport-sante', 'course-a-pied.json'), 'utf-8'),
    );
    expect(written.talents[0].name).toBe('Fond');
  });

  it('refuse un changement d’id de spécialisation', async () => {
    const tree = sample();
    tree.specialization.id = 'autre';
    expect((await call('PUT', '/specializations/course-a-pied', tree)).status).toBe(400);
  });
});

describe('personnage, journal et sauvegarde', () => {
  beforeEach(async () => {
    await call('POST', '/import/apply', { path: 'sport-sante/course-a-pied.json' });
    await addRank('endurance', { occurredAt: '2026-10-01', note: 'premier' });
    await addRank('endurance', { occurredAt: '2026-10-15' });
    await addRank('cadence', { occurredAt: '2026-11-02' });
  });

  it('calcule le niveau et le résumé par domaine', async () => {
    const { body } = await call('GET', '/character');
    expect(body).toMatchObject({ level: 3, points: 3, intoLevel: 0, toNext: 3 });
    expect(body.domains).toHaveLength(1);
    expect(body.domains[0]).toMatchObject({
      points: 3,
      maxPoints: 9,
      pinned: false,
      domain: { id: 'sport-sante' },
    });
    expect(body.domains[0].lastActivityAt).toEqual(expect.any(String));
    expect(body.tier).toEqual({ index: 1, name: 'Novice', from: 0, to: 20, portrait: null });
  });

  it("date l'activité d'un domaine sans rang à son import", async () => {
    const fresh = createApp({ db: openDb(':memory:'), treesDir });
    const before = new Date().toISOString();
    await fresh.request('/api/import/apply', {
      method: 'POST',
      body: JSON.stringify({ path: 'sport-sante/course-a-pied.json' }),
    });
    const char = (await (await fresh.request('/api/character')).json()) as any;
    expect(char.domains[0].points).toBe(0);
    expect(char.domains[0].lastActivityAt >= before).toBe(true);
  });

  it('épingle et désépingle un domaine', async () => {
    expect((await call('PUT', '/domains/sport-sante/pin', { pinned: true })).body).toEqual({
      pinned: ['sport-sante'],
    });
    const char = (await call('GET', '/character')).body;
    expect(char.pinned).toEqual(['sport-sante']);
    expect(char.domains[0].pinned).toBe(true);
    expect((await call('PUT', '/domains/sport-sante/pin', { pinned: false })).body.pinned).toEqual(
      [],
    );
    expect((await call('PUT', '/domains/inconnu/pin', { pinned: true })).status).toBe(404);
    expect((await call('PUT', '/domains/sport-sante/pin', { pinned: 'oui' })).status).toBe(400);
  });

  it('sert le portrait du palier quand il existe', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'wowg-portraits-'));
    try {
      writeFileSync(join(dir, 'palier-1.png'), 'png');
      const withPortraits = createApp({ db: openDb(':memory:'), treesDir, portraitsDir: dir });
      const char = (await (await withPortraits.request('/api/character')).json()) as any;
      expect(char.tier.portrait).toBe('/api/portraits/1');
      expect(char.portraits).toEqual(['/api/portraits/1', null, null, null, null]);
      const img = await withPortraits.request('/api/portraits/1');
      expect(img.status).toBe(200);
      expect(img.headers.get('content-type')).toBe('image/png');
      expect((await withPortraits.request('/api/portraits/2')).status).toBe(404);
      expect((await withPortraits.request('/api/portraits/..%2Fsecret')).status).toBe(404);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('liste le journal enrichi, du plus récent au plus ancien, avec filtres', async () => {
    await removeRank('cadence');
    const all = (await call('GET', '/journal')).body;
    expect(
      all.map((e: { talentId: string; delta: number; rankAfter: number }) => [
        e.talentId,
        e.delta,
        e.rankAfter,
      ]),
    ).toEqual([
      ['cadence', -1, 0],
      ['cadence', 1, 1],
      ['endurance', 1, 2],
      ['endurance', 1, 1],
    ]);
    expect(all[3]).toMatchObject({
      talentName: 'Endurance de base',
      note: 'premier',
      orphan: false,
    });

    const october = (await call('GET', '/journal?from=2026-10-01&to=2026-10-31')).body;
    expect(october).toHaveLength(2);
    expect((await call('GET', '/journal?domain=autre')).body).toEqual([]);
    expect((await call('GET', '/journal?from=hier')).status).toBe(400);
  });

  it('exporte puis restaure toute la progression', async () => {
    await call('PUT', '/domains/sport-sante/pin', { pinned: true });
    const backup = (await call('GET', '/backup')).body;
    expect(backup).toMatchObject({
      format: 'wowg-backup',
      version: 1,
      preferences: { pinnedDomains: ['sport-sante'] },
    });
    expect(backup.events).toHaveLength(3);

    const fresh = createApp({ db: openDb(':memory:'), treesDir });
    const res = await fresh.request('/api/backup', {
      method: 'POST',
      body: JSON.stringify(backup),
    });
    expect((await res.json()) as any).toEqual({ specializations: 1, events: 3 });
    const char = (await (await fresh.request('/api/character')).json()) as any;
    expect(char.points).toBe(3);
    expect(char.pinned).toEqual(['sport-sante']);
  });

  it('restaure une sauvegarde antérieure aux préférences', async () => {
    await call('PUT', '/domains/sport-sante/pin', { pinned: true });
    const backup = (await call('GET', '/backup')).body;
    delete backup.preferences;
    expect((await call('POST', '/backup', backup)).status).toBe(200);
    expect((await call('GET', '/character')).body.pinned).toEqual([]);
  });

  it('refuse une sauvegarde incohérente', async () => {
    const backup = (await call('GET', '/backup')).body;
    backup.events[0].specializationId = 'fantome';
    const res = await call('POST', '/backup', backup);
    expect(res.status).toBe(400);
    expect(res.body.errors[0]).toMatch(/spécialisation absente/);
  });
});

describe('compatibilité des données stockées', () => {
  it('relit un arbre stocké même s’il viole une règle croisée ajoutée depuis', async () => {
    const db = openDb(':memory:');
    const tree = sample();
    tree.talents[3].column = 2; // flèche bloquée : invalide aujourd'hui, accepté autrefois
    db.prepare(
      `INSERT INTO specializations (id, domain_id, definition, source_path, imported_at, updated_at)
       VALUES ('course-a-pied', 'sport-sante', ?, NULL, 'x', 'x')`,
    ).run(JSON.stringify(tree));
    const legacy = createApp({ db, treesDir });
    const res = await legacy.request('/api/specializations/course-a-pied');
    expect(res.status).toBe(200);
  });
});
