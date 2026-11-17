/**
 * Passer du niveau L au niveau L+1 coûte L points (1 rang = 1 point).
 * Points cumulés pour atteindre le niveau L : L(L-1)/2. Niveau 1 à 0 point, pas de niveau max.
 */
export function pointsForLevel(level: number): number {
  return (level * (level - 1)) / 2;
}

export function levelFromPoints(points: number): number {
  const p = Math.max(0, Math.floor(points));
  // plus grand L tel que L(L-1)/2 <= p
  let level = Math.floor((1 + Math.sqrt(1 + 8 * p)) / 2);
  while (pointsForLevel(level + 1) <= p) level++;
  while (level > 1 && pointsForLevel(level) > p) level--;
  return level;
}

export interface LevelProgress {
  level: number;
  points: number;
  /** Points gagnés depuis le début du niveau courant. */
  intoLevel: number;
  /** Points nécessaires pour passer au niveau suivant (= level). */
  toNext: number;
}

export function levelProgress(points: number): LevelProgress {
  const level = levelFromPoints(points);
  return { level, points, intoLevel: points - pointsForLevel(level), toNext: level };
}
