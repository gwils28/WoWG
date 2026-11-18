/**
 * Passer du niveau L au niveau L+1 coûte L points (1 rang = 1 point).
 * Points cumulés pour atteindre le niveau L : L(L-1)/2. Niveau 1 à 0 point, niveau max 100
 * (4 950 points).
 */
export const MAX_LEVEL = 100;

export function pointsForLevel(level: number): number {
  return (level * (level - 1)) / 2;
}

export function levelFromPoints(points: number): number {
  const p = Math.max(0, Math.floor(points));
  // plus grand L tel que L(L-1)/2 <= p
  let level = Math.floor((1 + Math.sqrt(1 + 8 * p)) / 2);
  while (pointsForLevel(level + 1) <= p) level++;
  while (level > 1 && pointsForLevel(level) > p) level--;
  return Math.min(level, MAX_LEVEL);
}

export interface LevelProgress {
  level: number;
  points: number;
  /** Points gagnés depuis le début du niveau courant. */
  intoLevel: number;
  /** Points nécessaires pour passer au niveau suivant (= level), 0 au niveau max. */
  toNext: number;
}

export function levelProgress(points: number): LevelProgress {
  const level = levelFromPoints(points);
  return {
    level,
    points,
    intoLevel: points - pointsForLevel(level),
    toNext: level >= MAX_LEVEL ? 0 : level,
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
