import { createReadStream } from "node:fs";
import { stat } from "node:fs/promises";
import type { IncomingMessage, ServerResponse } from "node:http";
import { extname, join, resolve, sep } from "node:path";

export const COOKIE = "fsid";
/** Mutating API requests must carry this header; cross-origin callers cannot set it. */
export const APP_HEADER = "x-flechettes-app";
const COOKIE_MAX_AGE = 12 * 60 * 60; // seconds; the server-side idle timeout is the real gate.
const MAX_BODY = 8_000_000;

export class HttpError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
  ) {
    super(code);
  }
}

export function sendJson(res: ServerResponse, status: number, body: unknown): void {
  const text = JSON.stringify(body);
  res.writeHead(status, { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" });
  res.end(text);
}

export function sendError(res: ServerResponse, err: unknown): void {
  if (err instanceof HttpError) sendJson(res, err.status, { error: err.code });
  else {
    console.error("server error:", err);
    sendJson(res, 500, { error: "server_error" });
  }
}

export async function readJson(req: IncomingMessage): Promise<unknown> {
  const chunks: Buffer[] = [];
  let size = 0;
  for await (const chunk of req) {
    size += chunk.length;
    if (size > MAX_BODY) throw new HttpError(413, "too_large");
    chunks.push(chunk as Buffer);
  }
  if (size === 0) return undefined;
  try {
    return JSON.parse(Buffer.concat(chunks).toString("utf8"));
  } catch {
    throw new HttpError(400, "bad_json");
  }
}

export function parseCookies(header: string | undefined): Map<string, string> {
  const out = new Map<string, string>();
  if (!header) return out;
  for (const part of header.split(";")) {
    const eq = part.indexOf("=");
    if (eq === -1) continue;
    out.set(part.slice(0, eq).trim(), decodeURIComponent(part.slice(eq + 1).trim()));
  }
  return out;
}

export function setSessionCookie(res: ServerResponse, id: string): void {
  // No Secure flag: deployment is plain HTTP on a trusted LAN (recorded accepted limitation).
  res.setHeader("set-cookie", `${COOKIE}=${id}; HttpOnly; SameSite=Strict; Path=/; Max-Age=${COOKIE_MAX_AGE}`);
}

export function clearSessionCookie(res: ServerResponse): void {
  res.setHeader("set-cookie", `${COOKIE}=; HttpOnly; SameSite=Strict; Path=/; Max-Age=0`);
}

const TYPES: Record<string, string> = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".svg": "image/svg+xml",
  ".woff2": "font/woff2",
  ".woff": "font/woff",
  ".png": "image/png",
  ".ico": "image/x-icon",
  ".map": "application/json; charset=utf-8",
};

/**
 * Serves the built SPA. Unknown non-asset paths fall back to index.html so client routing works.
 * Refuses any path that escapes the client directory.
 */
export async function serveStatic(res: ServerResponse, clientDir: string, urlPath: string): Promise<void> {
  const root = resolve(clientDir);
  const requested = decodeURIComponent(urlPath);
  // Resolve the request against the client root and confirm it stays inside it.
  // resolve() canonicalises any ".." segments, and the startsWith check on the
  // resolved root is the sanitiser that neutralises path traversal. The extra
  // separator guard rejects sibling directories that merely share root's name
  // prefix (e.g. "<root>-secret").
  let filePath = resolve(root, `.${requested.startsWith("/") ? requested : `/${requested}`}`);
  if (!filePath.startsWith(root)) {
    res.writeHead(403).end();
    return;
  }
  if (filePath !== root && !filePath.startsWith(root + sep)) {
    res.writeHead(403).end();
    return;
  }
  let info = await stat(filePath).catch(() => undefined);
  if (!info?.isFile()) {
    // SPA fallback for route-like paths without a file extension.
    if (extname(requested)) {
      res.writeHead(404).end();
      return;
    }
    filePath = join(root, "index.html");
    info = await stat(filePath).catch(() => undefined);
    if (!info?.isFile()) {
      res.writeHead(404).end();
      return;
    }
  }
  const type = TYPES[extname(filePath).toLowerCase()] ?? "application/octet-stream";
  const immutable = filePath.includes(`${join(root, "assets")}`);
  res.writeHead(200, {
    "content-type": type,
    "cache-control": immutable ? "public, max-age=31536000, immutable" : "no-cache",
  });
  createReadStream(filePath).pipe(res);
}
