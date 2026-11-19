import {
  currentRanks,
  TreeFileStructureSchema,
  type RankDelta,
  type RankEvent,
  type Ranks,
  type TreeFile,
} from '@wowg/shared';
import { transaction, type Db } from './db';
import { createQuestRepository, type QuestData } from './quest-repository';

export interface StoredSpecialization {
  id: string;
  domainId: string;
  tree: TreeFile;
  sourcePath: string | null;
  importedAt: string;
  updatedAt: string;
}

export interface StoredEvent extends RankEvent {
  id: number;
  specializationId: string;
  createdAt: string;
  /** Suivi de quête à l'origine de l'événement (rendu ou annulation), sinon null. */
  questRunId: number | null;
}

interface SpecRow {
  id: string;
  domain_id: string;
  definition: string;
  source_path: string | null;
  imported_at: string;
  updated_at: string;
}

interface EventRow {
  id: number;
  specialization_id: string;
  talent_id: string;
  delta: number;
  occurred_at: string;
  note: string | null;
  created_at: string;
  quest_run_id: number | null;
}

const toSpec = (r: SpecRow): StoredSpecialization => ({
  id: r.id,
  domainId: r.domain_id,
  // validée en entier à l'écriture ; à la lecture, structure seule (une règle ajoutée depuis ne casse rien)
  tree: TreeFileStructureSchema.parse(JSON.parse(r.definition)),
  sourcePath: r.source_path,
  importedAt: r.imported_at,
  updatedAt: r.updated_at,
});

const toEvent = (r: EventRow): StoredEvent => ({
  id: r.id,
  specializationId: r.specialization_id,
  talentId: r.talent_id,
  delta: r.delta as RankDelta,
  occurredAt: r.occurred_at,
  note: r.note,
  createdAt: r.created_at,
  questRunId: r.quest_run_id,
});

const now = () => new Date().toISOString();

export function createRepository(db: Db) {
  return {
    listSpecializations(): StoredSpecialization[] {
      const rows = db.prepare('SELECT * FROM specializations ORDER BY domain_id, id').all();
      return (rows as unknown as SpecRow[]).map(toSpec);
    },

    getSpecialization(id: string): StoredSpecialization | null {
      const row = db.prepare('SELECT * FROM specializations WHERE id = ?').get(id);
      return row ? toSpec(row as unknown as SpecRow) : null;
    },

    /** Insère ou remplace la définition. La progression n'est jamais touchée. */
    saveSpecialization(tree: TreeFile, sourcePath: string | null): StoredSpecialization {
      const ts = now();
      db.prepare(
        `INSERT INTO specializations (id, domain_id, definition, source_path, imported_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?)
         ON CONFLICT(id) DO UPDATE SET
           domain_id = excluded.domain_id,
           definition = excluded.definition,
           source_path = COALESCE(excluded.source_path, specializations.source_path),
           updated_at = excluded.updated_at`,
      ).run(tree.specialization.id, tree.domain.id, JSON.stringify(tree), sourcePath, ts, ts);
      return this.getSpecialization(tree.specialization.id)!;
    },

    listEvents(specializationId?: string): StoredEvent[] {
      const rows = specializationId
        ? db
            .prepare('SELECT * FROM rank_events WHERE specialization_id = ? ORDER BY id')
            .all(specializationId)
        : db.prepare('SELECT * FROM rank_events ORDER BY id').all();
      return (rows as unknown as EventRow[]).map(toEvent);
    },

    ranks(specializationId: string): Ranks {
      return currentRanks(this.listEvents(specializationId));
    },

    addEvent(
      specializationId: string,
      e: {
        talentId: string;
        delta: RankDelta;
        occurredAt?: string;
        note?: string | null;
        questRunId?: number | null;
      },
    ): StoredEvent {
      const ts = now();
      const res = db
        .prepare(
          `INSERT INTO rank_events
             (specialization_id, talent_id, delta, occurred_at, note, created_at, quest_run_id)
           VALUES (?, ?, ?, ?, ?, ?, ?)`,
        )
        .run(
          specializationId,
          e.talentId,
          e.delta,
          e.occurredAt ?? ts,
          e.note ?? null,
          ts,
          e.questRunId ?? null,
        );
      const row = db.prepare('SELECT * FROM rank_events WHERE id = ?').get(res.lastInsertRowid);
      return toEvent(row as unknown as EventRow);
    },

    /** Préférences d'affichage (valeurs JSON), sauvegardées avec la progression. */
    preferences(): Record<string, unknown> {
      const rows = db.prepare('SELECT key, value FROM preferences ORDER BY key').all() as {
        key: string;
        value: string;
      }[];
      return Object.fromEntries(rows.map((r) => [r.key, JSON.parse(r.value)]));
    },

    setPreference(key: string, value: unknown) {
      db.prepare(
        `INSERT INTO preferences (key, value) VALUES (?, ?)
         ON CONFLICT(key) DO UPDATE SET value = excluded.value`,
      ).run(key, JSON.stringify(value));
    },

    /** Remplace tout le contenu (restauration d'une sauvegarde). */
    replaceAll(
      specs: Omit<StoredSpecialization, 'domainId'>[],
      events: (Omit<StoredEvent, 'questRunId'> & { questRunId?: number | null })[],
      preferences: Record<string, unknown> = {},
      quests?: QuestData,
    ) {
      const questRepo = createQuestRepository(db);
      transaction(db, () => {
        db.exec('DELETE FROM rank_events;');
        questRepo.clear();
        db.exec('DELETE FROM specializations; DELETE FROM preferences;');
        for (const [key, value] of Object.entries(preferences)) this.setPreference(key, value);
        const insSpec = db.prepare(
          `INSERT INTO specializations (id, domain_id, definition, source_path, imported_at, updated_at)
           VALUES (?, ?, ?, ?, ?, ?)`,
        );
        for (const s of specs) {
          insSpec.run(
            s.tree.specialization.id,
            s.tree.domain.id,
            JSON.stringify(s.tree),
            s.sourcePath,
            s.importedAt,
            s.updatedAt,
          );
        }
        if (quests) questRepo.insertAll(quests);
        const insEvent = db.prepare(
          `INSERT INTO rank_events
             (specialization_id, talent_id, delta, occurred_at, note, created_at, quest_run_id)
           VALUES (?, ?, ?, ?, ?, ?, ?)`,
        );
        for (const e of events) {
          insEvent.run(
            e.specializationId,
            e.talentId,
            e.delta,
            e.occurredAt,
            e.note ?? null,
            e.createdAt,
            e.questRunId ?? null,
          );
        }
      });
    },
  };
}

export type Repository = ReturnType<typeof createRepository>;
