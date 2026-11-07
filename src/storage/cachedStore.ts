import type { Doc } from "../model/types";
import { ApiError } from "../net/api";
import { metaOf, type Meta, type Store } from "./store";

/** What the saving indicator shows. */
export type SyncStatus = "saved" | "saving" | "offline";

type Op = { id: string; op: "put"; doc: Doc } | { id: string; op: "remove" };

/**
 * A {@link Store} that keeps the server as the source of truth but never makes the child wait on the
 * network. Writes go to a local IndexedDB **outbox + read cache** and return at once; a background
 * loop pushes the outbox to the inner (server) store and retries when the connection returns.
 * On logout the cache and outbox are cleared so a shared computer doesn't leak work (see {@link clear}).
 */
export class CachedStore implements Store {
  private syncing = false;
  private rerun = false;
  private retry: ReturnType<typeof setTimeout> | null = null;

  constructor(
    private readonly server: Store,
    private readonly db: CacheDb,
    private readonly onStatus: (s: SyncStatus) => void = () => {},
  ) {
    addEventListener("online", () => void this.sync());
  }

  static async open(server: Store, onStatus?: (s: SyncStatus) => void): Promise<CachedStore> {
    return new CachedStore(server, await CacheDb.open(), onStatus);
  }

  async listMeta(): Promise<Meta[]> {
    let metas: Meta[];
    try {
      metas = await this.server.listMeta();
      await this.db.saveMetaSnapshot(metas);
    } catch (err) {
      if (err instanceof ApiError) throw err; // a real server answer (e.g. 401): don't mask it
      metas = await this.db.metaSnapshot();
    }
    return this.overlayOutbox(metas);
  }

  async get(id: string): Promise<Doc | undefined> {
    const pending = await this.db.getOp(id);
    if (pending) return pending.op === "remove" ? undefined : pending.doc;
    try {
      const doc = await this.server.get(id);
      if (doc) await this.db.putCache(doc);
      return doc;
    } catch (err) {
      if (err instanceof ApiError) throw err;
      return this.db.getCache(id); // offline: last known version
    }
  }

  async put(doc: Doc): Promise<void> {
    await this.db.putCache(doc);
    await this.db.putOp({ id: doc.id, op: "put", doc });
    void this.sync();
  }

  async remove(id: string): Promise<void> {
    await this.db.deleteCache(id);
    await this.db.putOp({ id, op: "remove" });
    void this.sync();
  }

  /** Force a sync and report whether everything reached the server. Used before clearing on logout. */
  async flushToServer(): Promise<boolean> {
    await this.sync();
    return (await this.db.outboxCount()) === 0;
  }

  async hasPending(): Promise<boolean> {
    return (await this.db.outboxCount()) > 0;
  }

  /** Wipe the local cache and outbox (post-logout privacy on shared machines). */
  async clear(): Promise<void> {
    if (this.retry) clearTimeout(this.retry);
    await this.db.clear();
  }

  private async overlayOutbox(metas: Meta[]): Promise<Meta[]> {
    const ops = await this.db.allOps();
    if (ops.length === 0) return metas;
    const byId = new Map(metas.map((m) => [m.id, m]));
    for (const op of ops) {
      if (op.op === "remove") byId.delete(op.id);
      else byId.set(op.id, metaOf(op.doc));
    }
    return [...byId.values()];
  }

  /** Drain the outbox to the server; stop and schedule a retry on a network failure. */
  private async sync(): Promise<void> {
    if (this.syncing) {
      this.rerun = true;
      return;
    }
    this.syncing = true;
    try {
      do {
        this.rerun = false;
        const ops = await this.db.allOps();
        if (ops.length === 0) {
          this.onStatus("saved");
          break;
        }
        this.onStatus("saving");
        for (const op of ops) {
          try {
            if (op.op === "put") await this.server.put(op.doc);
            else await this.server.remove(op.id);
            await this.db.deleteOp(op.id);
          } catch (err) {
            if (err instanceof ApiError) {
              // Server reached but rejected (should not happen for client-made docs): drop so we
              // don't retry forever. Anything else (network down): keep it and retry later.
              await this.db.deleteOp(op.id);
              continue;
            }
            this.onStatus("offline");
            this.scheduleRetry();
            return;
          }
        }
      } while (this.rerun);
      if ((await this.db.outboxCount()) === 0) this.onStatus("saved");
    } finally {
      this.syncing = false;
    }
  }

  private scheduleRetry(): void {
    if (this.retry) clearTimeout(this.retry);
    this.retry = setTimeout(() => void this.sync(), 5000);
  }
}

// --- IndexedDB cache/outbox ---

const DB_NAME = "flechettes-cache";
const META_KEY = "all";

function wrap<T>(req: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

function done(tx: IDBTransaction): Promise<void> {
  return new Promise((resolve, reject) => {
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
    tx.onabort = () => reject(tx.error);
  });
}

export class CacheDb {
  private constructor(private readonly db: IDBDatabase) {}

  static open(factory: IDBFactory = indexedDB): Promise<CacheDb> {
    return new Promise((resolve, reject) => {
      const req = factory.open(DB_NAME, 1);
      req.onupgradeneeded = () => {
        req.result.createObjectStore("cache", { keyPath: "id" });
        req.result.createObjectStore("outbox", { keyPath: "id" });
        req.result.createObjectStore("meta"); // single snapshot under META_KEY
      };
      req.onsuccess = () => resolve(new CacheDb(req.result));
      req.onerror = () => reject(req.error);
    });
  }

  getCache(id: string): Promise<Doc | undefined> {
    return wrap(this.db.transaction("cache").objectStore("cache").get(id) as IDBRequest<Doc | undefined>);
  }
  putCache(doc: Doc): Promise<void> {
    const tx = this.db.transaction("cache", "readwrite");
    tx.objectStore("cache").put(doc);
    return done(tx);
  }
  deleteCache(id: string): Promise<void> {
    const tx = this.db.transaction("cache", "readwrite");
    tx.objectStore("cache").delete(id);
    return done(tx);
  }

  getOp(id: string): Promise<Op | undefined> {
    return wrap(this.db.transaction("outbox").objectStore("outbox").get(id) as IDBRequest<Op | undefined>);
  }
  allOps(): Promise<Op[]> {
    return wrap(this.db.transaction("outbox").objectStore("outbox").getAll() as IDBRequest<Op[]>);
  }
  putOp(op: Op): Promise<void> {
    const tx = this.db.transaction("outbox", "readwrite");
    tx.objectStore("outbox").put(op);
    return done(tx);
  }
  deleteOp(id: string): Promise<void> {
    const tx = this.db.transaction("outbox", "readwrite");
    tx.objectStore("outbox").delete(id);
    return done(tx);
  }
  async outboxCount(): Promise<number> {
    return wrap(this.db.transaction("outbox").objectStore("outbox").count());
  }

  saveMetaSnapshot(metas: Meta[]): Promise<void> {
    const tx = this.db.transaction("meta", "readwrite");
    tx.objectStore("meta").put(metas, META_KEY);
    return done(tx);
  }
  async metaSnapshot(): Promise<Meta[]> {
    return (await wrap(this.db.transaction("meta").objectStore("meta").get(META_KEY) as IDBRequest<Meta[] | undefined>)) ?? [];
  }

  clear(): Promise<void> {
    const tx = this.db.transaction(["cache", "outbox", "meta"], "readwrite");
    tx.objectStore("cache").clear();
    tx.objectStore("outbox").clear();
    tx.objectStore("meta").clear();
    return done(tx);
  }
}
