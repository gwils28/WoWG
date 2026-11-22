import { describe, expect, it } from 'vitest';
import {
  canUndoPurchase,
  cardAvailability,
  DEFAULT_COOLDOWN,
  RewardCardSchema,
  savingsEstimate,
  weeklyIncome,
} from '../src';

const card = { price: 6, cooldownDays: 7 };

describe('carte de l’Étal', () => {
  it('valide et complète une carte, refuse un prix nul ou une recharge hors bornes', () => {
    const res = RewardCardSchema.safeParse({ name: ' Cinéma ', rarity: 'uncommon', price: 6 });
    expect(res.success && res.data).toEqual({
      name: 'Cinéma',
      description: '',
      rarity: 'uncommon',
      price: 6,
      unique: false,
    });
    expect(RewardCardSchema.safeParse({ name: 'x', rarity: 'rare', price: 0 }).success).toBe(false);
    expect(
      RewardCardSchema.safeParse({ name: 'x', rarity: 'rare', price: 1, cooldownDays: 0 }).success,
    ).toBe(false);
    expect(RewardCardSchema.safeParse({ name: 'x', rarity: 'mythic', price: 1 }).success).toBe(
      false,
    );
  });

  it('recharge proposée selon la rareté', () => {
    expect(DEFAULT_COOLDOWN).toEqual({
      common: 1,
      uncommon: 7,
      rare: 30,
      epic: 90,
      legendary: 365,
    });
  });
});

describe('disponibilité d’une carte', () => {
  const bought = [{ purchasedAt: '2026-11-21T22:30:00.000Z' }];

  it('archivée passe avant tout le reste', () => {
    expect(cardAvailability(card, true, [], 100, '2026-11-21T10:00:00.000Z')).toEqual({
      ok: false,
      reason: 'archived',
    });
  });

  it('recharge en jours calendaires UTC : achetable le jour dernier achat + recharge', () => {
    expect(cardAvailability(card, false, bought, 100, '2026-11-27T23:59:59.000Z')).toEqual({
      ok: false,
      reason: 'cooldown',
      availableOn: '2026-11-28',
      daysLeft: 1,
    });
    expect(cardAvailability(card, false, bought, 100, '2026-11-28T00:00:00.000Z')).toEqual({
      ok: true,
    });
  });

  it('ignore les achats annulés et prend le dernier achat', () => {
    const undone = [{ purchasedAt: '2026-11-21T10:00:00.000Z', undoneAt: '2026-11-21T11:00:00Z' }];
    expect(cardAvailability(card, false, undone, 100, '2026-11-22T10:00:00.000Z').ok).toBe(true);
    const two = [{ purchasedAt: '2026-11-01T10:00:00.000Z' }, ...bought];
    const res = cardAvailability(card, false, two, 100, '2026-11-22T10:00:00.000Z');
    expect(res.ok === false && res.reason === 'cooldown' && res.availableOn).toBe('2026-11-28');
  });

  it('sans recharge : rachetable à volonté', () => {
    expect(cardAvailability({ price: 1 }, false, bought, 1, '2026-11-21T23:00:00.000Z').ok).toBe(
      true,
    );
  });

  it('solde exactement égal au prix accepté, sinon or manquant', () => {
    expect(cardAvailability(card, false, [], 6, '2026-11-21T10:00:00.000Z').ok).toBe(true);
    expect(cardAvailability(card, false, [], 4, '2026-11-21T10:00:00.000Z')).toEqual({
      ok: false,
      reason: 'insufficient',
      missing: 2,
    });
  });

  it('un achat ne s’annule qu’une fois', () => {
    expect(canUndoPurchase({ undoneAt: null }).ok).toBe(true);
    expect(canUndoPurchase({ undoneAt: '2026-11-21T10:00:00.000Z' }).ok).toBe(false);
  });
});

describe('objectif d’épargne', () => {
  const now = '2026-11-21T12:00:00.000Z';
  const ev = (amount: number, reason: string, occurredAt: string) => ({
    amount,
    reason,
    occurredAt,
  });

  it('revenu nul sans gain de quête', () => {
    expect(weeklyIncome([], now)).toBe(0);
    expect(weeklyIncome([ev(-6, 'purchase', '2026-11-20T10:00:00.000Z')], now)).toBe(0);
  });

  it('moyenne sur 8 semaines, achats exclus, annulations de rendu déduites', () => {
    const events = [
      ev(10, 'quest', '2026-08-01T10:00:00.000Z'), // hors fenêtre, mais historique > 8 semaines
      ev(24, 'quest', '2026-10-10T10:00:00.000Z'),
      ev(16, 'quest', '2026-11-14T10:00:00.000Z'),
      ev(-4, 'quest-undo', '2026-11-15T10:00:00.000Z'),
      ev(-30, 'purchase', '2026-11-16T10:00:00.000Z'),
    ];
    expect(weeklyIncome(events, now)).toBe((24 + 16 - 4) / 8);
  });

  it('moins de 8 semaines d’historique : divisé par les semaines écoulées (au moins 1)', () => {
    expect(weeklyIncome([ev(6, 'quest', '2026-11-07T12:00:00.000Z')], now)).toBe(3); // 2 semaines
    expect(weeklyIncome([ev(6, 'quest', '2026-11-21T08:00:00.000Z')], now)).toBe(6); // < 1 semaine
  });

  it('semaines restantes arrondies au-dessus, 0 si atteint, null sans revenu', () => {
    expect(savingsEstimate(100, 40, 5)).toBe(12);
    expect(savingsEstimate(100, 41, 5)).toBe(12);
    expect(savingsEstimate(100, 100, 0)).toBe(0);
    expect(savingsEstimate(100, 40, 0)).toBeNull();
    expect(savingsEstimate(100, 40, -1)).toBeNull();
  });
});
