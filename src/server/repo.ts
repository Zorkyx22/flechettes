import { randomBytes } from "node:crypto";
import type { Doc, TextSize } from "../model/types";
import type { Meta } from "../storage/store";
import { hashPassword, newSessionId } from "./auth";
import type { DB } from "./db";
import type { Class, Role, User } from "./types";

export function newId(): string {
  return randomBytes(12).toString("hex");
}

type UserRow = {
  id: string;
  username: string;
  role: Role;
  pw_hash: string;
  pw_salt: string;
  created_by: string | null;
  disabled: number;
  created_at: number;
  updated_at: number;
};

function toUser(r: UserRow): User {
  return {
    id: r.id,
    username: r.username,
    role: r.role,
    createdBy: r.created_by,
    disabled: r.disabled !== 0,
    createdAt: r.created_at,
    updatedAt: r.updated_at,
  };
}

export class Users {
  constructor(
    private readonly db: DB,
    private readonly now: () => number = Date.now,
  ) {}

  count(): number {
    return (this.db.prepare("SELECT COUNT(*) AS n FROM users").get() as { n: number }).n;
  }

  byId(id: string): User | undefined {
    const r = this.db.prepare("SELECT * FROM users WHERE id = ?").get(id) as UserRow | undefined;
    return r && toUser(r);
  }

  byUsername(username: string): (User & { pwHash: string; pwSalt: string }) | undefined {
    const r = this.db.prepare("SELECT * FROM users WHERE username = ?").get(username) as UserRow | undefined;
    return r && { ...toUser(r), pwHash: r.pw_hash, pwSalt: r.pw_salt };
  }

  /** Creates a user; throws on duplicate username (UNIQUE constraint). */
  create(input: { username: string; password: string; role: Role; createdBy: string | null }): User {
    const t = this.now();
    const { hash, salt } = hashPassword(input.password);
    const id = newId();
    this.db
      .prepare(
        `INSERT INTO users (id, username, role, pw_hash, pw_salt, created_by, disabled, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, 0, ?, ?)`,
      )
      .run(id, input.username, input.role, hash, salt, input.createdBy, t, t);
    return this.byId(id)!;
  }

  /** Students created by a teacher, or teachers (createdBy is null) for the admin view. */
  listByRole(role: Role, createdBy: string | null): User[] {
    const rows =
      createdBy === null
        ? (this.db.prepare("SELECT * FROM users WHERE role = ? ORDER BY username").all(role) as UserRow[])
        : (this.db
            .prepare("SELECT * FROM users WHERE role = ? AND created_by = ? ORDER BY username")
            .all(role, createdBy) as UserRow[]);
    return rows.map(toUser);
  }

  setDisabled(id: string, disabled: boolean): void {
    this.db
      .prepare("UPDATE users SET disabled = ?, updated_at = ? WHERE id = ?")
      .run(disabled ? 1 : 0, this.now(), id);
  }

  setPassword(id: string, password: string): void {
    const { hash, salt } = hashPassword(password);
    this.db
      .prepare("UPDATE users SET pw_hash = ?, pw_salt = ?, updated_at = ? WHERE id = ?")
      .run(hash, salt, this.now(), id);
  }
}

export class Sessions {
  constructor(
    private readonly db: DB,
    private readonly idleMs: number,
    private readonly now: () => number = Date.now,
  ) {}

  create(userId: string): string {
    const id = newSessionId();
    const t = this.now();
    this.db.prepare("INSERT INTO sessions (id, user_id, created_at, last_seen_at) VALUES (?, ?, ?, ?)").run(id, userId, t, t);
    return id;
  }

  /** Returns the session's user id, refreshing activity; expired or unknown sessions return undefined. */
  touch(id: string): string | undefined {
    const row = this.db.prepare("SELECT user_id, last_seen_at FROM sessions WHERE id = ?").get(id) as
      | { user_id: string; last_seen_at: number }
      | undefined;
    if (!row) return undefined;
    const t = this.now();
    if (t - row.last_seen_at > this.idleMs) {
      this.destroy(id);
      return undefined;
    }
    this.db.prepare("UPDATE sessions SET last_seen_at = ? WHERE id = ?").run(t, id);
    return row.user_id;
  }

  destroy(id: string): void {
    this.db.prepare("DELETE FROM sessions WHERE id = ?").run(id);
  }

  destroyAllForUser(userId: string): void {
    this.db.prepare("DELETE FROM sessions WHERE user_id = ?").run(userId);
  }

  /** Housekeeping: drop sessions idle past the timeout. */
  sweep(): void {
    this.db.prepare("DELETE FROM sessions WHERE last_seen_at < ?").run(this.now() - this.idleMs);
  }
}

type TextRow = {
  id: string;
  owner_id: string;
  title: string;
  created_at: number;
  updated_at: number;
  deleted_at: number | null;
  text_size: string;
  tokens: string;
  overlay: string;
};

function toDoc(r: TextRow): Doc {
  return {
    id: r.id,
    title: r.title,
    createdAt: r.created_at,
    updatedAt: r.updated_at,
    deletedAt: r.deleted_at,
    textSize: r.text_size as TextSize,
    tokens: JSON.parse(r.tokens),
    overlay: JSON.parse(r.overlay),
  };
}

export class OwnershipError extends Error {}

/** Per-user text storage. Every method is scoped to an owner id; a text never crosses owners. */
export class Texts {
  constructor(private readonly db: DB) {}

  listMeta(ownerId: string): Meta[] {
    const rows = this.db
      .prepare("SELECT id, title, created_at, updated_at, deleted_at FROM texts WHERE owner_id = ?")
      .all(ownerId) as Pick<TextRow, "id" | "title" | "created_at" | "updated_at" | "deleted_at">[];
    return rows.map((r) => ({
      id: r.id,
      title: r.title,
      createdAt: r.created_at,
      updatedAt: r.updated_at,
      deletedAt: r.deleted_at,
    }));
  }

  get(ownerId: string, id: string): Doc | undefined {
    const r = this.db.prepare("SELECT * FROM texts WHERE id = ? AND owner_id = ?").get(id, ownerId) as TextRow | undefined;
    return r && toDoc(r);
  }

  /** Upsert the owner's text. Refuses to touch an id that already belongs to someone else. */
  put(ownerId: string, doc: Doc): void {
    const existing = this.db.prepare("SELECT owner_id FROM texts WHERE id = ?").get(doc.id) as { owner_id: string } | undefined;
    if (existing && existing.owner_id !== ownerId) throw new OwnershipError("not your text");
    this.db
      .prepare(
        `INSERT INTO texts (id, owner_id, title, created_at, updated_at, deleted_at, text_size, tokens, overlay)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
         ON CONFLICT(id) DO UPDATE SET
           title = excluded.title, updated_at = excluded.updated_at, deleted_at = excluded.deleted_at,
           text_size = excluded.text_size, tokens = excluded.tokens, overlay = excluded.overlay`,
      )
      .run(
        doc.id,
        ownerId,
        doc.title,
        doc.createdAt,
        doc.updatedAt,
        doc.deletedAt,
        doc.textSize,
        JSON.stringify(doc.tokens),
        JSON.stringify(doc.overlay),
      );
  }

  remove(ownerId: string, id: string): void {
    this.db.prepare("DELETE FROM texts WHERE id = ? AND owner_id = ?").run(id, ownerId);
  }
}

type ClassRow = { id: string; teacher_id: string; name: string };
const toClass = (r: ClassRow): Class => ({ id: r.id, teacherId: r.teacher_id, name: r.name });

/** Classes a teacher groups their students into. A student belongs to at most one class for now. */
export class Classes {
  constructor(
    private readonly db: DB,
    private readonly now: () => number = Date.now,
  ) {}

  create(teacherId: string, name: string): Class {
    const id = newId();
    this.db.prepare("INSERT INTO classes (id, teacher_id, name, created_at) VALUES (?, ?, ?, ?)").run(id, teacherId, name, this.now());
    return { id, teacherId, name };
  }

  listByTeacher(teacherId: string): Class[] {
    const rows = this.db.prepare("SELECT * FROM classes WHERE teacher_id = ? ORDER BY name").all(teacherId) as ClassRow[];
    return rows.map(toClass);
  }

  byId(id: string): Class | undefined {
    const r = this.db.prepare("SELECT * FROM classes WHERE id = ?").get(id) as ClassRow | undefined;
    return r && toClass(r);
  }

  classOf(studentId: string): string | null {
    const r = this.db.prepare("SELECT class_id FROM class_members WHERE student_id = ?").get(studentId) as
      | { class_id: string }
      | undefined;
    return r?.class_id ?? null;
  }

  /** Put a student in exactly one class, or remove them from any class when classId is null. */
  assign(studentId: string, classId: string | null): void {
    this.db.prepare("DELETE FROM class_members WHERE student_id = ?").run(studentId);
    if (classId !== null) this.db.prepare("INSERT INTO class_members (class_id, student_id) VALUES (?, ?)").run(classId, studentId);
  }
}
