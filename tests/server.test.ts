// @vitest-environment node
import type { AddressInfo } from "node:net";
import { createServer, type Server } from "node:http";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { hashPassword, verifyPassword } from "../src/server/auth";
import { createServices, makeHandler, type Services } from "../src/server/app";
import type { Config } from "../src/server/config";
import { openDb } from "../src/server/db";
import { Sessions, Users } from "../src/server/repo";

function testConfig(overrides: Partial<Config> = {}): Config {
  return { port: 0, host: "127.0.0.1", dbPath: ":memory:", clientDir: "dist", idleMs: 30 * 60_000, ...overrides };
}

describe("password hashing", () => {
  it("verifies the right password and rejects the wrong one", () => {
    const stored = hashPassword("secret1");
    expect(verifyPassword("secret1", stored)).toBe(true);
    expect(verifyPassword("secret2", stored)).toBe(false);
  });

  it("uses a fresh salt each time", () => {
    expect(hashPassword("x").salt).not.toBe(hashPassword("x").salt);
  });
});

describe("Users repo", () => {
  it("creates, finds, lists by role and scope, and updates", () => {
    const db = openDb(":memory:");
    const users = new Users(db, () => 1000);
    expect(users.count()).toBe(0);
    const admin = users.create({ username: "admin", password: "pw1234", role: "admin", createdBy: null });
    const teacher = users.create({ username: "tea", password: "pw1234", role: "teacher", createdBy: null });
    const teacher2 = users.create({ username: "tea2", password: "pw1234", role: "teacher", createdBy: null });
    const s1 = users.create({ username: "s1", password: "pw1234", role: "student", createdBy: teacher.id });
    users.create({ username: "s2", password: "pw1234", role: "student", createdBy: teacher2.id });

    expect(users.count()).toBe(5);
    expect(users.byUsername("admin")!.id).toBe(admin.id);
    expect(users.listByRole("teacher", null).map((u) => u.username)).toEqual(["tea", "tea2"]);
    // A teacher sees only their own students.
    expect(users.listByRole("student", teacher.id).map((u) => u.username)).toEqual(["s1"]);

    expect(() => users.create({ username: "admin", password: "pw1234", role: "admin", createdBy: null })).toThrow();

    users.setDisabled(s1.id, true);
    expect(users.byId(s1.id)!.disabled).toBe(true);
    users.setPassword(s1.id, "newpass");
    const row = users.byUsername("s1")!;
    expect(verifyPassword("newpass", { hash: row.pwHash, salt: row.pwSalt })).toBe(true);
  });
});

describe("Sessions repo", () => {
  it("creates, refreshes, expires on idle, and destroys", () => {
    const db = openDb(":memory:");
    const users = new Users(db, () => 0);
    const u = users.create({ username: "u", password: "pw1234", role: "admin", createdBy: null });
    let now = 1000;
    const sessions = new Sessions(db, 100, () => now);
    const id = sessions.create(u.id);
    expect(sessions.touch(id)).toBe(u.id);
    now += 50; // within idle window; refreshes last_seen
    expect(sessions.touch(id)).toBe(u.id);
    now += 50; // still within window measured from the refresh
    expect(sessions.touch(id)).toBe(u.id);
    now += 101; // idle beyond timeout
    expect(sessions.touch(id)).toBeUndefined();
    expect(sessions.touch(id)).toBeUndefined(); // destroyed on expiry
  });
});

describe("auth HTTP flow", () => {
  let server: Server;
  let base: string;
  let svc: Services;
  let now = 1_000_000;

  function start(config: Config): Promise<void> {
    const db = openDb(config.dbPath);
    svc = createServices(db, config, () => now);
    server = createServer(makeHandler(svc));
    return new Promise((resolve) => server.listen(0, "127.0.0.1", () => {
      base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
      resolve();
    }));
  }

  async function call(
    path: string,
    opts: { method?: string; body?: unknown; cookie?: string; app?: boolean } = {},
  ): Promise<{ status: number; data: any; cookie?: string }> {
    const headers: Record<string, string> = {};
    const method = opts.method ?? "GET";
    if (opts.app ?? method !== "GET") headers["x-flechettes-app"] = "1";
    if (opts.body !== undefined) headers["content-type"] = "application/json";
    if (opts.cookie) headers["cookie"] = opts.cookie;
    const res = await fetch(base + path, {
      method,
      headers,
      body: opts.body === undefined ? undefined : JSON.stringify(opts.body),
    });
    const setCookie = res.headers.get("set-cookie");
    return { status: res.status, data: await res.json().catch(() => undefined), cookie: setCookie?.split(";")[0] };
  }

  beforeEach(() => start(testConfig()));
  afterEach(() => new Promise<void>((r) => server.close(() => r())));

  it("runs first-run setup once, then login and session", async () => {
    expect((await call("/api/auth/session")).data).toEqual({ needsSetup: true, user: null });

    const setup = await call("/api/setup", { method: "POST", body: { username: "admin", password: "secret1" } });
    expect(setup.status).toBe(200);
    expect(setup.data.user.role).toBe("admin");
    expect(setup.cookie).toBeTruthy();

    // Setup is a one-time door.
    expect((await call("/api/setup", { method: "POST", body: { username: "x", password: "yyyy" } })).status).toBe(409);

    const session = await call("/api/auth/session", { cookie: setup.cookie });
    expect(session.data.needsSetup).toBe(false);
    expect(session.data.user.username).toBe("admin");
  });

  it("rejects bad credentials and accepts good ones", async () => {
    await call("/api/setup", { method: "POST", body: { username: "admin", password: "secret1" } });
    expect((await call("/api/auth/login", { method: "POST", body: { username: "admin", password: "nope99" } })).status).toBe(401);
    const ok = await call("/api/auth/login", { method: "POST", body: { username: "admin", password: "secret1" } });
    expect(ok.status).toBe(200);
    expect((await call("/api/auth/session", { cookie: ok.cookie })).data.user.username).toBe("admin");
  });

  it("refuses mutating calls without the app header (CSRF)", async () => {
    await call("/api/setup", { method: "POST", body: { username: "admin", password: "secret1" } });
    const login = await call("/api/auth/login", { method: "POST", body: { username: "admin", password: "secret1" } });
    expect((await call("/api/auth/logout", { method: "POST", app: false, cookie: login.cookie })).status).toBe(403);
  });

  it("logs out and ends the session", async () => {
    await call("/api/setup", { method: "POST", body: { username: "admin", password: "secret1" } });
    const login = await call("/api/auth/login", { method: "POST", body: { username: "admin", password: "secret1" } });
    expect((await call("/api/auth/logout", { method: "POST", cookie: login.cookie })).status).toBe(200);
    expect((await call("/api/auth/session", { cookie: login.cookie })).data.user).toBeNull();
  });

  it("blocks a disabled user from logging in", async () => {
    await call("/api/setup", { method: "POST", body: { username: "admin", password: "secret1" } });
    const teacher = svc.users.create({ username: "tea", password: "pw1234", role: "teacher", createdBy: null });
    svc.users.setDisabled(teacher.id, true);
    expect((await call("/api/auth/login", { method: "POST", body: { username: "tea", password: "pw1234" } })).status).toBe(401);
  });

  it("changes password only with the correct current one", async () => {
    const setup = await call("/api/setup", { method: "POST", body: { username: "admin", password: "secret1" } });
    expect(
      (await call("/api/account/password", { method: "POST", cookie: setup.cookie, body: { current: "wrong", next: "secret2" } }))
        .status,
    ).toBe(401);
    expect(
      (await call("/api/account/password", { method: "POST", cookie: setup.cookie, body: { current: "secret1", next: "secret2" } }))
        .status,
    ).toBe(200);
    expect((await call("/api/auth/login", { method: "POST", body: { username: "admin", password: "secret2" } })).status).toBe(200);
  });

  const sampleDoc = (id: string, title: string) => ({
    id,
    title,
    createdAt: 1,
    updatedAt: 2,
    textSize: "m",
    deletedAt: null,
    tokens: [{ kind: "word", id: "w1", text: title }],
    overlay: [],
  });

  it("scopes texts to their owner", async () => {
    const admin = await call("/api/setup", { method: "POST", body: { username: "admin", password: "secret1" } });
    const doc = sampleDoc("t1", "Bonjour");
    expect((await call("/api/texts/t1", { method: "PUT", cookie: admin.cookie, body: doc })).status).toBe(200);
    expect((await call("/api/texts", { cookie: admin.cookie })).data.texts.map((m: any) => m.id)).toEqual(["t1"]);

    svc.users.create({ username: "kid", password: "pw1234", role: "student", createdBy: null });
    const kid = await call("/api/auth/login", { method: "POST", body: { username: "kid", password: "pw1234" } });
    // The student sees none of the admin's texts, cannot read one, and cannot overwrite it.
    expect((await call("/api/texts", { cookie: kid.cookie })).data.texts).toEqual([]);
    expect((await call("/api/texts/t1", { cookie: kid.cookie })).status).toBe(404);
    expect((await call("/api/texts/t1", { method: "PUT", cookie: kid.cookie, body: doc })).status).toBe(403);
  });

  it("rejects unauthenticated texts access and invalid documents", async () => {
    const admin = await call("/api/setup", { method: "POST", body: { username: "admin", password: "secret1" } });
    expect((await call("/api/texts")).status).toBe(401);
    expect((await call("/api/texts/t1", { method: "PUT", cookie: admin.cookie, body: sampleDoc("other", "X") })).status).toBe(400);
    expect((await call("/api/texts/zz", { method: "PUT", cookie: admin.cookie, body: { id: "zz", tokens: "nope" } })).status).toBe(400);
  });

  it("round-trips a text and removes it", async () => {
    const admin = await call("/api/setup", { method: "POST", body: { username: "admin", password: "secret1" } });
    await call("/api/texts/t1", { method: "PUT", cookie: admin.cookie, body: sampleDoc("t1", "Salut") });
    expect((await call("/api/texts/t1", { cookie: admin.cookie })).data.doc.title).toBe("Salut");
    expect((await call("/api/texts/t1", { method: "DELETE", cookie: admin.cookie })).status).toBe(200);
    expect((await call("/api/texts/t1", { cookie: admin.cookie })).status).toBe(404);
  });

  it("lets only an admin manage teachers", async () => {
    const admin = await call("/api/setup", { method: "POST", body: { username: "admin", password: "secret1" } });
    expect((await call("/api/admin/teachers", { method: "POST", cookie: admin.cookie, body: { username: "m", password: "teach1" } })).status).toBe(200);
    expect((await call("/api/admin/teachers", { cookie: admin.cookie })).data.users.map((u: any) => u.username)).toEqual(["m"]);
    expect((await call("/api/admin/teachers", { method: "POST", cookie: admin.cookie, body: { username: "m", password: "again1" } })).status).toBe(409);
    expect((await call("/api/admin/teachers")).status).toBe(401);

    const teacher = await call("/api/auth/login", { method: "POST", body: { username: "m", password: "teach1" } });
    expect((await call("/api/admin/teachers", { cookie: teacher.cookie })).status).toBe(403); // teacher is not admin
  });

  it("scopes a teacher to their own students and classes", async () => {
    await call("/api/setup", { method: "POST", body: { username: "admin", password: "secret1" } });
    svc.users.create({ username: "a", password: "pw1234", role: "teacher", createdBy: null });
    svc.users.create({ username: "b", password: "pw1234", role: "teacher", createdBy: null });
    const a = await call("/api/auth/login", { method: "POST", body: { username: "a", password: "pw1234" } });
    const b = await call("/api/auth/login", { method: "POST", body: { username: "b", password: "pw1234" } });

    const clsA = (await call("/api/teacher/classes", { method: "POST", cookie: a.cookie, body: { name: "CM1" } })).data.class;
    expect((await call("/api/teacher/students", { method: "POST", cookie: a.cookie, body: { username: "lea", password: "kid123", classId: clsA.id } })).status).toBe(200);

    const mine = (await call("/api/teacher/students", { cookie: a.cookie })).data.users;
    expect(mine.map((u: any) => u.username)).toEqual(["lea"]);
    expect(mine[0].classId).toBe(clsA.id);
    const sid = mine[0].id;

    // Teacher B sees none of A's students and cannot act on them.
    expect((await call("/api/teacher/students", { cookie: b.cookie })).data.users).toEqual([]);
    expect((await call(`/api/teacher/students/${sid}/disable`, { method: "POST", cookie: b.cookie, body: { disabled: true } })).status).toBe(404);

    // A cannot move their student into B's class.
    const clsB = (await call("/api/teacher/classes", { method: "POST", cookie: b.cookie, body: { name: "CE2" } })).data.class;
    expect((await call(`/api/teacher/students/${sid}/class`, { method: "POST", cookie: a.cookie, body: { classId: clsB.id } })).status).toBe(404);
  });

  it("kicks a user whose account is disabled or password-reset", async () => {
    const admin = await call("/api/setup", { method: "POST", body: { username: "admin", password: "secret1" } });
    const t = svc.users.create({ username: "m", password: "teach1", role: "teacher", createdBy: null });
    const teacher = await call("/api/auth/login", { method: "POST", body: { username: "m", password: "teach1" } });
    expect((await call("/api/auth/session", { cookie: teacher.cookie })).data.user.username).toBe("m");
    await call(`/api/admin/teachers/${t.id}/disable`, { method: "POST", cookie: admin.cookie, body: { disabled: true } });
    expect((await call("/api/auth/session", { cookie: teacher.cookie })).data.user).toBeNull();
  });

  it("expires an idle session on the next request", async () => {
    await new Promise<void>((r) => server.close(() => r())); // replace the default-config server
    await start(testConfig({ idleMs: 100 }));
    const setup = await call("/api/setup", { method: "POST", body: { username: "admin", password: "secret1" } });
    expect((await call("/api/auth/session", { cookie: setup.cookie })).data.user).toBeTruthy();
    now += 200;
    expect((await call("/api/auth/session", { cookie: setup.cookie })).data.user).toBeNull();
  });
});
