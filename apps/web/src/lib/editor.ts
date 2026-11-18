import type { Prerequisite, Talent, TreeFile } from '@wowg/shared';

/** Opérations pures sur un brouillon d'arbre (mode édition). Testées dans apps/web/test. */

export function slugify(text: string): string {
  return text
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

export function uniqueId(tree: TreeFile, base: string): string {
  const root = slugify(base) || 'talent';
  const ids = new Set(tree.talents.map((t) => t.id));
  if (!ids.has(root)) return root;
  let i = 2;
  while (ids.has(`${root}-${i}`)) i++;
  return `${root}-${i}`;
}

export function isCellFree(tree: TreeFile, tier: number, column: number, exceptId?: string) {
  return !tree.talents.some((t) => t.tier === tier && t.column === column && t.id !== exceptId);
}

export function newTalentAt(tree: TreeFile, tier: number, column: number): Talent {
  return {
    id: uniqueId(tree, 'nouveau-talent'),
    name: 'Nouveau talent',
    description: 'À décrire.',
    icon: 'game-icons:help',
    tier,
    column,
    maxRank: 1,
    ranks: ['Critère du rang 1'],
    prerequisites: [],
  };
}

export function updateTalent(tree: TreeFile, id: string, patch: Partial<Talent>): TreeFile {
  return { ...tree, talents: tree.talents.map((t) => (t.id === id ? { ...t, ...patch } : t)) };
}

/** Ajuste la liste des critères à la nouvelle longueur (conserve les existants). */
export function withMaxRank(talent: Talent, maxRank: number): Talent {
  const ranks = Array.from(
    { length: maxRank },
    (_, i) => talent.ranks[i] ?? `Critère du rang ${i + 1}`,
  );
  return { ...talent, maxRank, ranks };
}

/** Renomme l'id d'un talent (talents nouveaux uniquement) et met à jour les prérequis qui le visent. */
export function renameTalent(tree: TreeFile, oldId: string, newId: string): TreeFile {
  return {
    ...tree,
    talents: tree.talents.map((t) => ({
      ...t,
      id: t.id === oldId ? newId : t.id,
      prerequisites: t.prerequisites.map((p) =>
        p.talentId === oldId ? { ...p, talentId: newId } : p,
      ),
    })),
  };
}

/** Supprime un talent et les prérequis qui le référencent. */
export function removeTalent(tree: TreeFile, id: string): TreeFile {
  return {
    ...tree,
    talents: tree.talents
      .filter((t) => t.id !== id)
      .map((t) => ({ ...t, prerequisites: t.prerequisites.filter((p) => p.talentId !== id) })),
  };
}

/** Un seul ultime : cocher un talent décoche les autres. */
export function setUltimate(tree: TreeFile, id: string, value: boolean): TreeFile {
  return {
    ...tree,
    talents: tree.talents.map((t) => {
      if (t.id === id) return value ? { ...t, ultimate: true } : withoutUltimate(t);
      return value ? withoutUltimate(t) : t;
    }),
  };
}

function withoutUltimate(t: Talent): Talent {
  const copy = { ...t };
  delete copy.ultimate;
  return copy;
}

/** Talents pouvant servir de prérequis : paliers strictement inférieurs, pas déjà liés. */
export function prerequisiteCandidates(tree: TreeFile, talent: Talent): Talent[] {
  const linked = new Set(talent.prerequisites.map((p) => p.talentId));
  return tree.talents
    .filter((t) => t.tier < talent.tier && !linked.has(t.id))
    .sort((a, b) => a.tier - b.tier || a.column - b.column);
}

export function setPrerequisites(tree: TreeFile, id: string, prerequisites: Prerequisite[]) {
  return updateTalent(tree, id, { prerequisites });
}

/** Rattache chaque erreur de validation ("talents[3].xxx : ...") au talent concerné. */
export function errorsByTalent(tree: TreeFile, errors: string[]) {
  const byTalent: Record<string, string[]> = {};
  const general: string[] = [];
  for (const err of errors) {
    const m = /^talents\[(\d+)\]/.exec(err);
    const talent = m ? tree.talents[Number(m[1])] : undefined;
    if (talent)
      (byTalent[talent.id] ??= []).push(frenchField(err.replace(/^talents\[\d+\]\.?/, '')));
    else general.push(err);
  }
  return { byTalent, general };
}

const FIELD_FR: Record<string, string> = {
  id: 'identifiant',
  name: 'nom',
  icon: 'icône',
  tier: 'palier',
  column: 'colonne',
  maxRank: 'rang max',
  ranks: 'critères',
  prerequisites: 'prérequis',
};

/** "column : ..." devient "colonne : ..." ; "prerequisites[0] : ..." devient "prérequis 1 : ...". */
function frenchField(err: string): string {
  return err.replace(/^([a-zA-Z]+)(?:\[(\d+)\])?/, (m, field: string, index?: string) => {
    const label = FIELD_FR[field];
    if (!label) return m;
    return index === undefined ? label : `${label} ${Number(index) + 1}`;
  });
}
