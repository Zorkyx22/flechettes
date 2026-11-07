import "fake-indexeddb/auto";
import { describe, expect, it } from "vitest";
import { correctWord } from "../src/model/correct";
import { contentFromText, migrateV1, titleOf, withContent } from "../src/model/doc";
import { createDoc } from "../src/model/doc";
import type { Content, Doc, WordToken } from "../src/model/types";
import { plainText } from "../src/model/words";
import { exportDocs, ImportError, parseExport } from "../src/storage/exchange";
import { IdbStore } from "../src/storage/store";

const words = (c: Content) => c.tokens.filter((t): t is WordToken => t.kind === "word");

describe("titleOf", () => {
  it("is the first line, as it currently reads", () => {
    expect(titleOf(contentFromText("Mon jardin\nles fleurs").tokens)).toBe("Mon jardin");
    expect(titleOf(contentFromText("Mon jardin").tokens)).toBe("Mon jardin");
    expect(titleOf(contentFromText("\nles fleurs").tokens)).toBe("");
    expect(titleOf([])).toBe("");
    const c = contentFromText("Mon jardins\nles fleurs");
    expect(titleOf(correctWord(c, words(c)[1]!.id, "jardin", 1).tokens)).toBe("Mon jardin");
  });
  it("is kept up to date when content changes", () => {
    const d = withContent(createDoc(1), contentFromText("Titre\nabc"), 2);
    expect(d.title).toBe("Titre");
  });
});

describe("migrateV1", () => {
  const v1 = (title: string, text: string): Omit<Doc, "textSize"> => ({
    id: "a", title, createdAt: 1, updatedAt: 1, deletedAt: null, ...contentFromText(text),
  });
  it("writes the stored title in front of the words and keeps old word ids", () => {
    const old = v1("Mon jardin", "les fleurs");
    const m = migrateV1(old);
    expect(plainText(m.tokens)).toBe("Mon jardin\nles fleurs");
    expect(m.title).toBe("Mon jardin");
    expect(m.textSize).toBe("m");
    expect(words(m).slice(-2).map((w) => w.id)).toEqual(words(old).map((w) => w.id));
  });
  it("merges with a leading newline and ignores an empty title", () => {
    expect(plainText(migrateV1(v1("T", "\nabc")).tokens)).toBe("T\n\nabc");
    const empty = v1("  ", "abc");
    expect(migrateV1(empty).tokens).toEqual(empty.tokens);
  });
  it("keeps overlay anchors valid", () => {
    const old = v1("T", "les fleurs");
    const [a, b] = words(old);
    const m = migrateV1({ ...old, overlay: [{ id: "o", kind: "arrow", anchors: [a!.id, b!.id], data: { side: "above", color: "blue" } }] });
    expect(parseExport(exportDocs([m]))[0]!.overlay).toHaveLength(1);
  });
});

describe("import versions", () => {
  const v1file = (title: string) => JSON.stringify({ format: "flechettes-export", version: 1, texts: [{ id: "a", title, createdAt: 1, updatedAt: 1, tokens: [{ kind: "word", id: "w1", text: "chat" }], overlay: [] }] });
  it("migrates a version 1 file", () => {
    const [d] = parseExport(v1file("Mon chat"));
    expect(plainText(d!.tokens)).toBe("Mon chat\nchat");
    expect(d!.title).toBe("Mon chat");
  });
  it("derives the title and requires a valid size in version 2", () => {
    const doc = withContent(createDoc(1), contentFromText("Titre\ntexte"), 2);
    const round = parseExport(exportDocs([{ ...doc, textSize: "l" }]))[0]!;
    expect(round.title).toBe("Titre");
    expect(round.textSize).toBe("l");
    const bad = JSON.parse(exportDocs([doc]));
    bad.texts[0].textSize = "huge";
    expect(() => parseExport(JSON.stringify(bad))).toThrow(ImportError);
    // a lying title field is ignored
    const lie = JSON.parse(exportDocs([doc]));
    lie.texts[0].title = "FAUX";
    expect(parseExport(JSON.stringify(lie))[0]!.title).toBe("Titre");
  });
});

describe("IndexedDB upgrade 1 → 2", () => {
  it("migrates stored texts and their list entries", async () => {
    await new Promise<void>((resolve, reject) => {
      const req = indexedDB.open("flechettes", 1);
      req.onupgradeneeded = () => {
        req.result.createObjectStore("docs", { keyPath: "id" });
        req.result.createObjectStore("meta", { keyPath: "id" });
      };
      req.onsuccess = () => {
        const db = req.result;
        const tx = db.transaction(["docs", "meta"], "readwrite");
        const doc = { id: "old1", title: "Vieux titre", createdAt: 1, updatedAt: 2, deletedAt: null, ...contentFromText("un chat") };
        tx.objectStore("docs").put(doc);
        tx.objectStore("meta").put({ id: "old1", title: "Vieux titre", createdAt: 1, updatedAt: 2, deletedAt: null });
        tx.oncomplete = () => {
          db.close();
          resolve();
        };
        tx.onerror = () => reject(tx.error);
      };
    });
    const store = await IdbStore.open();
    const migrated = (await store.get("old1"))!;
    expect(plainText(migrated.tokens)).toBe("Vieux titre\nun chat");
    expect(migrated.textSize).toBe("m");
    expect((await store.listMeta()).find((m) => m.id === "old1")!.title).toBe("Vieux titre");
  });
});

import { splitTitle } from "../src/model/doc";

describe("splitTitle", () => {
  const split = (text: string) => {
    const { title, body } = splitTitle(contentFromText(text).tokens);
    return [plainText(title), plainText(body)];
  };
  it("cuts at the first newline, which belongs to neither part", () => {
    expect(split("Mon jardin\nles fleurs")).toEqual(["Mon jardin", "les fleurs"]);
    expect(split("Titre\n\nsuite")).toEqual(["Titre", "\nsuite"]);
    expect(split("Titre  \nsuite")).toEqual(["Titre  ", "suite"]);
    expect(split("\nsuite")).toEqual(["", "suite"]);
    expect(split("Titre\n")).toEqual(["Titre", ""]);
  });
  it("puts everything in the title when there is no newline, and keeps word ids", () => {
    expect(split("Seulement un titre")).toEqual(["Seulement un titre", ""]);
    expect(splitTitle([])).toEqual({ title: [], body: [] });
    const c = contentFromText("A b\nc d");
    const ids = c.tokens.filter((t) => t.kind === "word").map((t) => (t as { id: string }).id);
    const { title, body } = splitTitle(c.tokens);
    expect([...title, ...body].filter((t) => t.kind === "word").map((t) => (t as { id: string }).id)).toEqual(ids);
  });
});
