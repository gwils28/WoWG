import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { parseTree, type TreeFile } from '@wowg/shared';
import {
  errorsByTalent,
  isCellFree,
  newTalentAt,
  prerequisiteCandidates,
  removeTalent,
  renameTalent,
  setUltimate,
  slugify,
  uniqueId,
  updateTalent,
  withMaxRank,
} from '../src/lib/editor';

const FIXTURE = new URL('../../../packages/shared/test/fixtures/sample.json', import.meta.url);
const load = (): TreeFile => {
  const res = parseTree(readFileSync(FIXTURE, 'utf-8'));
  if (!res.ok) throw new Error(res.errors.join('\n'));
  return res.tree;
};

describe('éditeur', () => {
  it('slugifie et garantit des ids uniques', () => {
    expect(slugify('  Écoute Active !  ')).toBe('ecoute-active');
    const tree = load();
    expect(uniqueId(tree, 'Endurance')).toBe('endurance-2');
    expect(uniqueId(tree, 'Côtes')).toBe('cotes');
    expect(uniqueId(tree, '!!!')).toBe('talent');
  });

  it('crée un talent valide sur une case libre', () => {
    const tree = load();
    expect(isCellFree(tree, 1, 1)).toBe(false);
    expect(isCellFree(tree, 1, 1, 'endurance')).toBe(true);
    expect(isCellFree(tree, 1, 2)).toBe(true);
    const next = { ...tree, talents: [...tree.talents, newTalentAt(tree, 3, 3)] };
    expect(parseTree(next).ok).toBe(true);
  });

  it('ajuste les critères quand le rang max change', () => {
    const t = load().talents[0]!;
    expect(withMaxRank(t, 2).ranks).toEqual(t.ranks.slice(0, 2));
    expect(withMaxRank(t, 4).ranks).toEqual([...t.ranks, 'Critère du rang 4']);
  });

  it('supprime un talent et les prérequis qui le visent', () => {
    const next = removeTalent(load(), 'fractionne');
    expect(next.talents.map((t) => t.id)).not.toContain('fractionne');
    expect(next.talents.find((t) => t.id === 'semi-marathon')?.prerequisites).toEqual([
      { talentId: 'cadence', rank: 1 },
    ]);
    expect(parseTree(next).ok).toBe(true);
  });

  it('renomme un talent et ses références', () => {
    const next = renameTalent(load(), 'fractionne', 'intervalles');
    expect(next.talents.map((t) => t.id)).toContain('intervalles');
    expect(next.talents.find((t) => t.id === 'semi-marathon')?.prerequisites[0]).toEqual({
      talentId: 'intervalles',
    });
    expect(parseTree(next).ok).toBe(true);
  });

  it('ne garde qu’un seul talent ultime', () => {
    const tree = setUltimate(load(), 'recuperation', true);
    expect(tree.talents.filter((t) => t.ultimate).map((t) => t.id)).toEqual(['recuperation']);
    const none = setUltimate(tree, 'recuperation', false);
    expect(none.talents.some((t) => 'ultimate' in t)).toBe(false);
  });

  it('propose comme prérequis les talents des paliers inférieurs non liés', () => {
    const tree = load();
    const semi = tree.talents.find((t) => t.id === 'semi-marathon')!;
    expect(prerequisiteCandidates(tree, semi).map((t) => t.id)).toEqual([
      'endurance',
      'recuperation',
    ]);
  });

  it('rattache les erreurs de validation aux talents', () => {
    const tree = updateTalent(load(), 'cadence', { column: 1 });
    const res = parseTree(tree);
    expect(res.ok).toBe(false);
    if (res.ok) return;
    const { byTalent, general } = errorsByTalent(tree, [...res.errors, 'grid : erreur globale']);
    expect(byTalent.cadence?.[0]).toMatch(/^colonne : case palier 1 colonne 1/);
    expect(general).toEqual(['grid : erreur globale']);
  });
});
