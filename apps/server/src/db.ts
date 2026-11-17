import { DatabaseSync } from 'node:sqlite';

/** Migrations successives, indexées par PRAGMA user_version. Ne jamais modifier une migration publiée. */
const MIGRATIONS: string[] = [
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
