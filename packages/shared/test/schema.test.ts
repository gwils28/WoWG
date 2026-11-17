import { describe, expect, it } from 'vitest';
import { parseTree, treeJsonSchema } from '../src';
import { rawSample } from './helpers';

const errorsOf = (raw: unknown) => {
  const res = parseTree(raw);
  if (res.ok) throw new Error('validation inattendue');
  return res.errors.join('\n');
};

describe('parseTree', () => {
  it('accepte la fixture et applique les valeurs par défaut', () => {
    const res = parseTree(rawSample());
    expect(res.ok).toBe(true);
    if (res.ok) expect(res.tree.talents[0]?.prerequisites).toEqual([]);
  });

  it('accepte une chaîne JSON et signale un JSON invalide', () => {
    expect(parseTree(JSON.stringify(rawSample())).ok).toBe(true);
    expect(errorsOf('{ pas du json')).toMatch(/JSON invalide/);
  });

  it('refuse un id dupliqué', () => {
    const raw = rawSample();
    raw.talents[1].id = 'endurance';
    expect(errorsOf(raw)).toMatch(/id "endurance" dupliqué/);
  });

  it('refuse deux talents sur la même case', () => {
    const raw = rawSample();
    raw.talents[1].column = 1;
    expect(errorsOf(raw)).toMatch(/talents\[1\]\.column : case palier 1 colonne 1 déjà occupée/);
  });

  it('refuse un nombre de critères différent de maxRank', () => {
    const raw = rawSample();
    raw.talents[0].maxRank = 4;
    expect(errorsOf(raw)).toMatch(/talents\[0\]\.ranks : 3 critère\(s\) pour maxRank 4/);
  });

  it('refuse un prérequis inexistant, au même palier ou avec un rang trop haut', () => {
    const raw = rawSample();
    raw.talents[2].prerequisites = [{ talentId: 'inconnu' }];
    raw.talents[3].prerequisites = [{ talentId: 'fractionne' }];
    raw.talents[4].prerequisites = [{ talentId: 'cadence', rank: 5 }];
    const errors = errorsOf(raw);
    expect(errors).toMatch(/prérequis "inconnu" inexistant/);
    expect(errors).toMatch(/"fractionne" \(palier 2\) doit être à un palier inférieur/);
    expect(errors).toMatch(/rang requis 5 supérieur au rang max de "cadence"/);
  });

  it('refuse un talent hors grille et un ultime mal placé', () => {
    const raw = rawSample();
    raw.talents[0].tier = 9;
    raw.talents[1].ultimate = true;
    const errors = errorsOf(raw);
    expect(errors).toMatch(/palier 9 hors de la grille/);
    expect(errors).toMatch(/un seul talent ultime/);
    expect(errors).toMatch(/talent ultime doit être au dernier palier/);
  });

  it('refuse un identifiant ou une icône mal formés', () => {
    const raw = rawSample();
    raw.talents[0].id = 'Endurance De Base';
    raw.talents[0].icon = 'run';
    const errors = errorsOf(raw);
    expect(errors).toMatch(/kebab-case/);
    expect(errors).toMatch(/collection:nom/);
  });
});

describe('treeJsonSchema', () => {
  it('produit un JSON Schema objet avec les champs requis', () => {
    const schema = treeJsonSchema() as { type: string; required: string[] };
    expect(schema.type).toBe('object');
    expect(schema.required).toEqual(
      expect.arrayContaining(['schemaVersion', 'domain', 'specialization', 'grid', 'talents']),
    );
  });
});
