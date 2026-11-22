import {
  CustomQuestSchema,
  goldBalance,
  type CustomQuest,
  type QuestDefinition,
  type QuestTalentRef,
} from '@wowg/shared';
import type { Db } from './db';

export type QuestRunStatus = 'active' | 'completed' | 'abandoned';

export interface StoredCustomQuest {
  id: number;
  quest: CustomQuest;
  createdAt: string;
  updatedAt: string;
}

export interface StoredQuestRun {
  id: number;
  source: 'tree' | 'custom';
  specializationId: string | null;
  questId: string | null;
  customQuestId: number | null;
  /** Copie de la définition figée à l'acceptation. */
  definition: QuestDefinition;
  /** Or figé à l'acceptation. */
  gold: number;
  acceptedAt: string;
  deadline: string | null;
  stepsDone: number[];
  status: QuestRunStatus;
  completedAt: string | null;
  /** Rangs accordés au dernier rendu (null tant que la quête n'est pas rendue). */
  grants: QuestTalentRef[] | null;
  note: string | null;
  createdAt: string;
}

export interface StoredTick {
  id: number;
  runId: number;
  occurredAt: string;
  createdAt: string;
}

export type GoldReason = 'quest' | 'quest-undo' | 'purchase' | 'purchase-undo';

export interface StoredGoldEvent {
  id: number;
  amount: number;
  reason: GoldReason;
  runId: number | null;
  purchaseId: number | null;
  occurredAt: string;
  createdAt: string;
}

/** Contenu des tables de quêtes, tel qu'il est sauvegardé et restauré. */
export interface QuestData {
  customQuests: StoredCustomQuest[];
  questRuns: StoredQuestRun[];
  questTicks: StoredTick[];
  goldEvents: StoredGoldEvent[];
}

interface CustomRow {
  id: number;
  definition: string;
  created_at: string;
  updated_at: string;
}

interface RunRow {
  id: number;
  source: 'tree' | 'custom';
  specialization_id: string | null;
  quest_id: string | null;
  custom_quest_id: number | null;
  definition: string;
  gold: number;
  accepted_at: string;
  deadline: string | null;
  steps_done: string;
  status: QuestRunStatus;
  completed_at: string | null;
  grants: string | null;
  note: string | null;
  created_at: string;
}

interface TickRow {
  id: number;
  run_id: number;
  occurred_at: string;
  created_at: string;
}

interface GoldRow {
  id: number;
  amount: number;
  reason: GoldReason;
  run_id: number | null;
  purchase_id: number | null;
  occurred_at: string;
  created_at: string;
}

const toCustom = (r: CustomRow): StoredCustomQuest => ({
  id: r.id,
  quest: CustomQuestSchema.parse(JSON.parse(r.definition)),
  createdAt: r.created_at,
  updatedAt: r.updated_at,
});

const toRun = (r: RunRow): StoredQuestRun => ({
  id: r.id,
  source: r.source,
  specializationId: r.specialization_id,
  questId: r.quest_id,
  customQuestId: r.custom_quest_id,
  definition: JSON.parse(r.definition) as QuestDefinition,
  gold: r.gold,
  acceptedAt: r.accepted_at,
  deadline: r.deadline,
  stepsDone: JSON.parse(r.steps_done) as number[],
  status: r.status,
  completedAt: r.completed_at,
  grants: r.grants === null ? null : (JSON.parse(r.grants) as QuestTalentRef[]),
  note: r.note,
  createdAt: r.created_at,
});

const toTick = (r: TickRow): StoredTick => ({
  id: r.id,
  runId: r.run_id,
  occurredAt: r.occurred_at,
  createdAt: r.created_at,
});

const toGold = (r: GoldRow): StoredGoldEvent => ({
  id: r.id,
  amount: r.amount,
  reason: r.reason,
  runId: r.run_id,
  purchaseId: r.purchase_id,
  occurredAt: r.occurred_at,
  createdAt: r.created_at,
});

const now = () => new Date().toISOString();

export function createQuestRepository(db: Db) {
  const all = <R, T>(sql: string, map: (r: R) => T, ...params: (string | number)[]) =>
    (db.prepare(sql).all(...params) as unknown as R[]).map(map);
  const one = <R, T>(sql: string, map: (r: R) => T, ...params: (string | number)[]) => {
    const row = db.prepare(sql).get(...params);
    return row ? map(row as unknown as R) : null;
  };

  return {
    // --- quêtes personnelles ---

    listCustomQuests(): StoredCustomQuest[] {
      return all('SELECT * FROM custom_quests ORDER BY id', toCustom);
    },

    getCustomQuest(id: number): StoredCustomQuest | null {
      return one('SELECT * FROM custom_quests WHERE id = ?', toCustom, id);
    },

    createCustomQuest(quest: CustomQuest): StoredCustomQuest {
      const ts = now();
      const res = db
        .prepare('INSERT INTO custom_quests (definition, created_at, updated_at) VALUES (?, ?, ?)')
        .run(JSON.stringify(quest), ts, ts);
      return this.getCustomQuest(Number(res.lastInsertRowid))!;
    },

    updateCustomQuest(id: number, quest: CustomQuest): StoredCustomQuest {
      db.prepare('UPDATE custom_quests SET definition = ?, updated_at = ? WHERE id = ?').run(
        JSON.stringify(quest),
        now(),
        id,
      );
      return this.getCustomQuest(id)!;
    },

    /** Les suivis gardent leur copie de la définition. */
    deleteCustomQuest(id: number) {
      db.prepare('DELETE FROM custom_quests WHERE id = ?').run(id);
    },

    // --- suivis ---

    listRuns(status?: QuestRunStatus): StoredQuestRun[] {
      return status
        ? all('SELECT * FROM quest_runs WHERE status = ? ORDER BY id', toRun, status)
        : all('SELECT * FROM quest_runs ORDER BY id', toRun);
    },

    getRun(id: number): StoredQuestRun | null {
      return one('SELECT * FROM quest_runs WHERE id = ?', toRun, id);
    },

    createRun(run: {
      source: 'tree' | 'custom';
      specializationId?: string | null;
      questId?: string | null;
      customQuestId?: number | null;
      definition: QuestDefinition;
      gold: number;
      acceptedAt: string;
      deadline: string | null;
    }): StoredQuestRun {
      const res = db
        .prepare(
          `INSERT INTO quest_runs (source, specialization_id, quest_id, custom_quest_id, definition,
             gold, accepted_at, deadline, status, created_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'active', ?)`,
        )
        .run(
          run.source,
          run.specializationId ?? null,
          run.questId ?? null,
          run.customQuestId ?? null,
          JSON.stringify(run.definition),
          run.gold,
          run.acceptedAt,
          run.deadline,
          now(),
        );
      return this.getRun(Number(res.lastInsertRowid))!;
    },

    updateRun(
      id: number,
      patch: Partial<
        Pick<
          StoredQuestRun,
          'deadline' | 'stepsDone' | 'status' | 'completedAt' | 'grants' | 'note'
        >
      >,
    ): StoredQuestRun {
      const columns: Record<string, (v: unknown) => string | number | null> = {
        deadline: (v) => v as string | null,
        stepsDone: (v) => JSON.stringify(v),
        status: (v) => v as string,
        completedAt: (v) => v as string | null,
        grants: (v) => (v === null ? null : JSON.stringify(v)),
        note: (v) => v as string | null,
      };
      const names: Record<string, string> = {
        deadline: 'deadline',
        stepsDone: 'steps_done',
        status: 'status',
        completedAt: 'completed_at',
        grants: 'grants',
        note: 'note',
      };
      const entries = Object.entries(patch).filter(([k, v]) => k in columns && v !== undefined);
      if (entries.length > 0) {
        db.prepare(
          `UPDATE quest_runs SET ${entries.map(([k]) => `${names[k]} = ?`).join(', ')} WHERE id = ?`,
        ).run(...entries.map(([k, v]) => columns[k]!(v)), id);
      }
      return this.getRun(id)!;
    },

    // --- occurrences ---

    listTicks(runId?: number): StoredTick[] {
      return runId === undefined
        ? all('SELECT * FROM quest_ticks ORDER BY id', toTick)
        : all('SELECT * FROM quest_ticks WHERE run_id = ? ORDER BY occurred_at, id', toTick, runId);
    },

    addTick(runId: number, occurredAt: string): StoredTick {
      const res = db
        .prepare('INSERT INTO quest_ticks (run_id, occurred_at, created_at) VALUES (?, ?, ?)')
        .run(runId, occurredAt, now());
      return one('SELECT * FROM quest_ticks WHERE id = ?', toTick, Number(res.lastInsertRowid))!;
    },

    getTick(id: number): StoredTick | null {
      return one('SELECT * FROM quest_ticks WHERE id = ?', toTick, id);
    },

    deleteTick(id: number) {
      db.prepare('DELETE FROM quest_ticks WHERE id = ?').run(id);
    },

    // --- or ---

    listGoldEvents(): StoredGoldEvent[] {
      return all('SELECT * FROM gold_events ORDER BY id', toGold);
    },

    goldBalance(): number {
      return goldBalance(this.listGoldEvents());
    },

    addGoldEvent(e: {
      amount: number;
      reason: GoldReason;
      runId?: number | null;
      purchaseId?: number | null;
      occurredAt: string;
    }): StoredGoldEvent {
      const res = db
        .prepare(
          `INSERT INTO gold_events (amount, reason, run_id, purchase_id, occurred_at, created_at)
           VALUES (?, ?, ?, ?, ?, ?)`,
        )
        .run(e.amount, e.reason, e.runId ?? null, e.purchaseId ?? null, e.occurredAt, now());
      return one('SELECT * FROM gold_events WHERE id = ?', toGold, Number(res.lastInsertRowid))!;
    },

    // --- sauvegarde ---

    exportAll(): QuestData {
      return {
        customQuests: this.listCustomQuests(),
        questRuns: this.listRuns(),
        questTicks: this.listTicks(),
        goldEvents: this.listGoldEvents(),
      };
    },

    /** Vide les tables de quêtes (à appeler avant celles qu'elles référencent). */
    clear() {
      db.exec(
        'DELETE FROM gold_events; DELETE FROM quest_ticks; DELETE FROM quest_runs; DELETE FROM custom_quests;',
      );
    },

    /** Réinsère des données sauvegardées en gardant leurs identifiants (références croisées). */
    insertAll(data: QuestData) {
      const insCustom = db.prepare(
        'INSERT INTO custom_quests (id, definition, created_at, updated_at) VALUES (?, ?, ?, ?)',
      );
      for (const q of data.customQuests) {
        insCustom.run(q.id, JSON.stringify(q.quest), q.createdAt, q.updatedAt);
      }
      const insRun = db.prepare(
        `INSERT INTO quest_runs (id, source, specialization_id, quest_id, custom_quest_id, definition,
           gold, accepted_at, deadline, steps_done, status, completed_at, grants, note, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      );
      for (const r of data.questRuns) {
        insRun.run(
          r.id,
          r.source,
          r.specializationId,
          r.questId,
          r.customQuestId,
          JSON.stringify(r.definition),
          r.gold,
          r.acceptedAt,
          r.deadline,
          JSON.stringify(r.stepsDone),
          r.status,
          r.completedAt,
          r.grants === null ? null : JSON.stringify(r.grants),
          r.note,
          r.createdAt,
        );
      }
      const insTick = db.prepare(
        'INSERT INTO quest_ticks (id, run_id, occurred_at, created_at) VALUES (?, ?, ?, ?)',
      );
      for (const t of data.questTicks) insTick.run(t.id, t.runId, t.occurredAt, t.createdAt);
      const insGold = db.prepare(
        `INSERT INTO gold_events (id, amount, reason, run_id, purchase_id, occurred_at, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?)`,
      );
      for (const g of data.goldEvents) {
        insGold.run(
          g.id,
          g.amount,
          g.reason,
          g.runId,
          g.purchaseId ?? null,
          g.occurredAt,
          g.createdAt,
        );
      }
    },
  };
}

export type QuestRepository = ReturnType<typeof createQuestRepository>;
