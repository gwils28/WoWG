import type { Prerequisite, Talent, TreeFile } from '../schema';

export type RankDelta = 1 | -1;

export interface RankEvent {
  talentId: string;
  delta: RankDelta;
  occurredAt: string;
  note?: string | null;
}

/** Rang courant par talent. */
export type Ranks = Record<string, number>;

export type TalentState = 'locked' | 'available' | 'in-progress' | 'maxed';

export type Check = { ok: true } | { ok: false; reason: string };

export function currentRanks(events: readonly Pick<RankEvent, 'talentId' | 'delta'>[]): Ranks {
  const ranks: Ranks = {};
  for (const e of events) {
    ranks[e.talentId] = Math.max(0, (ranks[e.talentId] ?? 0) + e.delta);
  }
  return ranks;
}

export function findTalent(tree: TreeFile, id: string): Talent | undefined {
  return tree.talents.find((t) => t.id === id);
}

export function requiredRank(tree: TreeFile, prereq: Prerequisite): number {
  return prereq.rank ?? findTalent(tree, prereq.talentId)?.maxRank ?? 1;
}

export interface MissingPrerequisite {
  talentId: string;
  name: string;
  required: number;
  current: number;
}

export function missingPrerequisites(
  tree: TreeFile,
  ranks: Ranks,
  talentId: string,
): MissingPrerequisite[] {
  const talent = findTalent(tree, talentId);
  if (!talent) return [];
  return talent.prerequisites.flatMap((p) => {
    const required = requiredRank(tree, p);
    const current = ranks[p.talentId] ?? 0;
    if (current >= required) return [];
    return [
      {
        talentId: p.talentId,
        name: findTalent(tree, p.talentId)?.name ?? p.talentId,
        required,
        current,
      },
    ];
  });
}

export function talentState(tree: TreeFile, ranks: Ranks, talentId: string): TalentState {
  const talent = findTalent(tree, talentId);
  if (!talent) return 'locked';
  const rank = ranks[talentId] ?? 0;
  if (rank >= talent.maxRank) return 'maxed';
  if (rank > 0) return 'in-progress';
  return missingPrerequisites(tree, ranks, talentId).length === 0 ? 'available' : 'locked';
}

export function canAddRank(tree: TreeFile, ranks: Ranks, talentId: string): Check {
  const talent = findTalent(tree, talentId);
  if (!talent) return { ok: false, reason: `talent "${talentId}" inconnu` };
  if ((ranks[talentId] ?? 0) >= talent.maxRank) {
    return { ok: false, reason: `"${talent.name}" est déjà au rang max (${talent.maxRank})` };
  }
  const missing = missingPrerequisites(tree, ranks, talentId);
  if (missing.length > 0) {
    const list = missing.map((m) => `${m.name} ${m.current}/${m.required}`).join(', ');
    return { ok: false, reason: `prérequis manquants : ${list}` };
  }
  return { ok: true };
}

/** Retrait refusé s'il rendrait invalide un enfant qui a déjà des rangs (comme dans WoW). */
export function canRemoveRank(tree: TreeFile, ranks: Ranks, talentId: string): Check {
  const talent = findTalent(tree, talentId);
  if (!talent) return { ok: false, reason: `talent "${talentId}" inconnu` };
  const rank = ranks[talentId] ?? 0;
  if (rank <= 0) return { ok: false, reason: `"${talent.name}" n'a aucun rang à retirer` };

  const blocking = tree.talents.filter(
    (child) =>
      (ranks[child.id] ?? 0) > 0 &&
      child.prerequisites.some((p) => p.talentId === talentId && rank - 1 < requiredRank(tree, p)),
  );
  if (blocking.length > 0) {
    return {
      ok: false,
      reason: `impossible : ${blocking.map((c) => `"${c.name}"`).join(', ')} dépend(ent) de ce rang`,
    };
  }
  return { ok: true };
}

/** Points investis dans un arbre (seuls les talents encore définis comptent). */
export function pointsSpent(tree: TreeFile, ranks: Ranks): number {
  return tree.talents.reduce((sum, t) => sum + Math.min(ranks[t.id] ?? 0, t.maxRank), 0);
}

export function maxPoints(tree: TreeFile): number {
  return tree.talents.reduce((sum, t) => sum + t.maxRank, 0);
}
