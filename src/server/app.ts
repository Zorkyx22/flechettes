import type { IncomingMessage, ServerResponse } from "node:http";
import { ImportError, parseStoredDoc } from "../storage/exchange";
import type { Config } from "./config";
import type { DB } from "./db";
import { verifyPassword } from "./auth";
import {
  APP_HEADER,
  clearSessionCookie,
  HttpError,
  parseCookies,
  readJson,
  sendError,
  sendJson,
  serveStatic,
  setSessionCookie,
  COOKIE,
} from "./http";
import { Classes, OwnershipError, Sessions, Texts, Users } from "./repo";
import { toPublicUser, type Role, type User } from "./types";

export type Services = {
  users: Users;
  sessions: Sessions;
  texts: Texts;
  classes: Classes;
  config: Config;
};

export function createServices(db: DB, config: Config, now: () => number = Date.now): Services {
  return {
    users: new Users(db, now),
    sessions: new Sessions(db, config.idleMs, now),
    texts: new Texts(db),
    classes: new Classes(db, now),
    config,
  };
}

const TEXT_PATH = /^\/api\/texts\/([A-Za-z0-9_-]{1,64})$/;
const MGMT_PATH = /^\/api\/(admin|teacher)\/(teachers|students|classes)(?:\/([0-9a-f]{1,64})\/(disable|password|class))?$/;

type Ctx = {
  req: IncomingMessage;
  res: ServerResponse;
  method: string;
  path: string;
  cookies: Map<string, string>;
  svc: Services;
};

/** The one request handler for the whole server: API under /api, built SPA otherwise. */
export function makeHandler(svc: Services) {
  return async (req: IncomingMessage, res: ServerResponse): Promise<void> => {
    const url = new URL(req.url ?? "/", "http://localhost");
    const path = url.pathname;
    const method = (req.method ?? "GET").toUpperCase();
    if (!path.startsWith("/api/")) {
      await serveStatic(res, svc.config.clientDir, path === "/" ? "/index.html" : path);
      return;
    }
    const ctx: Ctx = { req, res, method, path, cookies: parseCookies(req.headers.cookie), svc };
    try {
      // CSRF defence in depth: state-changing API calls must carry the app header.
      if (method !== "GET" && method !== "HEAD" && req.headers[APP_HEADER] !== "1") throw new HttpError(403, "forbidden");
      await route(ctx);
    } catch (err) {
      sendError(res, err);
    }
  };
}

async function route(ctx: Ctx): Promise<void> {
  const { method, path } = ctx;
  if (method === "GET" && path === "/api/auth/session") return getSession(ctx);
  if (method === "POST" && path === "/api/setup") return setup(ctx);
  if (method === "POST" && path === "/api/auth/login") return login(ctx);
  if (method === "POST" && path === "/api/auth/logout") return logout(ctx);
  if (method === "POST" && path === "/api/account/password") return changePassword(ctx);
  if (path === "/api/texts" && method === "GET") return listTexts(ctx);
  const textMatch = TEXT_PATH.exec(path);
  if (textMatch) return textRoute(ctx, textMatch[1]!);
  const mgmt = MGMT_PATH.exec(path);
  if (mgmt) return mgmtRoute(ctx, mgmt[1] as "admin" | "teacher", mgmt[2]!, mgmt[3], mgmt[4]);
  throw new HttpError(404, "not_found");
}

// --- auth routes ---

function getSession(ctx: Ctx): void {
  const user = currentUser(ctx);
  sendJson(ctx.res, 200, {
    needsSetup: ctx.svc.users.count() === 0,
    user: user ? toPublicUser(user) : null,
  });
}

async function setup(ctx: Ctx): Promise<void> {
  if (ctx.svc.users.count() > 0) throw new HttpError(409, "already_setup");
  const { username, password } = await credentials(ctx);
  const admin = ctx.svc.users.create({ username, password, role: "admin", createdBy: null });
  startSession(ctx, admin.id);
  sendJson(ctx.res, 200, { user: toPublicUser(admin) });
}

async function login(ctx: Ctx): Promise<void> {
  const { username, password } = await credentials(ctx);
  const found = ctx.svc.users.byUsername(username);
  if (!found || found.disabled || !verifyPassword(password, { hash: found.pwHash, salt: found.pwSalt }))
    throw new HttpError(401, "invalid_credentials");
  startSession(ctx, found.id);
  sendJson(ctx.res, 200, { user: toPublicUser(found) });
}

function logout(ctx: Ctx): void {
  const id = ctx.cookies.get(COOKIE);
  if (id) ctx.svc.sessions.destroy(id);
  clearSessionCookie(ctx.res);
  sendJson(ctx.res, 200, { ok: true });
}

async function changePassword(ctx: Ctx): Promise<void> {
  const user = requireUser(ctx);
  const body = await readJson(ctx.req);
  const current = strField(body, "current", 1);
  const next = passwordField(body, "next");
  const found = ctx.svc.users.byUsername(user.username)!;
  if (!verifyPassword(current, { hash: found.pwHash, salt: found.pwSalt })) throw new HttpError(401, "invalid_credentials");
  ctx.svc.users.setPassword(user.id, next);
  sendJson(ctx.res, 200, { ok: true });
}

// --- texts routes (the Store interface, scoped to the signed-in owner) ---

function listTexts(ctx: Ctx): void {
  const user = requireUser(ctx);
  sendJson(ctx.res, 200, { texts: ctx.svc.texts.listMeta(user.id) });
}

async function textRoute(ctx: Ctx, id: string): Promise<void> {
  const user = requireUser(ctx);
  if (ctx.method === "GET") {
    const doc = ctx.svc.texts.get(user.id, id);
    if (!doc) throw new HttpError(404, "not_found");
    return sendJson(ctx.res, 200, { doc });
  }
  if (ctx.method === "PUT") {
    let doc;
    try {
      doc = parseStoredDoc(await readJson(ctx.req));
    } catch (err) {
      if (err instanceof ImportError) throw new HttpError(400, "bad_doc");
      throw err;
    }
    if (doc.id !== id) throw new HttpError(400, "id_mismatch");
    try {
      ctx.svc.texts.put(user.id, doc);
    } catch (err) {
      if (err instanceof OwnershipError) throw new HttpError(403, "forbidden");
      throw err;
    }
    return sendJson(ctx.res, 200, { ok: true });
  }
  if (ctx.method === "DELETE") {
    ctx.svc.texts.remove(user.id, id);
    return sendJson(ctx.res, 200, { ok: true });
  }
  throw new HttpError(405, "method_not_allowed");
}

// --- account management (admin manages teachers; teacher manages own students + classes) ---

async function mgmtRoute(
  ctx: Ctx,
  scope: "admin" | "teacher",
  kind: string,
  targetId: string | undefined,
  action: string | undefined,
): Promise<void> {
  if (scope === "admin") {
    const admin = requireRole(ctx, "admin");
    if (kind !== "teachers") throw new HttpError(404, "not_found");
    return manageAccounts(ctx, { role: "teacher", creator: admin, scopeToCreator: false, targetId, action });
  }
  const teacher = requireRole(ctx, "teacher");
  if (kind === "students") {
    return manageAccounts(ctx, { role: "student", creator: teacher, scopeToCreator: true, targetId, action });
  }
  if (kind === "classes") return manageClasses(ctx, teacher);
  throw new HttpError(404, "not_found");
}

async function manageAccounts(
  ctx: Ctx,
  o: { role: Role; creator: User; scopeToCreator: boolean; targetId?: string; action?: string },
): Promise<void> {
  // Resolve + authorize the target for per-user actions: right role, and (for students) owned by us.
  const target = o.targetId ? ctx.svc.users.byId(o.targetId) : undefined;
  if (o.targetId) {
    if (!target || target.role !== o.role || (o.scopeToCreator && target.createdBy !== o.creator.id))
      throw new HttpError(404, "not_found");
  }

  if (!o.targetId && ctx.method === "GET") {
    const users = ctx.svc.users.listByRole(o.role, o.scopeToCreator ? o.creator.id : null);
    const withClass = o.role === "student";
    return sendJson(ctx.res, 200, {
      users: users.map((u) => ({ ...toPublicUser(u), classId: withClass ? ctx.svc.classes.classOf(u.id) : undefined })),
    });
  }

  if (!o.targetId && ctx.method === "POST") {
    const body = await readJson(ctx.req);
    const { username, password } = credsFrom(body);
    const created = createAccount(ctx, { username, password, role: o.role, createdBy: o.creator.id });
    if (o.role === "student") assignClass(ctx, o.creator, created.id, body, { optional: true });
    return sendJson(ctx.res, 200, { user: toPublicUser(created) });
  }

  if (target && ctx.method === "POST" && o.action === "disable") {
    const disabled = boolField(await readJson(ctx.req), "disabled");
    ctx.svc.users.setDisabled(target.id, disabled);
    if (disabled) ctx.svc.sessions.destroyAllForUser(target.id); // kick an account that was just turned off
    return sendJson(ctx.res, 200, { ok: true });
  }
  if (target && ctx.method === "POST" && o.action === "password") {
    const password = passwordField(await readJson(ctx.req), "password");
    ctx.svc.users.setPassword(target.id, password);
    ctx.svc.sessions.destroyAllForUser(target.id); // force re-login with the new password
    return sendJson(ctx.res, 200, { ok: true });
  }
  if (target && ctx.method === "POST" && o.action === "class" && o.role === "student") {
    assignClass(ctx, o.creator, target.id, await readJson(ctx.req), { optional: false });
    return sendJson(ctx.res, 200, { ok: true });
  }
  throw new HttpError(404, "not_found");
}

async function manageClasses(ctx: Ctx, teacher: User): Promise<void> {
  if (ctx.method === "GET") return sendJson(ctx.res, 200, { classes: ctx.svc.classes.listByTeacher(teacher.id) });
  if (ctx.method === "POST") {
    const name = strField(await readJson(ctx.req), "name", 1, 64).trim();
    if (name === "") throw new HttpError(400, "bad_field");
    return sendJson(ctx.res, 200, { class: ctx.svc.classes.create(teacher.id, name) });
  }
  throw new HttpError(404, "not_found");
}

function assignClass(ctx: Ctx, teacher: User, studentId: string, body: unknown, opts: { optional: boolean }): void {
  const raw = (body as Record<string, unknown> | undefined)?.classId;
  if (raw === undefined || raw === null) {
    if (opts.optional) return; // creating a student without a class is fine
    ctx.svc.classes.assign(studentId, null);
    return;
  }
  if (typeof raw !== "string") throw new HttpError(400, "bad_field");
  const klass = ctx.svc.classes.byId(raw);
  if (!klass || klass.teacherId !== teacher.id) throw new HttpError(404, "not_found"); // only your own class
  ctx.svc.classes.assign(studentId, klass.id);
}

function createAccount(ctx: Ctx, input: { username: string; password: string; role: Role; createdBy: string }): User {
  try {
    return ctx.svc.users.create(input);
  } catch (err) {
    if (err instanceof Error && /UNIQUE/i.test(err.message)) throw new HttpError(409, "username_taken");
    throw err;
  }
}

function boolField(body: unknown, key: string): boolean {
  const v = (body as Record<string, unknown> | undefined)?.[key];
  if (typeof v !== "boolean") throw new HttpError(400, "bad_field");
  return v;
}

// --- shared helpers (used by later stages too) ---

export function currentUser(ctx: Ctx): User | undefined {
  const id = ctx.cookies.get(COOKIE);
  if (!id) return undefined;
  const userId = ctx.svc.sessions.touch(id);
  if (!userId) return undefined;
  const user = ctx.svc.users.byId(userId);
  if (!user || user.disabled) return undefined;
  return user;
}

export function requireUser(ctx: Ctx): User {
  const user = currentUser(ctx);
  if (!user) throw new HttpError(401, "unauthorized");
  return user;
}

export function requireRole(ctx: Ctx, role: Role): User {
  const user = requireUser(ctx);
  if (user.role !== role) throw new HttpError(403, "forbidden");
  return user;
}

function startSession(ctx: Ctx, userId: string): void {
  setSessionCookie(ctx.res, ctx.svc.sessions.create(userId));
}

async function credentials(ctx: Ctx): Promise<{ username: string; password: string }> {
  return credsFrom(await readJson(ctx.req));
}

function credsFrom(body: unknown): { username: string; password: string } {
  return { username: usernameField(body), password: passwordField(body, "password") };
}

function strField(body: unknown, key: string, min: number, max = 128): string {
  const v = (body as Record<string, unknown> | undefined)?.[key];
  if (typeof v !== "string" || v.length < min || v.length > max) throw new HttpError(400, "bad_field");
  return v;
}

export function usernameField(body: unknown): string {
  const raw = strField(body, "username", 1, 64).trim();
  // No control characters or surrounding whitespace; otherwise free so French names work.
  if (raw.length === 0 || /[\u0000-\u001f]/.test(raw)) throw new HttpError(400, "bad_username");
  return raw;
}

export function passwordField(body: unknown, key: string): string {
  // Deliberately permissive minimum: young students get short, simple passwords.
  return strField(body, key, 4, 128);
}
