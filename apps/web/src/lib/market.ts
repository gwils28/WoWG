import { RARITIES, type Rarity } from '@wowg/shared';
import type { CardAvailabilityView, MarketCard } from './api';
import { formatDay } from './journal';

/** « 28 novembre », sans jour de semaine ni année. */
const dayMonth = (day: string) =>
  formatDay(day)
    .replace(/^\S+\s/, '')
    .replace(/\s\d{4}$/, '');

export const RARITY_LABEL: Record<Rarity, string> = {
  common: 'Commune',
  uncommon: 'Inhabituelle',
  rare: 'Rare',
  epic: 'Épique',
  legendary: 'Légendaire',
};

/** Titre de section, au pluriel. */
export const RARITY_GROUP: Record<Rarity, string> = {
  common: 'Communes',
  uncommon: 'Inhabituelles',
  rare: 'Rares',
  epic: 'Épiques',
  legendary: 'Légendaires',
};

/** Cartes groupées par rareté, de commune à légendaire, sans groupe vide. */
export function groupByRarity(cards: readonly MarketCard[]) {
  return RARITIES.map((rarity) => ({
    rarity,
    cards: cards.filter((c) => c.rarity === rarity),
  })).filter((g) => g.cards.length > 0);
}

/** État lisible d'une carte : achetable, recharge, solde insuffisant, archivée. */
export function availabilityLabel(a: CardAvailabilityView): string {
  if (a.ok) return 'Achetable';
  if (a.reason === 'archived') return 'Archivée';
  if (a.reason === 'cooldown') {
    return a.daysLeft === 1
      ? 'Disponible demain'
      : `Disponible dans ${a.daysLeft} jours (${dayMonth(a.availableOn)})`;
  }
  return `Il manque ${a.missing} or`;
}

/** « 1 jour », « 7 jours », « achat unique », « à volonté ». */
export function cooldownLabel(card: Pick<MarketCard, 'cooldownDays' | 'unique'>): string {
  if (card.unique) return 'Achat unique';
  if (!card.cooldownDays) return 'Sans recharge';
  return `Recharge ${card.cooldownDays} jour${card.cooldownDays > 1 ? 's' : ''}`;
}

/** Estimation de l'objectif d'épargne. */
export function savingsLabel(weeksLeft: number | null): string {
  if (weeksLeft === 0) return 'Objectif atteint';
  if (weeksLeft === null) return 'Pas encore de revenu récent pour estimer';
  return `Environ ${weeksLeft} semaine${weeksLeft > 1 ? 's' : ''} au rythme actuel`;
}
