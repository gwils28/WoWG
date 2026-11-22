/**
 * Passer du niveau L au niveau L+1 coûte ceil(L / 5) points (1 rang = 1 point) : 1 point par
 * niveau jusqu'au niveau 6, puis 2, 3... Courbe adoptée avec le catalogue v2 (SPEC 11, environ
 * 900 points en tout) : Légende (niveau 81) demande 680 points, le niveau max 100 en demande
 * 1 030, juste hors d'atteinte. Niveau 1 à 0 point.
 */
export const MAX_LEVEL = 100;
const STEP = 5;

/** Coût pour passer du niveau `level` au suivant. */
export function levelCost(level: number): number {
  return Math.ceil(level / STEP);
}

/** Points cumulés pour atteindre le niveau `level`. */
export function pointsForLevel(level: number): number {
  const n = Math.max(0, level - 1);
  const q = Math.floor(n / STEP);
  const r = n % STEP;
  // q blocs complets de STEP niveaux (coûts 1..q) puis r niveaux au coût q + 1
  return (STEP * q * (q + 1)) / 2 + r * (q + 1);
}

export function levelFromPoints(points: number): number {
  const p = Math.max(0, Math.floor(points));
  let level = 1;
  while (level < MAX_LEVEL && pointsForLevel(level + 1) <= p) level++;
  return level;
}

export interface LevelProgress {
  level: number;
  points: number;
  /** Points gagnés depuis le début du niveau courant. */
  intoLevel: number;
  /** Points nécessaires pour passer au niveau suivant, 0 au niveau max. */
  toNext: number;
}

export function levelProgress(points: number): LevelProgress {
  const level = levelFromPoints(points);
  return {
    level,
    points,
    intoLevel: points - pointsForLevel(level),
    toNext: level >= MAX_LEVEL ? 0 : levelCost(level),
  };
}

export interface LevelTier {
  /** 1 à 5 */
  index: number;
  name: string;
  /** Bornes de niveau incluses, telles qu'affichées (le palier 1 commence à 0). */
  from: number;
  to: number;
}

export const LEVEL_TIERS: readonly LevelTier[] = [
  { index: 1, name: 'Novice', from: 0, to: 20 },
  { index: 2, name: 'Initié', from: 21, to: 40 },
  { index: 3, name: 'Aguerri', from: 41, to: 60 },
  { index: 4, name: 'Vétéran', from: 61, to: 80 },
  { index: 5, name: 'Légende', from: 81, to: 100 },
];

export function levelTier(level: number): LevelTier {
  return LEVEL_TIERS.find((t) => level <= t.to) ?? LEVEL_TIERS[LEVEL_TIERS.length - 1]!;
}
