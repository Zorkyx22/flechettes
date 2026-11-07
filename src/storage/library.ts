import { createDoc } from "../model/doc";
import type { Doc } from "../model/types";
import { metaOf, type Meta, type Store } from "./store";

export const BIN_DAYS = 7;
const DAY = 24 * 60 * 60 * 1000;

/**
 * The child's texts. The list lives in memory; each text is loaded when opened. Writes are
 * debounced and happen off the interaction path; `flush` forces them (tab hidden or closed).
 */
export class Library {
  private meta = new Map<string, Meta>();
  private pending = new Map<string, Doc>();
  private timer: ReturnType<typeof setTimeout> | null = null;
  private writing: Promise<void> = Promise.resolve();

  constructor(
    private readonly store: Store,
    private readonly now: () => number = Date.now,
    private readonly debounceMs = 400,
  ) {}

  async init(): Promise<void> {
    const all = await this.store.listMeta();
    const cutoff = this.now() - BIN_DAYS * DAY;
    for (const m of all) {
      if (m.deletedAt !== null && m.deletedAt <= cutoff) await this.store.remove(m.id);
      else this.meta.set(m.id, m);
    }
  }

  /** Texts, newest first. */
  list(): Meta[] {
    return [...this.meta.values()].filter((m) => m.deletedAt === null).sort((a, b) => b.updatedAt - a.updatedAt);
  }

  bin(): Meta[] {
    return [...this.meta.values()].filter((m) => m.deletedAt !== null).sort((a, b) => b.deletedAt! - a.deletedAt!);
  }

  async create(): Promise<Doc> {
    const doc = createDoc(this.now());
    this.meta.set(doc.id, metaOf(doc));
    await this.store.put(doc);
    return doc;
  }

  async open(id: string): Promise<Doc | undefined> {
    const queued = this.pending.get(id);
    return queued ?? (await this.store.get(id));
  }

  /** Called on every change; returns immediately. */
  save(doc: Doc): void {
    this.meta.set(doc.id, metaOf(doc));
    this.pending.set(doc.id, doc);
    if (this.timer === null) this.timer = setTimeout(() => void this.flush(), this.debounceMs);
  }

  flush(): Promise<void> {
    if (this.timer !== null) {
      clearTimeout(this.timer);
      this.timer = null;
    }
    const docs = [...this.pending.values()];
    this.pending.clear();
    this.writing = this.writing.then(async () => {
      for (const d of docs) await this.store.put(d);
    });
    return this.writing;
  }

  async trash(id: string): Promise<void> {
    await this.setDeleted(id, this.now());
  }

  async restore(id: string): Promise<void> {
    await this.setDeleted(id, null);
  }

  /** Give a text to a student (roster), or clear its owner with `null`. */
  async assign(id: string, studentId: string | null): Promise<void> {
    await this.flush();
    const doc = await this.store.get(id);
    if (!doc) return;
    const next: Doc = { ...doc, updatedAt: this.now() };
    if (studentId === null) delete next.studentId;
    else next.studentId = studentId;
    this.meta.set(id, metaOf(next));
    await this.store.put(next);
  }

  /** Erase a binned text for good. */
  async erase(id: string): Promise<void> {
    await this.flush();
    this.meta.delete(id);
    await this.store.remove(id);
  }

  async importDocs(docs: Doc[]): Promise<number> {
    for (const incoming of docs) {
      // Never overwrite: an id collision gets a fresh id.
      const doc = this.meta.has(incoming.id) ? { ...incoming, id: createDoc(0).id } : incoming;
      this.meta.set(doc.id, metaOf(doc));
      await this.store.put(doc);
    }
    return docs.length;
  }

  private async setDeleted(id: string, deletedAt: number | null): Promise<void> {
    await this.flush();
    const doc = await this.store.get(id);
    if (!doc) return;
    const next = { ...doc, deletedAt, updatedAt: deletedAt === null ? this.now() : doc.updatedAt };
    this.meta.set(id, metaOf(next));
    await this.store.put(next);
  }
}
