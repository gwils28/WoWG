import type {
  CustomQuest,
  QuestDefinition,
  QuestPeriod,
  QuestRecurrence,
  QuestSize,
  QuestTalentRef,
  Talent,
  TreeFile,
  TreeQuest,
} from '../schema';
import {
  canAddRank,
  canRemoveRank,
  findTalent,
  talentState,
  type Check,
  type Ranks,
} from './ranks';

export function treeQuestDefinition(specializationId: string, quest: TreeQuest): QuestDefinition {
  return {
    name: quest.name,
    description: quest.description,
    talents: quest.talents.map((talentId) => ({ specializationId, talentId })),
    steps: quest.steps ?? [],
    ...(quest.recurrence && { recurrence: quest.recurrence }),
  };
}

export function customQuestDefinition(quest: CustomQuest): QuestDefinition {
  return {
    name: quest.name,
    description: quest.description,
    talents: quest.talents,
    steps: quest.steps,
    ...(quest.recurrence && { recurrence: quest.recurrence }),
    ...(quest.size && { size: quest.size }),
  };
}

// --- Contexte : arbres et rangs courants, par spécialisation ---------------------------------

export interface TreeContext {
  tree: TreeFile;
  ranks: Ranks;
}

/** Arbre et rangs d'une spécialisation, ou undefined si elle n'existe plus. */
export type TreeLookup = (specializationId: string) => TreeContext | undefined;

function lookupTalent(lookup: TreeLookup, ref: QuestTalentRef): Talent | undefined {
  const ctx = lookup(ref.specializationId);
  return ctx && findTalent(ctx.tree, ref.talentId);
}

// --- Barème d'or (SPEC 10.5) -----------------------------------------------------------------

export const GOLD_RULES = {
  /** Or d'un talent : 1 + floor((palier - 1) / tierStep). */
  tierStep: 2,
  ultimateBonus: 2,
  /** Rythme : + ceil(times * periods / recurrenceDivisor). */
  recurrenceDivisor: 4,
  /** Étapes : + floor(étapes / stepsDivisor). */
  stepsDivisor: 3,
  size: { small: 1, medium: 2, large: 4 } satisfies Record<QuestSize, number>,
} as const;

export function talentGold(talent: Pick<Talent, 'tier' | 'ultimate'>): number {
  return (
    1 +
    Math.floor((talent.tier - 1) / GOLD_RULES.tierStep) +
    (talent.ultimate ? GOLD_RULES.ultimateBonus : 0)
  );
}

/**
 * Or rapporté par une quête. Un talent introuvable ou déjà au rang max ne rapporte rien (SPEC 10.5 :
 * évite de refaire une quête pour l'or d'un talent achevé) ; une quête rapporte au moins 1.
 */
export function questGold(def: QuestDefinition, lookup: TreeLookup): number {
  let gold = def.size ? GOLD_RULES.size[def.size] : 0;
  for (const ref of def.talents) {
    const ctx = lookup(ref.specializationId);
    const talent = ctx && findTalent(ctx.tree, ref.talentId);
    if (talent && (ctx.ranks[talent.id] ?? 0) < talent.maxRank) gold += talentGold(talent);
  }
  if (def.recurrence) {
    const { times, periods } = def.recurrence;
    gold += Math.ceil((times * periods) / GOLD_RULES.recurrenceDivisor);
  }
  gold += Math.floor(def.steps.length / GOLD_RULES.stepsDivisor);
  return Math.max(1, gold);
}

export function goldBalance(events: readonly { amount: number }[]): number {
  return events.reduce((sum, e) => sum + e.amount, 0);
}

// --- Périodes calendaires (UTC, comme le journal) --------------------------------------------

/** Jour (AAAA-MM-JJ) d'un horodatage ISO : sa partie date, en UTC. */
export function dayOf(iso: string): string {
  return iso.slice(0, 10);
}

/** Jour décalé de n jours (AAAA-MM-JJ, UTC). */
export function addDays(day: string, n: number): string {
  const d = new Date(`${day}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

function mondayOf(day: string): string {
  const weekday = (new Date(`${day}T00:00:00Z`).getUTCDay() + 6) % 7; // lundi = 0
  return addDays(day, -weekday);
}

/**
 * Clé de la période contenant l'instant : le jour, le lundi de la semaine ISO, ou AAAA-MM.
 * Les clés d'un même type se comparent dans l'ordre chronologique.
 */
export function periodKey(iso: string, per: QuestPeriod): string {
  const day = dayOf(iso);
  if (per === 'day') return day;
  if (per === 'week') return mondayOf(day);
  return day.slice(0, 7);
}

/** Dernier jour de la P-ième période à partir de l'acceptation : échéance proposée par défaut. */
export function suggestedDeadline(rec: QuestRecurrence, acceptedAt: string): string {
  const day = dayOf(acceptedAt);
  if (rec.per === 'day') return addDays(day, rec.periods - 1);
  if (rec.per === 'week') return addDays(mondayOf(day), 7 * rec.periods - 1);
  const [y, m] = day.split('-').map(Number) as [number, number];
  return new Date(Date.UTC(y, m - 1 + rec.periods, 0)).toISOString().slice(0, 10);
}

/** Lundi (AAAA-MM-JJ) de la semaine ISO contenant l'instant, en UTC. */
export function isoWeekStart(iso: string): string {
  return mondayOf(dayOf(iso));
}

/**
 * Limiteur des quêtes personnelles (SPEC 10.3) : au plus un rendu par semaine ISO. `completedAts` :
 * dates des rendus non annulés de la même quête personnelle.
 */
export function weeklyTurnInCheck(completedAts: readonly string[], occurredAt: string): Check {
  const week = isoWeekStart(occurredAt);
  if (!completedAts.some((at) => isoWeekStart(at) === week)) return { ok: true };
  const [, m, d] = addDays(week, 7).split('-');
  return {
    ok: false,
    reason: `quête personnelle déjà rendue cette semaine, de nouveau possible le lundi ${d}/${m}`,
  };
}

/** En retard : le jour courant dépasse l'échéance (une quête due aujourd'hui ne l'est pas). */
export function isOverdue(deadline: string | null | undefined, now: string): boolean {
  return !!deadline && dayOf(now) > deadline;
}

// --- Progression d'un suivi ------------------------------------------------------------------

export interface QuestTick {
  occurredAt: string;
}

export interface RecurrenceProgress {
  times: number;
  per: QuestPeriod;
  successfulPeriods: number;
  requiredPeriods: number;
  /** Occurrences de la période courante. */
  currentCount: number;
  done: boolean;
}

/**
 * Une période est réussie avec au moins `times` occurrences. Une période ratée ne compte pas mais
 * n'annule rien : il faut `periods` périodes réussies, consécutives ou non. Les occurrences
 * antérieures à la période d'acceptation sont ignorées.
 */
export function recurrenceProgress(
  rec: QuestRecurrence,
  acceptedAt: string,
  ticks: readonly QuestTick[],
  now: string,
): RecurrenceProgress {
  const start = periodKey(acceptedAt, rec.per);
  const counts = new Map<string, number>();
  for (const t of ticks) {
    const key = periodKey(t.occurredAt, rec.per);
    if (key < start) continue;
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }
  const successfulPeriods = [...counts.values()].filter((n) => n >= rec.times).length;
  return {
    times: rec.times,
    per: rec.per,
    successfulPeriods,
    requiredPeriods: rec.periods,
    currentCount: counts.get(periodKey(now, rec.per)) ?? 0,
    done: successfulPeriods >= rec.periods,
  };
}

export interface QuestRunState {
  acceptedAt: string;
  /** Indices des étapes cochées. */
  stepsDone: readonly number[];
}

export interface QuestProgress {
  stepsDone: number;
  stepsTotal: number;
  recurrence?: RecurrenceProgress;
  /** Toutes les étapes cochées et rythme atteint. */
  ready: boolean;
}

export function questProgress(
  def: QuestDefinition,
  run: QuestRunState,
  ticks: readonly QuestTick[],
  now: string,
): QuestProgress {
  const stepsTotal = def.steps.length;
  const stepsDone = new Set(run.stepsDone.filter((i) => i >= 0 && i < stepsTotal)).size;
  const recurrence = def.recurrence
    ? recurrenceProgress(def.recurrence, run.acceptedAt, ticks, now)
    : undefined;
  return {
    stepsDone,
    stepsTotal,
    ...(recurrence && { recurrence }),
    ready: stepsDone === stepsTotal && (recurrence?.done ?? true),
  };
}

// --- Disponibilité d'une quête proposée ------------------------------------------------------

/**
 * Disponible quand tous les talents récompensés sont débloqués et qu'au moins l'un n'est pas au
 * rang max. Rendue, elle redevient donc disponible tant qu'il reste un rang à gagner.
 */
export function treeQuestAvailability(tree: TreeFile, ranks: Ranks, quest: TreeQuest): Check {
  const talents = quest.talents.map((id) => findTalent(tree, id));
  const unknown = quest.talents.filter((_, i) => !talents[i]);
  if (unknown.length > 0) {
    return { ok: false, reason: `talent(s) inconnu(s) : ${unknown.join(', ')}` };
  }
  const known = talents as Talent[];
  const locked = known.filter((t) => talentState(tree, ranks, t.id) === 'locked');
  if (locked.length > 0) {
    return {
      ok: false,
      reason: `talent(s) verrouillé(s) : ${locked.map((t) => t.name).join(', ')}`,
    };
  }
  if (known.every((t) => (ranks[t.id] ?? 0) >= t.maxRank)) {
    return { ok: false, reason: 'tous les talents récompensés sont au rang max' };
  }
  return { ok: true };
}

// --- Rendu et annulation ---------------------------------------------------------------------

export interface SkippedReward {
  ref: QuestTalentRef;
  reason: string;
}

export type TurnInPlan =
  { ok: true; grants: QuestTalentRef[]; skipped: SkippedReward[] } | { ok: false; reason: string };

/** Copies des rangs, modifiées au fil du calcul (plusieurs récompenses dans un même arbre). */
function workingRanks() {
  const copies = new Map<string, Ranks>();
  return (specializationId: string, ctx: TreeContext): Ranks => {
    let ranks = copies.get(specializationId);
    if (!ranks) {
      ranks = { ...ctx.ranks };
      copies.set(specializationId, ranks);
    }
    return ranks;
  };
}

/** Récompenses triées par palier, pour qu'un parent récompensé passe avant son enfant. */
function byTier(lookup: TreeLookup, refs: readonly QuestTalentRef[], order: 1 | -1) {
  const tier = (ref: QuestTalentRef) => lookupTalent(lookup, ref)?.tier ?? 0;
  return [...refs].sort((a, b) => order * (tier(a) - tier(b)));
}

/**
 * Rangs accordés au rendu. Talent déjà au rang max, supprimé ou d'un arbre disparu : ignoré (l'or
 * reste dû). Talent verrouillé : rendu refusé, comme un clic sur le talent.
 */
export function planTurnIn(
  def: QuestDefinition,
  progress: QuestProgress,
  lookup: TreeLookup,
): TurnInPlan {
  if (!progress.ready) {
    return { ok: false, reason: 'quête incomplète : étapes ou rythme non atteints' };
  }
  const ranksOf = workingRanks();
  const grants: QuestTalentRef[] = [];
  const skipped: SkippedReward[] = [];
  for (const ref of byTier(lookup, def.talents, 1)) {
    const ctx = lookup(ref.specializationId);
    const talent = ctx && findTalent(ctx.tree, ref.talentId);
    if (!ctx || !talent) {
      skipped.push({ ref, reason: 'talent introuvable' });
      continue;
    }
    const ranks = ranksOf(ref.specializationId, ctx);
    if ((ranks[talent.id] ?? 0) >= talent.maxRank) {
      skipped.push({ ref, reason: `"${talent.name}" est déjà au rang max` });
      continue;
    }
    const check = canAddRank(ctx.tree, ranks, talent.id);
    if (!check.ok) return { ok: false, reason: `${talent.name} : ${check.reason}` };
    ranks[talent.id] = (ranks[talent.id] ?? 0) + 1;
    grants.push(ref);
  }
  return { ok: true, grants, skipped };
}

/**
 * Annuler un rendu retire les rangs accordés et l'or gagné. Refusé si un retrait de rang l'est
 * (enfant dépendant, rang déjà retiré) ou si le solde d'or deviendrait négatif.
 */
export function canUndoTurnIn(
  grants: readonly QuestTalentRef[],
  gold: number,
  balance: number,
  lookup: TreeLookup,
): Check {
  if (balance - gold < 0) {
    return {
      ok: false,
      reason: `solde d'or insuffisant : ${balance} or, ce rendu en a rapporté ${gold}`,
    };
  }
  const ranksOf = workingRanks();
  for (const ref of byTier(lookup, grants, -1)) {
    const ctx = lookup(ref.specializationId);
    if (!ctx || !findTalent(ctx.tree, ref.talentId)) continue; // progression orpheline : rien à protéger
    const ranks = ranksOf(ref.specializationId, ctx);
    const check = canRemoveRank(ctx.tree, ranks, ref.talentId);
    if (!check.ok) return check;
    ranks[ref.talentId] = (ranks[ref.talentId] ?? 0) - 1;
  }
  return { ok: true };
}
