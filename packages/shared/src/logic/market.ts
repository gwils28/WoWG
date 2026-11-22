import type { Rarity, RewardCard } from '../schema';
import { addDays, dayOf } from './quests';
import type { Check } from './ranks';

// --- Étal (SPEC 10.8) : logique pure, sans base ni horloge ------------------------------------

/** Raretés, de la plus commune à la plus rare (ordre d'affichage). */
export const RARITIES: readonly Rarity[] = ['common', 'uncommon', 'rare', 'epic', 'legendary'];

/** Recharge proposée à la création d'une carte, selon sa rareté (modifiable). */
export const DEFAULT_COOLDOWN: Record<Rarity, number> = {
  common: 1,
  uncommon: 7,
  rare: 30,
  epic: 90,
  legendary: 365,
};

export interface PurchaseRecord {
  purchasedAt: string;
  undoneAt?: string | null;
}

export type CardAvailability =
  | { ok: true }
  | { ok: false; reason: 'archived' }
  | { ok: false; reason: 'cooldown'; availableOn: string; daysLeft: number }
  | { ok: false; reason: 'insufficient'; missing: number };

const DAY_MS = 86_400_000;

function daysBetween(from: string, to: string): number {
  return Math.round((Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / DAY_MS);
}

/** Dernier achat non annulé (le plus récent), ou undefined. */
export function lastPurchase<P extends PurchaseRecord>(purchases: readonly P[]): P | undefined {
  let last: P | undefined;
  for (const p of purchases) {
    if (p.undoneAt) continue;
    if (!last || p.purchasedAt > last.purchasedAt) last = p;
  }
  return last;
}

/**
 * Une carte est achetable si elle n'est pas archivée, si sa recharge est écoulée (de nouveau
 * achetable le jour `dernier achat + recharge`, jours calendaires UTC, achats annulés ignorés) et si
 * le solde couvre le prix.
 */
export function cardAvailability(
  card: Pick<RewardCard, 'price' | 'cooldownDays'>,
  archived: boolean,
  purchases: readonly PurchaseRecord[],
  balance: number,
  now: string,
): CardAvailability {
  if (archived) return { ok: false, reason: 'archived' };
  const last = lastPurchase(purchases);
  if (last && card.cooldownDays) {
    const availableOn = addDays(dayOf(last.purchasedAt), card.cooldownDays);
    const daysLeft = daysBetween(dayOf(now), availableOn);
    if (daysLeft > 0) return { ok: false, reason: 'cooldown', availableOn, daysLeft };
  }
  if (balance < card.price)
    return { ok: false, reason: 'insufficient', missing: card.price - balance };
  return { ok: true };
}

/** Un achat s'annule depuis le journal, sans limite de temps, une seule fois. */
export function canUndoPurchase(purchase: Pick<PurchaseRecord, 'undoneAt'>): Check {
  return purchase.undoneAt ? { ok: false, reason: 'achat déjà annulé' } : { ok: true };
}

// --- Objectif d'épargne ----------------------------------------------------------------------

export interface GoldEventRecord {
  amount: number;
  reason: string;
  occurredAt: string;
}

/** Fenêtre de l'estimation : l'or tombe en bloc en fin de cycle, 4 semaines seraient instables. */
export const INCOME_WINDOW_WEEKS = 8;

/**
 * Revenu hebdomadaire : or des quêtes (rendus nets des annulations, achats exclus) des 8 dernières
 * semaines glissantes, divisé par 8, ou par le nombre de semaines écoulées depuis le premier gain
 * (au moins 1) s'il y en a moins. 0 sans gain.
 */
export function weeklyIncome(events: readonly GoldEventRecord[], now: string): number {
  const quest = events.filter((e) => e.reason === 'quest' || e.reason === 'quest-undo');
  const gains = quest.filter((e) => e.reason === 'quest').map((e) => Date.parse(e.occurredAt));
  if (gains.length === 0) return 0;
  const end = Date.parse(now);
  const weekMs = 7 * DAY_MS;
  const start = end - INCOME_WINDOW_WEEKS * weekMs;
  const total = quest
    .filter((e) => {
      const t = Date.parse(e.occurredAt);
      return t > start && t <= end;
    })
    .reduce((sum, e) => sum + e.amount, 0);
  const elapsed = Math.ceil((end - Math.min(...gains)) / weekMs);
  const weeks = Math.min(INCOME_WINDOW_WEEKS, Math.max(1, elapsed));
  return total / weeks;
}

/** Semaines restantes pour atteindre le prix (arrondi au-dessus) ; 0 si atteint, null sans revenu. */
export function savingsEstimate(price: number, balance: number, income: number): number | null {
  if (balance >= price) return 0;
  if (income <= 0) return null;
  return Math.ceil((price - balance) / income);
}
