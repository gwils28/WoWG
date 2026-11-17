import { levelProgress, maxPoints, pointsSpent, type Ranks } from '@wowg/shared';
import type { Repository, StoredSpecialization } from './repository';

export function orphansOf(spec: StoredSpecialization, ranks: Ranks) {
  const ids = new Set(spec.tree.talents.map((t) => t.id));
  return Object.entries(ranks)
    .filter(([id, rank]) => rank > 0 && !ids.has(id))
    .map(([talentId, rank]) => ({ talentId, rank }));
}

export function specSummary(spec: StoredSpecialization, ranks: Ranks) {
  return {
    id: spec.id,
    domain: spec.tree.domain,
    specialization: spec.tree.specialization,
    points: pointsSpent(spec.tree, ranks),
    maxPoints: maxPoints(spec.tree),
    updatedAt: spec.updatedAt,
  };
}

export function specDetail(spec: StoredSpecialization, ranks: Ranks) {
  return {
    ...specSummary(spec, ranks),
    tree: spec.tree,
    ranks,
    orphans: orphansOf(spec, ranks),
    sourcePath: spec.sourcePath,
  };
}

export function character(repo: Repository) {
  const specs = repo.listSpecializations().map((s) => specSummary(s, repo.ranks(s.id)));
  const totalPoints = specs.reduce((sum, s) => sum + s.points, 0);
  const domains = new Map<
    string,
    { domain: (typeof specs)[number]['domain']; points: number; specializations: typeof specs }
  >();
  for (const s of specs) {
    const entry = domains.get(s.domain.id) ?? { domain: s.domain, points: 0, specializations: [] };
    entry.points += s.points;
    entry.specializations.push(s);
    domains.set(s.domain.id, entry);
  }
  return { ...levelProgress(totalPoints), domains: [...domains.values()] };
}
