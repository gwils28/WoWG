import type { LevelProgress, Ranks, TreeDiff, TreeFile } from '@wowg/shared';

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

export interface Character extends LevelProgress {
  domains: { domain: TreeFile['domain']; points: number; specializations: SpecSummary[] }[];
}

export interface RankEventView {
  id: number;
  specializationId: string;
  talentId: string;
  delta: 1 | -1;
  occurredAt: string;
  note: string | null;
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
};
