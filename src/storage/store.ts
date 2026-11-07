import { migrateV1 } from "../model/doc";
import type { Doc } from "../model/types";

/** What the list screen needs; small, loaded without opening any text. */
export type Meta = { id: string; title: string; createdAt: number; updatedAt: number; deletedAt: number | null };

export interface Store {
  listMeta(): Promise<Meta[]>;
  get(id: string): Promise<Doc | undefined>;
  /** Write the text and its list entry atomically. */
  put(doc: Doc): Promise<void>;
  remove(id: string): Promise<void>;
}

export function metaOf(doc: Doc): Meta {
  return { id: doc.id, title: doc.title, createdAt: doc.createdAt, updatedAt: doc.updatedAt, deletedAt: doc.deletedAt };
}

const DB_NAME = "flechettes";
const DB_VERSION = 2;

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

export class IdbStore implements Store {
  private constructor(private readonly db: IDBDatabase) {}

  static open(factory: IDBFactory = indexedDB): Promise<IdbStore> {
    return new Promise((resolve, reject) => {
      const req = factory.open(DB_NAME, DB_VERSION);
      req.onupgradeneeded = (ev) => {
        // Migrations happen here, never by dropping stores.
        const tx = req.transaction!;
        if (ev.oldVersion < 1) {
          req.result.createObjectStore("docs", { keyPath: "id" });
          req.result.createObjectStore("meta", { keyPath: "id" });
        } else if (ev.oldVersion < 2) {
          // Version 2: the title becomes the first line of the text; texts carry their own type size.
          const docs = tx.objectStore("docs");
          const meta = tx.objectStore("meta");
          const cursor = docs.openCursor();
          cursor.onsuccess = () => {
            const c = cursor.result;
            if (!c) return;
            const doc = migrateV1(c.value as Doc);
            c.update(doc);
            meta.put(metaOf(doc));
            c.continue();
          };
        }
      };
      req.onsuccess = () => resolve(new IdbStore(req.result));
      req.onerror = () => reject(req.error);
    });
  }

  listMeta(): Promise<Meta[]> {
    return wrap(this.db.transaction("meta").objectStore("meta").getAll() as IDBRequest<Meta[]>);
  }

  get(id: string): Promise<Doc | undefined> {
    return wrap(this.db.transaction("docs").objectStore("docs").get(id) as IDBRequest<Doc | undefined>);
  }

  put(doc: Doc): Promise<void> {
    const tx = this.db.transaction(["docs", "meta"], "readwrite");
    tx.objectStore("docs").put(doc);
    tx.objectStore("meta").put(metaOf(doc));
    return done(tx);
  }

  remove(id: string): Promise<void> {
    const tx = this.db.transaction(["docs", "meta"], "readwrite");
    tx.objectStore("docs").delete(id);
    tx.objectStore("meta").delete(id);
    return done(tx);
  }
}

export class MemoryStore implements Store {
  private docs = new Map<string, Doc>();
  async listMeta() {
    return [...this.docs.values()].map(metaOf);
  }
  async get(id: string) {
    return this.docs.get(id);
  }
  async put(doc: Doc) {
    this.docs.set(doc.id, structuredClone(doc));
  }
  async remove(id: string) {
    this.docs.delete(id);
  }
}
