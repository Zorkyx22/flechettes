---
id: storage
type: module-design
status: draft
title: Storage — server source of truth, offline cache, bin
parent: architecture
depends-on: [model, overlay]
---

# Storage — server source of truth, offline cache, bin

The **server owns the data** (see `server`); this module is the browser side. It keeps the editor
unchanged by hiding where texts live behind one `Store` interface, and makes writing never wait on the
network.

## Responsibilities

- **Store interface.** `listMeta / get / put / remove` — the single seam the rest of the app uses.
  - `ServerStore` talks to the server's texts API (scoped to the signed-in user by the session cookie).
    It is the transport and may reject on a network failure.
  - `CachedStore` wraps it and is the one the app runs on. Writes land in a local IndexedDB **outbox +
    read cache** and return at once; a background, single-flight loop pushes the outbox to the server
    and retries on reconnect (`online` event + backoff). Reads prefer a pending outbox version, then
    the server (refreshing the cache), then the cache when offline. A real server answer (e.g. 401) is
    never masked as offline. It exposes a sync status (saving / saved / offline), `flushToServer`, and
    `clear`.
- **Library.** Holds the in-memory list (title, dates, bin state) and debounces saves (400 ms) off the
  interaction path; `flush` forces them when the tab is hidden/closed or before leaving a text. Writing
  stays instant because `save` returns immediately and the store queues locally.
- **Logout / user switch.** On logout the outbox is flushed first; the cache + outbox are cleared only
  once everything reached the server, so a shared computer does not leak work. If the server is
  unreachable, the session is kept and the data stays cached until it syncs (never lost). A different
  user signing in on the same browser also starts with a cleared cache.
- **Bin.** Deleting moves a text to the bin (a `deletedAt` that round-trips through the server); it can
  be restored for **7 days** and is erased after that. Chosen over longer retention because child data
  should not linger.
- **Import validation.** `exchange` validates an untrusted document by rebuilding every field (strict
  schema, size/count limits, word and overlay ids checked; overlay items must be arrows or labels as
  defined in `overlay`). This is reused in two places: the **server** re-validates every stored
  document (`parseStoredDoc`, which also keeps bin state), and the **one-time local import** below.
- **One-time local import.** The old local-only IndexedDB (`IdbStore`) is now only read once: on first
  sign-in in a browser that still holds pre-migration texts, the app offers to import them into the
  account. Imported texts never overwrite: a clashing id gets a new one.

## Accepted limitations

- If the server is unreachable at logout, unsynced work stays in the local cache until it syncs.
- Undo history is not saved across sessions.
- The child-facing backup export/import was removed; whole-server backup is an admin/server concern
  (deferred, see `server`).
