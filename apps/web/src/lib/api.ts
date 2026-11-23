import type {
  CustomQuestInput,
  LevelProgress,
  LevelTier,
  QuestDefinition,
  QuestProgress,
  QuestRecurrence,
  QuestSize,
  QuestTalentRef,
  Ranks,
  Rarity,
  RewardCardInput,
  TreeDiff,
  TreeFile,
} from '@wowg/shared';

export interface SpecSummary {
  id: string;
  domain: TreeFile['domain'];
  specialization: TreeFile['specialization'];
  points: number;
  maxPoints: number;
  updatedAt: string;
  /** classe archivée : lecture seule (SPEC 11) */
  archived: boolean;
}

export interface SpecDetail extends SpecSummary {
  tree: TreeFile;
  ranks: Ranks;
  orphans: { talentId: string; rank: number }[];
  sourcePath: string | null;
  /** État des quêtes proposées de l'arbre (marqueurs « ! » et « ? »). */
  questStates?: TreeQuestState[];
}

export type TreeQuestStateKind = 'available' | 'unavailable' | 'active' | 'ready';

export interface TreeQuestState {
  id: string;
  talents: string[];
  state: TreeQuestStateKind;
  runId: number | null;
  reason?: string;
}

export interface DomainSummary {
  domain: TreeFile['domain'];
  points: number;
  maxPoints: number;
  /** Dernière saisie de rang dans le domaine (date d'enregistrement). */
  lastActivityAt: string | null;
  pinned: boolean;
  specializations: SpecSummary[];
  /** Portrait du personnage de la classe (1 à 5, selon ses points) et son image, si fournie. */
  portraitTier: number;
  portrait: string | null;
}

export interface Character extends LevelProgress {
  tier: LevelTier & { portrait: string | null };
  /** Un portrait (ou null) par palier, dans l'ordre des paliers. */
  portraits: (string | null)[];
  /** Classe incarnée par le personnage de la fiche ; chosen : choisie (sinon automatique). */
  hero: { domain: TreeFile['domain']; chosen: boolean } | null;
  /** Ids des domaines épinglés, dans l'ordre d'épinglage. */
  pinned: string[];
  domains: DomainSummary[];
  /** Classes archivées, hors niveau, avec leur propre total (SPEC 11). */
  archive: { points: number; level: number; domains: DomainSummary[] };
  gold: number;
}

export interface RankEventView {
  id: number;
  specializationId: string;
  talentId: string;
  delta: 1 | -1;
  occurredAt: string;
  note: string | null;
}

export interface JournalEntry extends RankEventView {
  createdAt: string;
  rankAfter: number;
  maxRank: number | null;
  talentName: string;
  talentIcon: string | null;
  /** talent retiré de l'arbre depuis l'événement */
  orphan: boolean;
  domain: TreeFile['domain'] | null;
  specialization: TreeFile['specialization'] | null;
  questRunId: number | null;
  questName: string | null;
}

export interface JournalFilters {
  domain?: string;
  spec?: string;
  from?: string;
  to?: string;
}

export interface ImportPreview {
  tree: TreeFile;
  ranks: Ranks;
  diff: TreeDiff;
  targetPath: string;
}

// --- Quêtes et or ---

export interface QuestTalentView extends QuestTalentRef {
  exists: boolean;
  name: string;
  icon: string | null;
  rank: number;
  maxRank: number | null;
  nextCriterion: string | null;
  specializationName: string;
}

export interface QuestOrigin {
  domain: TreeFile['domain'];
  specialization: TreeFile['specialization'];
}

interface QuestBody {
  name: string;
  description: string;
  talents: QuestTalentView[];
  steps: string[];
  recurrence?: QuestRecurrence;
  size?: QuestSize;
  gold: number;
}

export interface TreeQuestOffer extends QuestBody {
  source: 'tree';
  specializationId: string;
  questId: string;
  origin: QuestOrigin | null;
}

export interface CustomQuestView extends QuestBody {
  source: 'custom';
  customQuestId: number;
  createdAt: string;
  updatedAt: string;
}

export type QuestOffer = TreeQuestOffer | CustomQuestView;

export interface QuestRun {
  id: number;
  source: 'tree' | 'custom';
  specializationId: string | null;
  questId: string | null;
  customQuestId: number | null;
  definition: Omit<QuestDefinition, 'talents'> & { talents: QuestTalentView[] };
  gold: number;
  acceptedAt: string;
  deadline: string | null;
  stepsDone: number[];
  status: 'active' | 'completed' | 'abandoned';
  completedAt: string | null;
  grants: QuestTalentRef[] | null;
  note: string | null;
  ticks: { id: number; occurredAt: string }[];
  progress: QuestProgress;
  overdue: boolean;
  origin: QuestOrigin | null;
}

export interface QuestBoard {
  gold: number;
  active: QuestRun[];
  available: QuestOffer[];
  completed: QuestRun[];
  custom: CustomQuestView[];
}

export interface GoldEventView {
  id: number;
  amount: number;
  reason: 'quest' | 'quest-undo' | 'purchase' | 'purchase-undo';
  runId: number | null;
  purchaseId: number | null;
  occurredAt: string;
  createdAt: string;
  questName: string | null;
  /** Achat lié (événements purchase et purchase-undo). */
  purchase: { id: number; name: string; rarity: Rarity; price: number; undone: boolean } | null;
}

// --- Étal ---

export type CardAvailabilityView =
  | { ok: true }
  | { ok: false; reason: 'archived' }
  | { ok: false; reason: 'cooldown'; availableOn: string; daysLeft: number }
  | { ok: false; reason: 'insufficient'; missing: number };

export interface MarketCard {
  id: number;
  name: string;
  description: string;
  rarity: Rarity;
  price: number;
  cooldownDays?: number;
  unique: boolean;
  archived: boolean;
  availability: CardAvailabilityView;
  lastPurchasedAt: string | null;
  purchaseCount: number;
}

export interface SavingsGoal {
  cardId: number;
  name: string;
  rarity: Rarity;
  price: number;
  /** Semaines restantes au rythme récent ; 0 si atteint, null sans revenu. */
  weeksLeft: number | null;
}

export interface Market {
  balance: number;
  weeklyIncome: number;
  goal: SavingsGoal | null;
  cards: MarketCard[];
  archived: MarketCard[];
}

export interface PurchaseView {
  id: number;
  cardId: number;
  snapshot: { name: string; rarity: Rarity; price: number };
  purchasedAt: string;
  undoneAt: string | null;
}

export type AcceptQuest = (
  | { source: 'tree'; specializationId: string; questId: string }
  | { source: 'custom'; customQuestId: number }
) & { deadline?: string | null };

export class ApiError extends Error {
  constructor(
    public status: number,
    public errors: string[],
  ) {
    super(errors.join('\n'));
  }
}

async function request<T>(method: string, path: string, body?: unknown): Promise<T> {
  const res = await fetch(`/api${path}`, {
    method,
    headers: body === undefined ? undefined : { 'content-type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new ApiError(res.status, data.errors ?? [`erreur HTTP ${res.status}`]);
  }
  return data as T;
}

export const api = {
  character: () => request<Character>('GET', '/character'),
  pinDomain: (domainId: string, pinned: boolean) =>
    request<{ pinned: string[] }>('PUT', `/domains/${domainId}/pin`, { pinned }),
  setHero: (domainId: string | null) =>
    request<{ hero: string | null }>('PUT', '/hero', { domainId }),
  archiveDomain: (domainId: string, archived: boolean) =>
    request<{ archived: string[] }>('PUT', `/domains/${domainId}/archive`, { archived }),
  specializations: () => request<SpecSummary[]>('GET', '/specializations'),
  specialization: (id: string) => request<SpecDetail>('GET', `/specializations/${id}`),
  addRank: (specId: string, talentId: string, body: { note?: string; occurredAt?: string }) =>
    request<{ event: RankEventView; specialization: SpecDetail }>(
      'POST',
      `/specializations/${specId}/talents/${talentId}/ranks`,
      body,
    ),
  removeRank: (specId: string, talentId: string) =>
    request<{ event: RankEventView; specialization: SpecDetail }>(
      'DELETE',
      `/specializations/${specId}/talents/${talentId}/ranks`,
    ),
  updateSpecialization: (id: string, tree: TreeFile) =>
    request<{ specialization: SpecDetail; diff: TreeDiff }>('PUT', `/specializations/${id}`, tree),
  treeFiles: () => request<string[]>('GET', '/tree-files'),
  previewImport: (source: { path: string } | { content: unknown }) =>
    request<ImportPreview>('POST', '/import/preview', source),
  applyImport: (source: { path: string } | { content: unknown }) =>
    request<{ specialization: SpecDetail; diff: TreeDiff }>('POST', '/import/apply', source),
  journal: (filters: JournalFilters) => {
    const qs = new URLSearchParams(
      Object.entries(filters).filter((kv): kv is [string, string] => !!kv[1]),
    ).toString();
    return request<JournalEntry[]>('GET', `/journal${qs ? `?${qs}` : ''}`);
  },
  /** URL directe : le serveur renvoie un en-tête Content-Disposition */
  backupUrl: '/api/backup',
  restoreBackup: (backup: unknown) =>
    request<{
      specializations: number;
      events: number;
      questRuns?: number;
      goldEvents?: number;
      purchases?: number;
    }>('POST', '/backup', backup),
  quests: () => request<QuestBoard>('GET', '/quests'),
  acceptQuest: (body: AcceptQuest) => request<QuestRun>('POST', '/quests/accept', body),
  setDeadline: (runId: number, deadline: string | null) =>
    request<QuestRun>('PATCH', `/quest-runs/${runId}`, { deadline }),
  setStep: (runId: number, index: number, done: boolean) =>
    request<QuestRun>('PUT', `/quest-runs/${runId}/steps/${index}`, { done }),
  addTick: (runId: number, occurredAt?: string) =>
    request<QuestRun>('POST', `/quest-runs/${runId}/ticks`, occurredAt ? { occurredAt } : {}),
  removeTick: (runId: number, tickId: number) =>
    request<QuestRun>('DELETE', `/quest-runs/${runId}/ticks/${tickId}`),
  completeQuest: (runId: number, body: { note?: string; occurredAt?: string }) =>
    request<{
      run: QuestRun;
      gold: number;
      skipped: { ref: QuestTalentRef; reason: string }[];
    }>('POST', `/quest-runs/${runId}/complete`, body),
  abandonQuest: (runId: number) => request<QuestRun>('POST', `/quest-runs/${runId}/abandon`),
  undoQuest: (runId: number) =>
    request<{ run: QuestRun; gold: number }>('POST', `/quest-runs/${runId}/undo`),
  createCustomQuest: (quest: CustomQuestInput) =>
    request<CustomQuestView>('POST', '/custom-quests', quest),
  updateCustomQuest: (id: number, quest: CustomQuestInput) =>
    request<CustomQuestView>('PUT', `/custom-quests/${id}`, quest),
  deleteCustomQuest: (id: number) => request<{ deleted: number }>('DELETE', `/custom-quests/${id}`),
  gold: () => request<{ balance: number; events: GoldEventView[] }>('GET', '/gold'),
  market: () => request<Market>('GET', '/market'),
  createCard: (card: RewardCardInput) => request<MarketCard>('POST', '/reward-cards', card),
  updateCard: (id: number, card: RewardCardInput) =>
    request<MarketCard>('PUT', `/reward-cards/${id}`, card),
  archiveCard: (id: number, archived: boolean) =>
    request<MarketCard>('PUT', `/reward-cards/${id}/archive`, { archived }),
  deleteCard: (id: number) => request<{ deleted: number }>('DELETE', `/reward-cards/${id}`),
  purchase: (id: number, occurredAt?: string) =>
    request<{ purchase: PurchaseView; card: MarketCard; gold: number }>(
      'POST',
      `/reward-cards/${id}/purchase`,
      occurredAt ? { occurredAt } : {},
    ),
  undoPurchase: (purchaseId: number) =>
    request<{ purchase: PurchaseView; gold: number }>('POST', `/purchases/${purchaseId}/undo`),
  setGoal: (cardId: number | null) =>
    request<{ cardId: number | null }>('PUT', '/market/goal', { cardId }),
};
