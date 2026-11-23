import { describe, expect, it } from 'vitest';
import {
  arrowPath,
  CELL,
  ICON,
  PAD,
  placeTooltip,
  talentCenter,
  treeSize,
  fitScale,
  MIN_SCALE,
} from '../src/lib/layout';

describe('layout', () => {
  it('place le centre des cases sur la grille', () => {
    expect(talentCenter({ tier: 1, column: 1 })).toEqual({ x: PAD + CELL / 2, y: PAD + CELL / 2 });
    expect(talentCenter({ tier: 3, column: 2 })).toEqual({
      x: PAD + CELL * 1.5,
      y: PAD + CELL * 2.5,
    });
  });

  it('dimensionne le conteneur selon la grille', () => {
    const size = treeSize({ grid: { tiers: 7, columns: 4 } } as never);
    expect(size).toEqual({ width: 4 * CELL + 2 * PAD, height: 7 * CELL + 2 * PAD });
  });

  it('trace une flèche verticale dans la même colonne', () => {
    const p = talentCenter({ tier: 1, column: 2 });
    const c = talentCenter({ tier: 3, column: 2 });
    expect(arrowPath({ tier: 1, column: 2 }, { tier: 3, column: 2 })).toBe(
      `M ${p.x} ${p.y + ICON / 2} V ${c.y - ICON / 2 - 4}`,
    );
  });

  it('part du flanc droit ou gauche du parent selon la position de l’enfant', () => {
    const right = arrowPath({ tier: 1, column: 1 }, { tier: 2, column: 3 });
    const left = arrowPath({ tier: 1, column: 3 }, { tier: 2, column: 1 });
    const p1 = talentCenter({ tier: 1, column: 1 });
    const p3 = talentCenter({ tier: 1, column: 3 });
    expect(right.startsWith(`M ${p1.x + ICON / 2} ${p1.y} H `)).toBe(true);
    expect(left.startsWith(`M ${p3.x - ICON / 2} ${p3.y} H `)).toBe(true);
  });
});

describe('placeTooltip', () => {
  const viewport = { width: 1000, height: 800 };
  const size = { width: 290, height: 200 };
  const anchor = (left: number, top: number) => ({ left, top, width: 56, height: 56 });

  it('se place à droite du talent quand la place suffit', () => {
    expect(placeTooltip(anchor(100, 100), size, viewport)).toEqual({ x: 168, y: 100 });
  });

  it('bascule à gauche près du bord droit', () => {
    expect(placeTooltip(anchor(900, 100), size, viewport)).toEqual({ x: 900 - 12 - 290, y: 100 });
  });

  it('reste dans la fenêtre si aucun côté ne tient (mobile)', () => {
    const p = placeTooltip(anchor(150, 100), size, { width: 360, height: 640 });
    expect(p.x).toBeGreaterThanOrEqual(8);
    expect(p.x + size.width).toBeLessThanOrEqual(360 - 8);
  });

  it('remonte près du bas de la fenêtre', () => {
    expect(placeTooltip(anchor(100, 750), size, viewport).y).toBe(800 - 8 - 200);
  });

  it("colle au bord gauche si l'infobulle est plus large que la fenêtre", () => {
    expect(
      placeTooltip(anchor(10, 10), { width: 500, height: 100 }, { width: 300, height: 600 }).x,
    ).toBe(8);
  });
});

describe('fitScale', () => {
  it('garde la taille réelle quand tout tient ou sur petit écran', () => {
    expect(fitScale(2000, [400, 500])).toBe(1);
    expect(fitScale(600, [500, 500, 500])).toBe(1);
    expect(fitScale(0, [500])).toBe(1);
    expect(fitScale(1200, [])).toBe(1);
  });

  it('réduit les arbres pour tenir sur une ligne, sans descendre sous le minimum', () => {
    // 3 arbres de 472 px : 1376 - 3 x 28 - 2 x 16 = 1260 disponibles pour 1416
    expect(fitScale(1376, [472, 472, 472])).toBe(0.88);
    expect(fitScale(950, [472, 472, 472, 472, 472])).toBe(MIN_SCALE);
  });
});
