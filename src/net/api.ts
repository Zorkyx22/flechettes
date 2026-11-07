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

export type ManagedUser = PublicUser & { classId?: string | null };
export type Class = { id: string; teacherId: string; name: string };

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

  // Admin manages teacher accounts.
  adminTeachers: () => request<{ users: ManagedUser[] }>("/api/admin/teachers", "GET").then((r) => r.users),
  adminCreateTeacher: (username: string, password: string) =>
    request<{ user: PublicUser }>("/api/admin/teachers", "POST", { username, password }).then((r) => r.user),
  adminSetTeacherDisabled: (id: string, disabled: boolean) =>
    request<{ ok: true }>(`/api/admin/teachers/${id}/disable`, "POST", { disabled }),
  adminSetTeacherPassword: (id: string, password: string) =>
    request<{ ok: true }>(`/api/admin/teachers/${id}/password`, "POST", { password }),

  // Teacher manages their own students and classes.
  teacherStudents: () => request<{ users: ManagedUser[] }>("/api/teacher/students", "GET").then((r) => r.users),
  teacherCreateStudent: (username: string, password: string, classId: string | null) =>
    request<{ user: PublicUser }>("/api/teacher/students", "POST", { username, password, classId }).then((r) => r.user),
  teacherSetStudentDisabled: (id: string, disabled: boolean) =>
    request<{ ok: true }>(`/api/teacher/students/${id}/disable`, "POST", { disabled }),
  teacherSetStudentPassword: (id: string, password: string) =>
    request<{ ok: true }>(`/api/teacher/students/${id}/password`, "POST", { password }),
  teacherSetStudentClass: (id: string, classId: string | null) =>
    request<{ ok: true }>(`/api/teacher/students/${id}/class`, "POST", { classId }),
  teacherClasses: () => request<{ classes: Class[] }>("/api/teacher/classes", "GET").then((r) => r.classes),
  teacherCreateClass: (name: string) =>
    request<{ class: Class }>("/api/teacher/classes", "POST", { name }).then((r) => r.class),
};

export { request as apiRequest };
