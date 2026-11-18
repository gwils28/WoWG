import { describe, expect, it } from 'vitest';
import type { DomainSummary } from '../src/lib/api';
import {
  matchesQuery,
  pinnedDomains,
  recentDomains,
  relativeDay,
  sortDomains,
  specPath,
} from '../src/lib/classes';

const domain = (
  id: string,
  name: string,
  points: number,
  lastActivityAt: string | null,
  pinned = false,
  specs: string[] = [],
): DomainSummary =>
  ({
    domain: { id, name, icon: 'game-icons:run' },
    points,
    maxPoints: 100,
    lastActivityAt,
    pinned,
    specializations: specs.map((s) => ({ id: s, specialization: { name: s } })),
  }) as DomainSummary;

const forme = domain('forme', 'Forme physique', 40, '2026-11-10T10:00:00Z', true, ['Endurance']);
const jazz = domain('jazz', 'Jazzman', 12, '2026-11-17T10:00:00Z', false, ['Mélomane jazz']);
const anglais = domain('anglais', 'Anglais', 12, null);
const cuisine = domain('cuisine', 'Cuisine', 3, '2026-11-01T10:00:00Z');

describe('classes', () => {
  it('construit l adresse d une spécialisation', () => {
    expect(specPath('jazz', 'contrebassiste')).toBe('/classe/jazz/contrebassiste');
  });

  it('cherche sans accents ni casse, aussi dans les spécialisations', () => {
    expect(matchesQuery(forme, 'PHYS')).toBe(true);
    expect(matchesQuery(jazz, 'melomane')).toBe(true);
    expect(matchesQuery(jazz, 'endurance')).toBe(false);
    expect(matchesQuery(anglais, '  ')).toBe(true);
  });

  it('trie par activité, points ou nom', () => {
    const all = [forme, jazz, anglais, cuisine];
    const ids = (ds: DomainSummary[]) => ds.map((d) => d.domain.id);
    expect(ids(sortDomains(all, 'activity'))).toEqual(['jazz', 'forme', 'cuisine', 'anglais']);
    expect(ids(sortDomains(all, 'points'))).toEqual(['forme', 'anglais', 'jazz', 'cuisine']);
    expect(ids(sortDomains(all, 'name'))).toEqual(['anglais', 'cuisine', 'forme', 'jazz']);
  });

  it('sépare épinglées et récentes', () => {
    const all = [forme, jazz, anglais, cuisine];
    expect(pinnedDomains(all, ['forme', 'disparu']).map((d) => d.domain.id)).toEqual(['forme']);
    expect(recentDomains(all, 5).map((d) => d.domain.id)).toEqual(['jazz', 'cuisine']);
    expect(recentDomains(all, 1).map((d) => d.domain.id)).toEqual(['jazz']);
  });

  it('formate la dernière activité', () => {
    const now = new Date(2026, 10, 18, 15);
    expect(relativeDay(null, now)).toBe('aucune activité');
    expect(relativeDay(new Date(2026, 10, 18, 9).toISOString(), now)).toBe("aujourd'hui");
    expect(relativeDay(new Date(2026, 10, 17, 23).toISOString(), now)).toBe('hier');
    expect(relativeDay(new Date(2026, 10, 13).toISOString(), now)).toBe('il y a 5 jours');
    expect(relativeDay(new Date(2026, 8, 1).toISOString(), now)).toBe('1 sept. 2026');
  });
});
