import { describe, expect, it } from 'vitest';
import type { MarketCard } from '../src/lib/api';
import { availabilityLabel, cooldownLabel, groupByRarity, savingsLabel } from '../src/lib/market';

const card = (id: number, rarity: MarketCard['rarity']): MarketCard => ({
  id,
  name: `c${id}`,
  description: '',
  rarity,
  price: 1,
  unique: false,
  archived: false,
  availability: { ok: true },
  lastPurchasedAt: null,
  purchaseCount: 0,
});

describe('Étal', () => {
  it('groupe par rareté, de commune à légendaire, sans groupe vide', () => {
    const groups = groupByRarity([card(1, 'epic'), card(2, 'common'), card(3, 'epic')]);
    expect(groups.map((g) => [g.rarity, g.cards.map((c) => c.id)])).toEqual([
      ['common', [2]],
      ['epic', [1, 3]],
    ]);
  });

  it('libellés de disponibilité', () => {
    expect(availabilityLabel({ ok: true })).toBe('Achetable');
    expect(availabilityLabel({ ok: false, reason: 'insufficient', missing: 3 })).toBe(
      'Il manque 3 or',
    );
    expect(
      availabilityLabel({ ok: false, reason: 'cooldown', availableOn: '2026-11-28', daysLeft: 1 }),
    ).toBe('Disponible demain');
    expect(
      availabilityLabel({ ok: false, reason: 'cooldown', availableOn: '2026-11-28', daysLeft: 7 }),
    ).toBe('Disponible dans 7 jours (28 novembre)');
  });

  it('recharge et estimation', () => {
    expect(cooldownLabel({ unique: true, cooldownDays: 365 })).toBe('Achat unique');
    expect(cooldownLabel({ unique: false })).toBe('Sans recharge');
    expect(cooldownLabel({ unique: false, cooldownDays: 1 })).toBe('Recharge 1 jour');
    expect(savingsLabel(0)).toBe('Objectif atteint');
    expect(savingsLabel(null)).toMatch(/Pas encore/);
    expect(savingsLabel(12)).toBe('Environ 12 semaines au rythme actuel');
  });
});
