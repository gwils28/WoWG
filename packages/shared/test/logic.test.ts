import { describe, expect, it } from 'vitest';
import {
  canAddRank,
  canRemoveRank,
  currentRanks,
  diffTrees,
  classPortraitTier,
  levelCost,
  levelFromPoints,
  levelProgress,
  levelTier,
  LEVEL_TIERS,
  MAX_LEVEL,
  maxPoints,
  missingPrerequisites,
  pointsForLevel,
  pointsSpent,
  talentState,
  type TreeFile,
} from '../src';
import { loadSample } from './helpers';

const tree = loadSample();

describe('currentRanks', () => {
  it('additionne les événements sans descendre sous 0', () => {
    expect(
      currentRanks([
        { talentId: 'a', delta: 1 },
        { talentId: 'a', delta: 1 },
        { talentId: 'a', delta: -1 },
        { talentId: 'b', delta: -1 },
        { talentId: 'b', delta: 1 },
      ]),
    ).toEqual({ a: 1, b: 1 });
  });
});

describe('talentState', () => {
  it('calcule les quatre états', () => {
    const ranks = { endurance: 3, cadence: 1 };
    expect(talentState(tree, ranks, 'endurance')).toBe('maxed');
    expect(talentState(tree, ranks, 'cadence')).toBe('in-progress');
    expect(talentState(tree, ranks, 'fractionne')).toBe('available');
    expect(talentState(tree, ranks, 'semi-marathon')).toBe('locked');
    expect(talentState(tree, {}, 'recuperation')).toBe('available');
  });

  it('utilise le rang max du parent quand le rang requis est absent', () => {
    expect(missingPrerequisites(tree, { fractionne: 1, cadence: 1 }, 'semi-marathon')).toEqual([
      { talentId: 'fractionne', name: 'Fractionné', required: 2, current: 1 },
    ]);
    expect(talentState(tree, { fractionne: 2, cadence: 1 }, 'semi-marathon')).toBe('available');
  });
});

describe('canAddRank', () => {
  it('refuse au rang max, avec prérequis manquants ou talent inconnu', () => {
    expect(canAddRank(tree, { endurance: 3 }, 'endurance')).toEqual({
      ok: false,
      reason: '"Endurance de base" est déjà au rang max (3)',
    });
    expect(canAddRank(tree, { endurance: 1 }, 'fractionne')).toEqual({
      ok: false,
      reason: 'prérequis manquants : Endurance de base 1/2',
    });
    expect(canAddRank(tree, {}, 'nope').ok).toBe(false);
  });

  it('accepte quand les prérequis sont remplis', () => {
    expect(canAddRank(tree, { endurance: 2 }, 'fractionne')).toEqual({ ok: true });
  });
});

describe('canRemoveRank', () => {
  it('refuse sans rang', () => {
    expect(canRemoveRank(tree, {}, 'endurance').ok).toBe(false);
  });

  it('refuse si un enfant avec des rangs dépend du rang retiré', () => {
    const ranks = { endurance: 2, fractionne: 1 };
    expect(canRemoveRank(tree, ranks, 'endurance')).toEqual({
      ok: false,
      reason: 'impossible : "Fractionné" dépend(ent) de ce rang',
    });
  });

  it("accepte si le rang restant suffit encore ou si l'enfant n'a pas de rang", () => {
    expect(canRemoveRank(tree, { endurance: 3, fractionne: 1 }, 'endurance')).toEqual({ ok: true });
    expect(canRemoveRank(tree, { endurance: 2 }, 'endurance')).toEqual({ ok: true });
  });
});

describe('points et niveau', () => {
  it("compte les points dans l'arbre en ignorant les orphelins", () => {
    expect(pointsSpent(tree, { endurance: 3, cadence: 1, ancien: 4 })).toBe(4);
    expect(maxPoints(tree)).toBe(9);
  });

  it('suit la courbe : passer de L à L+1 coûte ceil(L/5)', () => {
    expect([1, 2, 6, 7, 11, 21, 41, 61, 81].map(pointsForLevel)).toEqual([
      0, 1, 5, 7, 15, 50, 180, 390, 680,
    ]);
    expect([1, 5, 6, 7, 10, 11].map(levelCost)).toEqual([1, 1, 2, 2, 2, 3]);
    expect([0, 1, 4, 5, 6, 7, 679, 680].map(levelFromPoints)).toEqual([1, 2, 5, 6, 6, 7, 80, 81]);
    for (let l = 1; l < MAX_LEVEL; l++) {
      expect(pointsForLevel(l + 1) - pointsForLevel(l)).toBe(levelCost(l));
    }
  });

  it('donne la progression dans le niveau courant', () => {
    expect(levelProgress(8)).toEqual({ level: 7, points: 8, intoLevel: 1, toNext: 2 });
    expect(levelProgress(0)).toEqual({ level: 1, points: 0, intoLevel: 0, toNext: 1 });
  });

  it('plafonne au niveau 100', () => {
    expect(pointsForLevel(MAX_LEVEL)).toBe(1030);
    expect(levelFromPoints(1029)).toBe(99);
    expect(levelFromPoints(1030)).toBe(100);
    expect(levelFromPoints(9000)).toBe(100);
    expect(levelProgress(1050)).toEqual({ level: 100, points: 1050, intoLevel: 20, toNext: 0 });
  });

  it('choisit le portrait de classe par tranche de 20 % des points', () => {
    expect([0, 35, 36, 71, 72, 143, 144, 180].map((p) => classPortraitTier(p, 180))).toEqual([
      1, 1, 2, 2, 3, 4, 5, 5,
    ]);
    expect(classPortraitTier(5, 0)).toBe(1);
    expect(classPortraitTier(999, 180)).toBe(5);
  });

  it('range le niveau dans un des 5 paliers', () => {
    expect([1, 20, 21, 40, 41, 60, 61, 80, 81, 100].map((l) => levelTier(l).index)).toEqual([
      1, 1, 2, 2, 3, 3, 4, 4, 5, 5,
    ]);
    expect(LEVEL_TIERS.map((t) => [t.from, t.to])).toEqual([
      [0, 20],
      [21, 40],
      [41, 60],
      [61, 80],
      [81, 100],
    ]);
  });
});

describe('diffTrees', () => {
  it('ne répète pas une progression déjà orpheline', () => {
    const diff = diffTrees(tree, structuredClone(tree), { 'ancien-talent': 2 });
    expect(diff.orphans).toEqual([]);
  });

  it('marque tout comme ajouté pour un nouvel arbre', () => {
    const diff = diffTrees(null, tree);
    expect(diff.isNew).toBe(true);
    expect(diff.added).toHaveLength(5);
  });

  it('détecte ajouts, suppressions, modifications, orphelins et dépassements', () => {
    const next: TreeFile = structuredClone(tree);
    next.specialization.name = 'Running';
    next.talents = next.talents.filter((t) => t.id !== 'recuperation');
    const endurance = next.talents.find((t) => t.id === 'endurance')!;
    endurance.maxRank = 2;
    endurance.ranks = endurance.ranks.slice(0, 2);
    next.talents.push({
      ...endurance,
      id: 'cotes',
      name: 'Côtes',
      tier: 2,
      column: 3,
      prerequisites: [],
    });

    const diff = diffTrees(tree, next, { recuperation: 1, endurance: 3 });
    expect(diff.isNew).toBe(false);
    expect(diff.metadataChanged).toEqual(['specialization']);
    expect(diff.added.map((t) => t.id)).toEqual(['cotes']);
    expect(diff.removed.map((t) => t.id)).toEqual(['recuperation']);
    expect(diff.modified).toEqual([
      { id: 'endurance', name: 'Endurance de base', fields: ['maxRank', 'ranks'] },
    ]);
    expect(diff.orphans).toEqual([{ id: 'recuperation', name: 'Récupération', rank: 1 }]);
    expect(diff.overflows).toEqual([
      { id: 'endurance', name: 'Endurance de base', rank: 3, maxRank: 2 },
    ]);
  });
});
