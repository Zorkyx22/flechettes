/** Browser-side client for the server API. Same-origin only; sends the app header the server requires. */

export type Role = "admin" | "teacher" | "student";

export type PublicUser = {
  id: string;
  username: string;
  role: Role;
  disabled: boolean;
  createdAt: number;
  updatedAt: number;
  createdBy?: string | null;
};

export type SessionInfo = { needsSetup: boolean; user: PublicUser | null };

export class ApiError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
  ) {
    super(code);
  }
}

/** Called whenever a request is rejected as unauthenticated (expired/killed session). */
let onUnauthorized: () => void = () => {};
export function setUnauthorizedHandler(fn: () => void): void {
  onUnauthorized = fn;
}

async function request<T>(path: string, method: string, body?: unknown): Promise<T> {
  const headers: Record<string, string> = {};
  if (method !== "GET") headers["x-flechettes-app"] = "1";
  if (body !== undefined) headers["content-type"] = "application/json";
  const res = await fetch(path, {
    method,
    headers,
    credentials: "same-origin",
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  if (res.status === 401) onUnauthorized();
  const data = res.status === 204 ? undefined : await res.json().catch(() => undefined);
  if (!res.ok) throw new ApiError(res.status, (data as { error?: string })?.error ?? "error");
  return data as T;
}

export const api = {
  session: () => request<SessionInfo>("/api/auth/session", "GET"),
  setup: (username: string, password: string) =>
    request<{ user: PublicUser }>("/api/setup", "POST", { username, password }),
  login: (username: string, password: string) =>
    request<{ user: PublicUser }>("/api/auth/login", "POST", { username, password }),
  logout: () => request<{ ok: true }>("/api/auth/logout", "POST"),
  changePassword: (current: string, next: string) =>
    request<{ ok: true }>("/api/account/password", "POST", { current, next }),
};

export { request as apiRequest };
