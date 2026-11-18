import { describe, expect, it } from 'vitest';
import type { JournalEntry } from '../src/lib/api';
import { formatDay, groupByDay, rankLabel, summarizeBackup } from '../src/lib/journal';

const entry = (id: number, occurredAt: string): JournalEntry =>
  ({ id, occurredAt, delta: 1, rankAfter: 1, maxRank: 3 }) as JournalEntry;

describe('journal', () => {
  it('regroupe par jour en gardant l ordre', () => {
    const days = groupByDay([
      entry(3, '2026-11-18'),
      entry(2, '2026-11-18T08:00:00+01:00'),
      entry(1, '2026-11-02'),
    ]);
    expect(days.map((d) => [d.day, d.entries.map((e) => e.id)])).toEqual([
      ['2026-11-18', [3, 2]],
      ['2026-11-02', [1]],
    ]);
  });

  it('formate un jour sans décalage de fuseau', () => {
    expect(formatDay('2026-11-01')).toBe('dimanche 1 novembre 2026');
  });

  it('décrit un gain et un retrait de rang', () => {
    expect(rankLabel({ delta: 1, rankAfter: 3, maxRank: 5 })).toBe('Rang 2 → 3 / 5');
    expect(rankLabel({ delta: -1, rankAfter: 2, maxRank: 5 })).toBe('Rang 3 → 2 / 5');
    expect(rankLabel({ delta: 1, rankAfter: 1, maxRank: null })).toBe('Rang 0 → 1');
  });

  it('résume une sauvegarde et refuse un autre fichier', () => {
    expect(
      summarizeBackup({
        format: 'wowg-backup',
        exportedAt: '2026-11-18T10:00:00.000Z',
        specializations: [{}, {}],
        events: [{}],
      }),
    ).toEqual({ exportedAt: '2026-11-18T10:00:00.000Z', specializations: 2, events: 1 });
    expect(() => summarizeBackup({ domain: {} })).toThrow(/pas une sauvegarde/);
    expect(() => summarizeBackup({ format: 'wowg-backup', events: [] })).toThrow(/incomplète/);
  });
});
