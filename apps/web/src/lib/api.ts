import type { LevelProgress, LevelTier, Ranks, TreeDiff, TreeFile } from '@wowg/shared';

export interface SpecSummary {
  id: string;
  domain: TreeFile['domain'];
  specialization: TreeFile['specialization'];
  points: number;
  maxPoints: number;
  updatedAt: string;
}

export interface SpecDetail extends SpecSummary {
  tree: TreeFile;
  ranks: Ranks;
  orphans: { talentId: string; rank: number }[];
  sourcePath: string | null;
}

export interface DomainSummary {
  domain: TreeFile['domain'];
  points: number;
  maxPoints: number;
  /** Dernière saisie de rang dans le domaine (date d'enregistrement). */
  lastActivityAt: string | null;
  pinned: boolean;
  specializations: SpecSummary[];
}

export interface Character extends LevelProgress {
  tier: LevelTier & { portrait: string | null };
  /** Un portrait (ou null) par palier, dans l'ordre des paliers. */
  portraits: (string | null)[];
  /** Ids des domaines épinglés, dans l'ordre d'épinglage. */
  pinned: string[];
  domains: DomainSummary[];
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
    request<{ specializations: number; events: number }>('POST', '/backup', backup),
};
