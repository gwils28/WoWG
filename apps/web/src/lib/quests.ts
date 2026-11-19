import {
  QUEST_MAX_STEPS,
  type QuestPeriod,
  type QuestRecurrence,
  type TreeFile,
} from '@wowg/shared';
import type { QuestOffer, QuestRun, TreeQuestState, TreeQuestStateKind } from './api';

/** Marqueur d'un talent : « ! » disponible, « ? » prête à rendre, « ? » terne en cours. */
export type QuestMark = 'available' | 'active' | 'ready';

export interface TalentQuests {
  mark: QuestMark;
  quests: { id: string; name: string; state: TreeQuestStateKind }[];
}

const MARK_PRIORITY: Record<QuestMark, number> = { ready: 3, available: 2, active: 1 };

/** Quêtes visibles par talent ; une quête indisponible n'est pas signalée sur l'arbre. */
export function talentQuestMarks(
  tree: TreeFile,
  states: readonly TreeQuestState[] = [],
): Record<string, TalentQuests> {
  const names = new Map((tree.quests ?? []).map((q) => [q.id, q.name]));
  const out: Record<string, TalentQuests> = {};
  for (const s of states) {
    if (s.state === 'unavailable') continue;
    const mark: QuestMark = s.state;
    for (const talentId of s.talents) {
      const entry = out[talentId] ?? { mark, quests: [] };
      if (MARK_PRIORITY[mark] > MARK_PRIORITY[entry.mark]) entry.mark = mark;
      entry.quests.push({ id: s.id, name: names.get(s.id) ?? s.id, state: s.state });
      out[talentId] = entry;
    }
  }
  return out;
}

export const QUEST_STATE_LABELS: Record<TreeQuestStateKind, string> = {
  available: 'disponible',
  unavailable: 'indisponible',
  active: 'en cours',
  ready: 'prête à rendre',
};

const PER: Record<QuestPeriod, { one: string; many: string; by: string }> = {
  day: { one: 'jour', many: 'jours', by: 'par jour' },
  week: { one: 'semaine', many: 'semaines', by: 'par semaine' },
  month: { one: 'mois', many: 'mois', by: 'par mois' },
};

export const periodName = (per: QuestPeriod, n: number) => (n > 1 ? PER[per].many : PER[per].one);

/** « 3 fois par semaine pendant 4 semaines », « 1 fois par jour pendant 1 jour ». */
export function recurrenceLabel(rec: QuestRecurrence): string {
  return `${rec.times} fois ${PER[rec.per].by} pendant ${rec.periods} ${periodName(rec.per, rec.periods)}`;
}

export interface OfferGroup {
  key: string;
  title: string;
  icon: string | null;
  offers: QuestOffer[];
}

/** Quêtes disponibles par classe : épinglées d'abord, puis par nom ; quêtes personnelles à la fin. */
export function groupOffers(
  offers: readonly QuestOffer[],
  pinned: readonly string[],
): OfferGroup[] {
  const groups = new Map<string, OfferGroup>();
  const custom: QuestOffer[] = [];
  for (const o of offers) {
    if (o.source === 'custom' || !o.origin) {
      custom.push(o);
      continue;
    }
    const d = o.origin.domain;
    const g = groups.get(d.id) ?? { key: d.id, title: d.name, icon: d.icon, offers: [] };
    g.offers.push(o);
    groups.set(d.id, g);
  }
  const rank = (id: string) => {
    const i = pinned.indexOf(id);
    return i === -1 ? Infinity : i;
  };
  const sorted = [...groups.values()].sort(
    (a, b) => rank(a.key) - rank(b.key) || a.title.localeCompare(b.title, 'fr'),
  );
  if (custom.length > 0) {
    sorted.push({ key: 'custom', title: 'Quêtes personnelles', icon: null, offers: custom });
  }
  return sorted;
}

/** Une étape par ligne, lignes vides ignorées, au plus QUEST_MAX_STEPS. */
export function stepsFromText(text: string): string[] {
  return text
    .split('\n')
    .map((l) => l.trim())
    .filter(Boolean)
    .slice(0, QUEST_MAX_STEPS);
}

/** Clé stable d'une quête disponible (pour React et les dialogues). */
export const offerKey = (o: QuestOffer) =>
  o.source === 'tree' ? `tree:${o.specializationId}/${o.questId}` : `custom:${o.customQuestId}`;

/** Résumé de progression d'un suivi : « 2/3 étapes · 1/4 semaines ». */
export function progressLabel(run: Pick<QuestRun, 'progress'>): string {
  const { stepsDone, stepsTotal, recurrence } = run.progress;
  const parts: string[] = [];
  if (stepsTotal > 0) parts.push(`${stepsDone}/${stepsTotal} étape${stepsTotal > 1 ? 's' : ''}`);
  if (recurrence) {
    const { successfulPeriods, requiredPeriods, per } = recurrence;
    parts.push(`${successfulPeriods}/${requiredPeriods} ${periodName(per, requiredPeriods)}`);
  }
  return parts.join(' · ');
}

/** Date locale (et non UTC) au format AAAA-MM-JJ. */
export const localToday = () => new Date().toLocaleDateString('sv-SE');
