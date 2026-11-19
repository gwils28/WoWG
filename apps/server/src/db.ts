import { DatabaseSync } from 'node:sqlite';

/** Migrations successives, indexées par PRAGMA user_version. Ne jamais modifier une migration publiée. */
export const MIGRATIONS: string[] = [
  `
  CREATE TABLE specializations (
    id          TEXT PRIMARY KEY,
    domain_id   TEXT NOT NULL,
    definition  TEXT NOT NULL,
    source_path TEXT,
    imported_at TEXT NOT NULL,
    updated_at  TEXT NOT NULL
  );
  CREATE TABLE rank_events (
    id                INTEGER PRIMARY KEY AUTOINCREMENT,
    specialization_id TEXT NOT NULL REFERENCES specializations(id),
    talent_id         TEXT NOT NULL,
    delta             INTEGER NOT NULL CHECK (delta IN (1, -1)),
    occurred_at       TEXT NOT NULL,
    note              TEXT,
    created_at        TEXT NOT NULL
  );
  CREATE INDEX rank_events_spec ON rank_events(specialization_id);
  `,
  `
  CREATE TABLE preferences (
    key   TEXT PRIMARY KEY,
    value TEXT NOT NULL
  );
  `,
  // quêtes et or (SPEC section 10)
  `
  CREATE TABLE custom_quests (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    definition  TEXT NOT NULL,
    created_at  TEXT NOT NULL,
    updated_at  TEXT NOT NULL
  );
  CREATE TABLE quest_runs (
    id                INTEGER PRIMARY KEY AUTOINCREMENT,
    source            TEXT NOT NULL CHECK (source IN ('tree', 'custom')),
    specialization_id TEXT,
    quest_id          TEXT,
    custom_quest_id   INTEGER,
    definition        TEXT NOT NULL,
    gold              INTEGER NOT NULL,
    accepted_at       TEXT NOT NULL,
    deadline          TEXT,
    steps_done        TEXT NOT NULL DEFAULT '[]',
    status            TEXT NOT NULL CHECK (status IN ('active', 'completed', 'abandoned')),
    completed_at      TEXT,
    grants            TEXT,
    note              TEXT,
    created_at        TEXT NOT NULL
  );
  CREATE UNIQUE INDEX quest_runs_active_tree ON quest_runs(specialization_id, quest_id)
    WHERE status = 'active' AND source = 'tree';
  CREATE UNIQUE INDEX quest_runs_active_custom ON quest_runs(custom_quest_id)
    WHERE status = 'active' AND source = 'custom';
  CREATE TABLE quest_ticks (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    run_id      INTEGER NOT NULL REFERENCES quest_runs(id),
    occurred_at TEXT NOT NULL,
    created_at  TEXT NOT NULL
  );
  CREATE INDEX quest_ticks_run ON quest_ticks(run_id);
  CREATE TABLE gold_events (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    amount      INTEGER NOT NULL CHECK (amount <> 0),
    reason      TEXT NOT NULL,
    run_id      INTEGER REFERENCES quest_runs(id),
    occurred_at TEXT NOT NULL,
    created_at  TEXT NOT NULL
  );
  ALTER TABLE rank_events ADD COLUMN quest_run_id INTEGER REFERENCES quest_runs(id);
  `,
];

export type Db = DatabaseSync;

export function openDb(path: string): Db {
  const db = new DatabaseSync(path);
  db.exec('PRAGMA foreign_keys = ON; PRAGMA journal_mode = WAL;');
  migrate(db);
  return db;
}

function migrate(db: Db) {
  const { user_version: current } = db.prepare('PRAGMA user_version').get() as {
    user_version: number;
  };
  for (let v = current; v < MIGRATIONS.length; v++) {
    transaction(db, () => {
      db.exec(MIGRATIONS[v]!);
      db.exec(`PRAGMA user_version = ${v + 1}`);
    });
  }
}

export function transaction<T>(db: Db, fn: () => T): T {
  db.exec('BEGIN');
  try {
    const result = fn();
    db.exec('COMMIT');
    return result;
  } catch (e) {
    db.exec('ROLLBACK');
    throw e;
  }
}
