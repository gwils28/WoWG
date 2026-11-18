import type { DomainSummary } from './api';

/** Adresse d'une spécialisation dans sa classe. */
export const specPath = (domainId: string, specId: string) => `/classe/${domainId}/${specId}`;

export type ClassSort = 'activity' | 'points' | 'name';

const fold = (s: string) =>
  s
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .toLowerCase();

/** Recherche sans accents ni casse, sur le nom de la classe et de ses spécialisations. */
export function matchesQuery(d: DomainSummary, query: string): boolean {
  const q = fold(query.trim());
  if (!q) return true;
  return [d.domain.name, ...d.specializations.map((s) => s.specialization.name)].some((n) =>
    fold(n).includes(q),
  );
}

export function sortDomains(domains: DomainSummary[], sort: ClassSort): DomainSummary[] {
  const byName = (a: DomainSummary, b: DomainSummary) =>
    a.domain.name.localeCompare(b.domain.name, 'fr');
  return [...domains].sort((a, b) => {
    if (sort === 'points') return b.points - a.points || byName(a, b);
    if (sort === 'activity') {
      const la = a.lastActivityAt ?? '';
      const lb = b.lastActivityAt ?? '';
      return lb.localeCompare(la) || byName(a, b);
    }
    return byName(a, b);
  });
}

/** Domaines épinglés, dans l'ordre d'épinglage. */
export function pinnedDomains(domains: DomainSummary[], pinned: string[]): DomainSummary[] {
  return pinned.flatMap((id) => domains.find((d) => d.domain.id === id) ?? []);
}

/** Domaines non épinglés avec une activité, du plus récent au plus ancien. */
export function recentDomains(domains: DomainSummary[], limit: number): DomainSummary[] {
  return sortDomains(
    domains.filter((d) => !d.pinned && d.lastActivityAt),
    'activity',
  ).slice(0, limit);
}

/** "aujourd'hui", "hier", "il y a 5 jours", puis la date. */
export function relativeDay(iso: string | null, now = new Date()): string {
  if (!iso) return 'aucune activité';
  const day = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
  const days = Math.round((day(now) - day(new Date(iso))) / 86_400_000);
  if (days <= 0) return "aujourd'hui";
  if (days === 1) return 'hier';
  if (days < 30) return `il y a ${days} jours`;
  return new Date(iso).toLocaleDateString('fr-FR', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  });
}
