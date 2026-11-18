import type { JournalEntry } from './api';

export interface JournalDay {
  /** AAAA-MM-JJ, tel que saisi (pas de conversion de fuseau) */
  day: string;
  entries: JournalEntry[];
}

/** Regroupe des entrées déjà triées (récentes d'abord) par jour, en gardant l'ordre. */
export function groupByDay(entries: JournalEntry[]): JournalDay[] {
  const days: JournalDay[] = [];
  for (const e of entries) {
    const day = e.occurredAt.slice(0, 10);
    const last = days.at(-1);
    if (last?.day === day) last.entries.push(e);
    else days.push({ day, entries: [e] });
  }
  return days;
}

/** "mardi 18 novembre 2026", sans décalage de fuseau. */
export function formatDay(day: string): string {
  const [y, m, d] = day.split('-').map(Number);
  return new Date(y!, m! - 1, d!).toLocaleDateString('fr-FR', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  });
}

/** "Rang 2 → 3 / 5" pour un gain, "Rang 3 → 2 / 5" pour un retrait. */
export function rankLabel(e: Pick<JournalEntry, 'delta' | 'rankAfter' | 'maxRank'>): string {
  const before = e.rankAfter - e.delta;
  const max = e.maxRank === null ? '' : ` / ${e.maxRank}`;
  return `Rang ${before} → ${e.rankAfter}${max}`;
}

export interface BackupSummary {
  exportedAt: string | null;
  specializations: number;
  events: number;
}

/**
 * Contrôle minimal d'un fichier de sauvegarde avant confirmation.
 * La validation complète reste côté serveur (POST /api/backup).
 */
export function summarizeBackup(data: unknown): BackupSummary {
  const b = data as Record<string, unknown> | null;
  if (!b || typeof b !== 'object' || b.format !== 'wowg-backup') {
    throw new Error("ce fichier n'est pas une sauvegarde WoWG");
  }
  if (!Array.isArray(b.specializations) || !Array.isArray(b.events)) {
    throw new Error('sauvegarde incomplète (spécialisations ou événements manquants)');
  }
  return {
    exportedAt: typeof b.exportedAt === 'string' ? b.exportedAt : null,
    specializations: b.specializations.length,
    events: b.events.length,
  };
}
