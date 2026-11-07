import "fake-indexeddb/auto";
import { describe, expect, it } from "vitest";
import { contentFromText, withContent } from "../src/model/doc";
import { exportDocs, ImportError, parseExport } from "../src/storage/exchange";
import { BIN_DAYS, Library } from "../src/storage/library";
import { IdbStore, MemoryStore } from "../src/storage/store";

const DAY = 86_400_000;

describe("Library", () => {
  it("lists newest first, trashes, restores and purges after the bin period", async () => {
    let t = 1_000_000;
    const store = new MemoryStore();
    const lib = new Library(store, () => t);
    await lib.init();
    const a = await lib.create();
    t += 10;
    const b = await lib.create();
    expect(lib.list().map((m) => m.id)).toEqual([b.id, a.id]);

    await lib.trash(a.id);
    expect(lib.list().map((m) => m.id)).toEqual([b.id]);
    expect(lib.bin().map((m) => m.id)).toEqual([a.id]);
    await lib.restore(a.id);
    expect(lib.bin()).toEqual([]);

    await lib.trash(a.id);
    t += BIN_DAYS * DAY + 1;
    const fresh = new Library(store, () => t);
    await fresh.init();
    expect(await store.get(a.id)).toBeUndefined();
    expect(fresh.list().map((m) => m.id)).toEqual([b.id]);
  });

  it("debounces saves and flush persists the latest version", async () => {
    const store = new MemoryStore();
    const lib = new Library(store, Date.now, 10_000);
    const doc = await lib.create();
    lib.save(withContent(doc, contentFromText("bonjour"), 5));
    expect((await store.get(doc.id))!.tokens).toEqual([]);
    expect((await lib.open(doc.id))!.tokens).toHaveLength(1);
    await lib.flush();
    expect((await store.get(doc.id))!.tokens).toHaveLength(1);
  });

  it("round-trips through IndexedDB", async () => {
    const store = await IdbStore.open();
    const lib = new Library(store);
    await lib.init();
    const doc = await lib.create();
    lib.save(withContent(doc, contentFromText("les fleurs"), 5));
    await lib.flush();
    const again = new Library(await IdbStore.open());
    await again.init();
    expect(again.list().map((m) => m.id)).toContain(doc.id);
    expect((await again.open(doc.id))!.tokens.length).toBe(3);
  });
});

describe("export/import", () => {
const WORDS = [{ kind: "word", id: "w1", text: "a" }, { kind: "word", id: "w2", text: "b" }];
const file = (overlay: unknown[]) => JSON.stringify({ format: "flechettes-export", version: 1, texts: [{ id: "a", title: "", createdAt: 1, updatedAt: 1, tokens: WORDS, overlay }] });

  it("round-trips and gives colliding ids a new id instead of overwriting", async () => {
    const lib = new Library(new MemoryStore());
    const doc = withContent(await lib.create(), contentFromText("un chat"), 5);
    const docs = parseExport(exportDocs([doc]));
    expect(docs[0]!.tokens).toEqual(doc.tokens);
    await lib.save(doc);
    await lib.flush();
    await lib.importDocs(docs);
    expect(lib.list()).toHaveLength(2);
  });

  it("round-trips arrows", async () => {
    const lib = new Library(new MemoryStore());
    const base = withContent(await lib.create(), contentFromText("un chat"), 5);
    const [w1, w2] = base.tokens.filter((t) => t.kind === "word").map((t) => (t as { id: string }).id) as [string, string];
    const doc = { ...base, overlay: [{ id: "o1", kind: "arrow", anchors: [w1, w2], data: { side: "below", color: "green" } }] };
    expect(parseExport(exportDocs([doc]))[0]!.overlay).toEqual(doc.overlay);
  });

  it("round-trips labels", () => {
    const overlay = [{ id: "l1", kind: "label", anchors: ["w1"], data: { cls: "nom", gender: "f", number: "p" } }];
    expect(parseExport(file(overlay))[0]!.overlay).toEqual(overlay);
  });

  it.each([
    ["not json", "{"],
    ["wrong format", JSON.stringify({ format: "x", version: 1, texts: [] })],
    ["bad id", JSON.stringify({ format: "flechettes-export", version: 1, texts: [{ id: "../x", title: "", createdAt: 1, updatedAt: 1, tokens: [], overlay: [] }] })],
    ["bad token", JSON.stringify({ format: "flechettes-export", version: 1, texts: [{ id: "a", title: "", createdAt: 1, updatedAt: 1, tokens: [{ kind: "html", text: "<img>" }], overlay: [] }] })],
    ["dangling anchor", JSON.stringify({ format: "flechettes-export", version: 1, texts: [{ id: "a", title: "", createdAt: 1, updatedAt: 1, tokens: [], overlay: [{ id: "o", kind: "arrow", anchors: ["zz", "yy"], data: { side: "above", color: "blue" } }] }] })],
    ["unknown overlay kind", JSON.stringify({ format: "flechettes-export", version: 1, texts: [{ id: "a", title: "", createdAt: 1, updatedAt: 1, tokens: [{ kind: "word", id: "w1", text: "a" }, { kind: "word", id: "w2", text: "b" }], overlay: [{ id: "o", kind: "script", anchors: ["w1", "w2"], data: { side: "above", color: "blue" } }] }] })],
    ["arrow to itself", JSON.stringify({ format: "flechettes-export", version: 1, texts: [{ id: "a", title: "", createdAt: 1, updatedAt: 1, tokens: [{ kind: "word", id: "w1", text: "a" }], overlay: [{ id: "o", kind: "arrow", anchors: ["w1", "w1"], data: { side: "above", color: "blue" } }] }] })],
    ["label with two anchors", file([{ id: "l", kind: "label", anchors: ["w1", "w2"], data: { cls: "nom" } }])],
    ["label with unknown class", file([{ id: "l", kind: "label", anchors: ["w1"], data: { cls: "<script>" } }])],
    ["empty label", file([{ id: "l", kind: "label", anchors: ["w1"], data: {} }])],
    ["two labels on one word", file([{ id: "l1", kind: "label", anchors: ["w1"], data: { cls: "nom" } }, { id: "l2", kind: "label", anchors: ["w1"], data: { gender: "f" } }])],
    ["arrow with css color", JSON.stringify({ format: "flechettes-export", version: 1, texts: [{ id: "a", title: "", createdAt: 1, updatedAt: 1, tokens: [{ kind: "word", id: "w1", text: "a" }, { kind: "word", id: "w2", text: "b" }], overlay: [{ id: "o", kind: "arrow", anchors: ["w1", "w2"], data: { side: "above", color: "red;background:url(x)" } }] }] })],
  ])("rejects %s", (_n, raw) => {
    expect(() => parseExport(raw)).toThrow(ImportError);
  });
});
