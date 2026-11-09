import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { ServerResponse } from "node:http";
import { PassThrough } from "node:stream";
import { beforeAll, describe, expect, it } from "vitest";
import { serveStatic } from "../src/server/http";

// A ServerResponse stand-in: a writable stream (so createReadStream().pipe(res)
// works) that records the status code writeHead was called with.
function fakeRes() {
  const res = new PassThrough() as PassThrough & { statusCode: number; writeHead: (code: number, headers?: unknown) => typeof res };
  res.statusCode = 0;
  res.writeHead = (code: number) => {
    res.statusCode = code;
    return res;
  };
  return res;
}

let root: string;

beforeAll(() => {
  const base = mkdtempSync(join(tmpdir(), "flechettes-static-"));
  root = join(base, "client");
  mkdirSync(join(root, "assets"), { recursive: true });
  writeFileSync(join(root, "index.html"), "<!doctype html>");
  writeFileSync(join(root, "assets", "app.js"), "console.log(1)");
  // A sibling file outside root, and a sibling dir sharing root's name prefix.
  writeFileSync(join(base, "secret.txt"), "top secret");
  mkdirSync(join(base, "client-secret"), { recursive: true });
  writeFileSync(join(base, "client-secret", "leak.txt"), "leak");
});

describe("serveStatic", () => {
  async function status(urlPath: string): Promise<number> {
    const res = fakeRes();
    await serveStatic(res as unknown as ServerResponse, root, urlPath);
    return res.statusCode;
  }

  it("serves a real file", async () => {
    expect(await status("/index.html")).toBe(200);
    expect(await status("/assets/app.js")).toBe(200);
  });

  it("falls back to index.html for extension-less routes", async () => {
    expect(await status("/some/route")).toBe(200);
  });

  it("404s a missing file with an extension", async () => {
    expect(await status("/missing.js")).toBe(404);
  });

  it("rejects traversal out of the client root", async () => {
    expect(await status("/../secret.txt")).toBe(403);
    expect(await status("/..%2f..%2fsecret.txt")).toBe(403);
    expect(await status("/../../secret.txt")).toBe(403);
  });

  it("rejects a sibling directory sharing the root name prefix", async () => {
    expect(await status("/../client-secret/leak.txt")).toBe(403);
  });
});
