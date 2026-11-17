import { describe, expect, it } from 'vitest';
import {
  canAddRank,
  canRemoveRank,
  currentRanks,
  diffTrees,
  levelFromPoints,
  levelProgress,
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

  it('suit la courbe L(L-1)/2', () => {
    expect([1, 2, 3, 4, 25].map(pointsForLevel)).toEqual([0, 1, 3, 6, 300]);
    expect([0, 1, 2, 3, 5, 6, 299, 300].map(levelFromPoints)).toEqual([1, 2, 2, 3, 3, 4, 24, 25]);
  });

  it('donne la progression dans le niveau courant', () => {
    expect(levelProgress(8)).toEqual({ level: 4, points: 8, intoLevel: 2, toNext: 4 });
    expect(levelProgress(0)).toEqual({ level: 1, points: 0, intoLevel: 0, toNext: 1 });
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
