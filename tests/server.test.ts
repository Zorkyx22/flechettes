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

  it("expires an idle session on the next request", async () => {
    await new Promise<void>((r) => server.close(() => r())); // replace the default-config server
    await start(testConfig({ idleMs: 100 }));
    const setup = await call("/api/setup", { method: "POST", body: { username: "admin", password: "secret1" } });
    expect((await call("/api/auth/session", { cookie: setup.cookie })).data.user).toBeTruthy();
    now += 200;
    expect((await call("/api/auth/session", { cookie: setup.cookie })).data.user).toBeNull();
  });
});
