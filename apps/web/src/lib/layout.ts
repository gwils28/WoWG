import type { Talent, TreeFile } from '@wowg/shared';

/** Géométrie de l'arbre, en pixels. Fonctions pures, testées dans apps/web/test. */
export const CELL = 88;
export const ICON = 56;
export const PAD = 16;

export interface Point {
  x: number;
  y: number;
}

export function treeSize(tree: TreeFile) {
  return {
    width: tree.grid.columns * CELL + PAD * 2,
    height: tree.grid.tiers * CELL + PAD * 2,
  };
}

/** Centre de la case d'un talent. */
export function talentCenter(t: Pick<Talent, 'tier' | 'column'>): Point {
  return {
    x: PAD + (t.column - 1) * CELL + CELL / 2,
    y: PAD + (t.tier - 1) * CELL + CELL / 2,
  };
}

/**
 * Tracé d'une flèche de prérequis, façon arbre classique :
 * même colonne, trait vertical ; sinon, départ du flanc du parent, horizontal jusqu'à la
 * colonne de l'enfant, puis descente vers le haut de son icône.
 */
export function arrowPath(
  parent: Pick<Talent, 'tier' | 'column'>,
  child: Pick<Talent, 'tier' | 'column'>,
): string {
  const p = talentCenter(parent);
  const c = talentCenter(child);
  const half = ICON / 2;
  const endY = c.y - half - 4;
  if (parent.column === child.column) {
    return `M ${p.x} ${p.y + half} V ${endY}`;
  }
  const startX = p.x + (c.x > p.x ? half : -half);
  return `M ${startX} ${p.y} H ${c.x} V ${endY}`;
}

export interface Box {
  left: number;
  top: number;
  width: number;
  height: number;
}

/**
 * Position (coordonnées de fenêtre) d'une infobulle à côté d'un élément ancre.
 * Préfère la droite, puis la gauche si la droite ne tient pas, puis le côté le plus large ;
 * le résultat est toujours contraint aux bords de la fenêtre (marge `margin`).
 */
export function placeTooltip(
  anchor: Box,
  size: { width: number; height: number },
  viewport: { width: number; height: number },
  gap = 12,
  margin = 8,
): Point {
  const right = anchor.left + anchor.width + gap;
  const left = anchor.left - gap - size.width;
  const fitsRight = right + size.width <= viewport.width - margin;
  const fitsLeft = left >= margin;
  const spaceRight = viewport.width - (anchor.left + anchor.width);
  let x = fitsRight ? right : fitsLeft ? left : spaceRight >= anchor.left ? right : left;
  x = clamp(x, margin, viewport.width - margin - size.width);
  const y = clamp(anchor.top, margin, viewport.height - margin - size.height);
  return { x, y };
}

function clamp(v: number, min: number, max: number): number {
  return Math.max(min, Math.min(v, Math.max(min, max)));
}
