import {
  LEVEL_TIERS,
  levelProgress,
  levelTier,
  maxPoints,
  pointsSpent,
  type Ranks,
} from '@wowg/shared';
import type { Repository, StoredSpecialization } from './repository';

export function orphansOf(spec: StoredSpecialization, ranks: Ranks) {
  const ids = new Set(spec.tree.talents.map((t) => t.id));
  return Object.entries(ranks)
    .filter(([id, rank]) => rank > 0 && !ids.has(id))
    .map(([talentId, rank]) => ({ talentId, rank }));
}

export function specSummary(spec: StoredSpecialization, ranks: Ranks, archived = false) {
  return {
    id: spec.id,
    archived,
    domain: spec.tree.domain,
    specialization: spec.tree.specialization,
    points: pointsSpent(spec.tree, ranks),
    maxPoints: maxPoints(spec.tree),
    updatedAt: spec.updatedAt,
  };
}

export function specDetail(spec: StoredSpecialization, ranks: Ranks, archived = false) {
  return {
    ...specSummary(spec, ranks, archived),
    tree: spec.tree,
    ranks,
    orphans: orphansOf(spec, ranks),
    sourcePath: spec.sourcePath,
  };
}

export const PINNED_DOMAINS = 'pinnedDomains';

/** Domaines épinglés encore présents, dans l'ordre d'épinglage. */
export function pinnedDomains(repo: Repository): string[] {
  const raw = repo.preferences()[PINNED_DOMAINS];
  return Array.isArray(raw) ? raw.filter((x): x is string => typeof x === 'string') : [];
}

export const ARCHIVED_DOMAINS = 'archivedDomains';

/** Domaines archivés (SPEC 11) : hors niveau, hors quêtes, consultables en lecture seule. */
export function archivedDomains(repo: Repository): string[] {
  const raw = repo.preferences()[ARCHIVED_DOMAINS];
  return Array.isArray(raw) ? raw.filter((x): x is string => typeof x === 'string') : [];
}

/** Vrai si la spécialisation appartient à un domaine archivé. */
export function isArchivedSpec(repo: Repository, spec: StoredSpecialization): boolean {
  return archivedDomains(repo).includes(spec.tree.domain.id);
}

export function character(repo: Repository, portrait: (tier: number) => string | null) {
  const archived = new Set(archivedDomains(repo));
  const all = repo
    .listSpecializations()
    .map((s) => specSummary(s, repo.ranks(s.id), archived.has(s.tree.domain.id)));

  // dernière activité par spécialisation : import ou mise à jour de l'arbre, puis saisies de
  // rang (date d'enregistrement, pas la date déclarée)
  const lastBySpec = new Map<string, string>(all.map((s) => [s.id, s.updatedAt]));
  for (const e of repo.listEvents()) {
    const prev = lastBySpec.get(e.specializationId);
    if (!prev || e.createdAt > prev) lastBySpec.set(e.specializationId, e.createdAt);
  }

  const pinned = pinnedDomains(repo);
  type Spec = (typeof all)[number];
  const group = (specs: Spec[]) => {
    const domains = new Map<
      string,
      {
        domain: Spec['domain'];
        points: number;
        maxPoints: number;
        lastActivityAt: string | null;
        pinned: boolean;
        specializations: Spec[];
      }
    >();
    for (const s of specs) {
      const entry = domains.get(s.domain.id) ?? {
        domain: s.domain,
        points: 0,
        maxPoints: 0,
        lastActivityAt: null,
        pinned: pinned.includes(s.domain.id),
        specializations: [],
      };
      entry.points += s.points;
      entry.maxPoints += s.maxPoints;
      const last = lastBySpec.get(s.id) ?? null;
      if (last && (!entry.lastActivityAt || last > entry.lastActivityAt))
        entry.lastActivityAt = last;
      entry.specializations.push(s);
      domains.set(s.domain.id, entry);
    }
    return domains;
  };

  // le niveau ne compte que les classes actives ; l'archive garde son propre total
  const domains = group(all.filter((s) => !s.archived));
  const archivedGroups = group(all.filter((s) => s.archived));
  const sum = (specs: Spec[]) => specs.reduce((n, s) => n + s.points, 0);
  const totalPoints = sum(all.filter((s) => !s.archived));
  const archivePoints = sum(all.filter((s) => s.archived));

  const progress = levelProgress(totalPoints);
  const tier = levelTier(progress.level);
  return {
    ...progress,
    tier: { ...tier, portrait: portrait(tier.index) },
    /** Un portrait (ou null) par palier, dans l'ordre. */
    portraits: LEVEL_TIERS.map((t) => portrait(t.index)),
    pinned: pinned.filter((id) => domains.has(id)),
    domains: [...domains.values()],
    archive: {
      points: archivePoints,
      level: levelProgress(archivePoints).level,
      domains: [...archivedGroups.values()],
    },
  };
}
