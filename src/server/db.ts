import { DatabaseSync } from "node:sqlite";

/**
 * The single SQLite file that holds everything: users, classes, sessions and texts.
 * Schema is versioned via `user_version`; migrations run in order and never drop data.
 */
export type DB = DatabaseSync;

const MIGRATIONS: ((db: DB) => void)[] = [
  // v1: users, sessions, classes, texts.
  (db) => {
    db.exec(`
      CREATE TABLE users (
        id          TEXT PRIMARY KEY,
        username    TEXT NOT NULL UNIQUE,
        role        TEXT NOT NULL CHECK (role IN ('admin','teacher','student')),
        pw_hash     TEXT NOT NULL,
        pw_salt     TEXT NOT NULL,
        created_by  TEXT REFERENCES users(id),
        disabled    INTEGER NOT NULL DEFAULT 0,
        created_at  INTEGER NOT NULL,
        updated_at  INTEGER NOT NULL
      );
      CREATE INDEX idx_users_created_by ON users(created_by);

      CREATE TABLE sessions (
        id            TEXT PRIMARY KEY,
        user_id       TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        created_at    INTEGER NOT NULL,
        last_seen_at  INTEGER NOT NULL
      );
      CREATE INDEX idx_sessions_user ON sessions(user_id);

      CREATE TABLE classes (
        id          TEXT PRIMARY KEY,
        teacher_id  TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        name        TEXT NOT NULL,
        created_at  INTEGER NOT NULL
      );
      CREATE INDEX idx_classes_teacher ON classes(teacher_id);

      CREATE TABLE class_members (
        class_id    TEXT NOT NULL REFERENCES classes(id) ON DELETE CASCADE,
        student_id  TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        PRIMARY KEY (class_id, student_id)
      );

      CREATE TABLE texts (
        id          TEXT PRIMARY KEY,
        owner_id    TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        title       TEXT NOT NULL,
        created_at  INTEGER NOT NULL,
        updated_at  INTEGER NOT NULL,
        deleted_at  INTEGER,
        text_size   TEXT NOT NULL,
        tokens      TEXT NOT NULL,
        overlay     TEXT NOT NULL
      );
      CREATE INDEX idx_texts_owner ON texts(owner_id);
    `);
  },
];

export function openDb(path: string): DB {
  const db = new DatabaseSync(path);
  db.exec("PRAGMA journal_mode = WAL");
  db.exec("PRAGMA foreign_keys = ON");
  migrate(db);
  return db;
}

function migrate(db: DB): void {
  const row = db.prepare("PRAGMA user_version").get() as { user_version: number };
  let version = row.user_version;
  for (; version < MIGRATIONS.length; version++) {
    db.exec("BEGIN");
    try {
      MIGRATIONS[version]!(db);
      // PRAGMA cannot be parameterised; version is a trusted integer index.
      db.exec(`PRAGMA user_version = ${version + 1}`);
      db.exec("COMMIT");
    } catch (err) {
      db.exec("ROLLBACK");
      throw err;
    }
  }
}
