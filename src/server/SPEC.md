---
id: server
type: module-design
status: draft
title: LAN server — serving, auth, roles and storage
parent: architecture
depends-on: [model, overlay, storage]
---

# LAN server — serving, auth, roles and storage

A **self-contained** Node + TypeScript server: one process serves the built SPA and a JSON API under
`/api`, backed by one SQLite file. No external services or APIs. It is the source of truth for storage
and identity. Launched with one command (`npm run build` then `npm start`); env-overridable port, host
(binds `0.0.0.0` for LAN reach), db path and idle timeout.

## Responsibilities

- **Serving.** Static built SPA with an SPA fallback for route-like paths; refuses path traversal. The
  API shares the same origin, so the SPA's CSP `connect-src 'self'` reaches only here.
- **Auth.** First run (no users) exposes only a one-time setup that creates the administrator.
  Passwords are hashed with built-in `crypto.scrypt` (per-user salt). Sessions are server-side rows
  keyed by an `httpOnly; SameSite=Strict` cookie (no `Secure` — plain HTTP on the LAN). An **idle
  timeout** expires a session after inactivity (checked and refreshed on each request); explicit
  logout and password change are supported. Mutating API calls must carry an app header (CSRF defence
  in depth).
- **Authorization — deny by default.** Every route resolves the session user and checks role and
  ownership: student → own texts only; teacher → manage their own students and classes; admin → manage
  teachers. Admins do not create students or read texts. Disabling an account or resetting its password
  drops that account's live sessions.
- **Texts API.** `GET/PUT/DELETE /api/texts[/:id]`, mapped onto the `storage` `Store` interface and
  scoped to the signed-in owner; an id owned by someone else is refused. Every incoming document is
  re-validated with `storage`'s import rules (`parseStoredDoc`) — the client is untrusted.
- **Account management.** `/api/admin/teachers` (admin) and `/api/teacher/students` + `/api/teacher/classes`
  (teacher), each scoped to the caller; a student belongs to at most one class for now. Duplicate
  usernames are rejected.
- **Data (SQLite).** Versioned schema (`user_version`), migrations in a transaction, never dropping
  data; WAL + foreign keys on. Tables: `users`, `sessions`, `classes`, `class_members`, `texts`
  (a `Doc` with `tokens`/`overlay` as JSON). Backup = copy the file.

## Boundary

- Holds **no linguistic logic**: it validates and stores documents but never inspects their language
  (reuses `model`/`overlay`/`storage` validation).
- The browser's document model remains the source of truth for the *live editing* of an open text; the
  server is the source of truth for *persistence and identity*.

## Accepted limitations & deferrals

- **Plain HTTP on a trusted LAN** (no public CA): passwords and texts cross the LAN unencrypted;
  passwords are only ever stored hashed and the design leaves room for TLS / a reverse proxy later.
- SQLite is not encrypted at rest.
- Deferred: teacher viewing/collecting of student texts, richer classes, an append-only audit log, and
  a whole-server admin backup.

## Verification

Unit + HTTP-integration tested (`tests/server.test.ts`): scrypt hashing, the user/session repos,
first-run setup, login (good/bad), CSRF enforcement, logout, disabled-user block, idle expiry, password
change, texts ownership scoping, invalid documents, and admin/teacher authorization and scoping.
