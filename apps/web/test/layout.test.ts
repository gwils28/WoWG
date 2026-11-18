import { describe, expect, it } from 'vitest';
import { arrowPath, CELL, ICON, PAD, talentCenter, treeSize } from '../src/lib/layout';

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
