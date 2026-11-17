import type { Talent, TreeFile } from '../schema';
import type { Ranks } from './ranks';

export interface TalentChange {
  id: string;
  name: string;
  fields: (keyof Talent)[];
}

export interface TreeDiff {
  isNew: boolean;
  metadataChanged: ('domain' | 'specialization' | 'grid')[];
  added: Talent[];
  removed: Talent[];
  modified: TalentChange[];
  /** Talents supprimés qui ont de la progression : elle est conservée mais orpheline. */
  orphans: { id: string; name: string; rank: number }[];
  /** Talents dont le rang courant dépasse le nouveau rang max. */
  overflows: { id: string; name: string; rank: number; maxRank: number }[];
}

const TALENT_FIELDS: (keyof Talent)[] = [
  'name',
  'description',
  'icon',
  'tier',
  'column',
  'maxRank',
  'ranks',
  'prerequisites',
  'ultimate',
];

const same = (a: unknown, b: unknown) => JSON.stringify(a ?? null) === JSON.stringify(b ?? null);

export function diffTrees(previous: TreeFile | null, next: TreeFile, ranks: Ranks = {}): TreeDiff {
  if (!previous) {
    return {
      isNew: true,
      metadataChanged: [],
      added: next.talents,
      removed: [],
      modified: [],
      orphans: [],
      overflows: [],
    };
  }
  const prevById = new Map(previous.talents.map((t) => [t.id, t]));
  const nextById = new Map(next.talents.map((t) => [t.id, t]));

  const metadataChanged = (['domain', 'specialization', 'grid'] as const).filter(
    (k) => !same(previous[k], next[k]),
  );
  const added = next.talents.filter((t) => !prevById.has(t.id));
  const removed = previous.talents.filter((t) => !nextById.has(t.id));
  const modified = next.talents.flatMap((t) => {
    const old = prevById.get(t.id);
    if (!old) return [];
    const fields = TALENT_FIELDS.filter((f) => !same(old[f], t[f]));
    return fields.length ? [{ id: t.id, name: t.name, fields }] : [];
  });

  const orphans = Object.entries(ranks)
    .filter(([id, rank]) => rank > 0 && !nextById.has(id))
    .map(([id, rank]) => ({ id, name: prevById.get(id)?.name ?? id, rank }));
  const overflows = next.talents
    .filter((t) => (ranks[t.id] ?? 0) > t.maxRank)
    .map((t) => ({ id: t.id, name: t.name, rank: ranks[t.id] ?? 0, maxRank: t.maxRank }));

  return { isNew: false, metadataChanged, added, removed, modified, orphans, overflows };
}
