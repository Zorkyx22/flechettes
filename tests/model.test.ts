import { describe, expect, it } from "vitest";
import { correctWord } from "../src/model/correct";
import { contentFromText } from "../src/model/doc";
import { History } from "../src/model/history";
import { reconcile } from "../src/model/reconcile";
import type { Content, WordToken } from "../src/model/types";
import { plainText, tokenize } from "../src/model/words";

const words = (c: Content) => c.tokens.filter((t): t is WordToken => t.kind === "word");
const idOf = (c: Content, text: string) => words(c).find((w) => w.text === text)!.id;

describe("tokenize", () => {
  it("splits French text into words and separators, keeping elision and hyphens", () => {
    const t = tokenize("L'arbre, peut-être très grand !");
    expect(t.filter((x) => x.kind === "word").map((x) => x.text)).toEqual(["L'", "arbre", "peut-être", "très", "grand"]);
    expect(t.map((x) => x.text).join("")).toBe("L'arbre, peut-être très grand !");
  });
});

describe("reconcile", () => {
  it("keeps ids of untouched words when text is inserted elsewhere", () => {
    const c = contentFromText("les petite fleur");
    const next = reconcile(c, [{ kind: "text", text: "les très petite fleur" }]);
    expect(idOf(next, "les")).toBe(idOf(c, "les"));
    expect(idOf(next, "petite")).toBe(idOf(c, "petite"));
    expect(idOf(next, "fleur")).toBe(idOf(c, "fleur"));
  });

  it("drops overlay items anchored to a changed word, and only those", () => {
    let c = contentFromText("les petite fleur");
    c = {
      ...c,
      overlay: [
        { id: "a1", kind: "arrow", anchors: [idOf(c, "petite"), idOf(c, "fleur")] },
        { id: "a2", kind: "arrow", anchors: [idOf(c, "les"), idOf(c, "fleur")] },
      ],
    };
    const next = reconcile(c, [{ kind: "text", text: "les petites fleur" }]);
    expect(next.overlay.map((o) => o.id)).toEqual(["a2"]);
    expect(plainText(next.tokens)).toBe("les petites fleur");
  });

  it("drops overlay items when an anchored word is deleted", () => {
    let c = contentFromText("un chat dort");
    c = { ...c, overlay: [{ id: "x", kind: "label", anchors: [idOf(c, "chat")] }] };
    const next = reconcile(c, [{ kind: "text", text: "un dort" }]);
    expect(next.overlay).toEqual([]);
  });

  it("merges separators and handles empty input", () => {
    const c = contentFromText("a b");
    expect(reconcile(c, [{ kind: "text", text: "" }]).tokens).toEqual([]);
  });

  it("treats corrected words as atoms matched by id, deletable as a unit", () => {
    let c = contentFromText("les fleur rouge");
    const id = idOf(c, "fleur");
    c = correctWord(c, id, "fleurs", 1);
    const kept = reconcile(c, [
      { kind: "text", text: "les " },
      { kind: "atom", id },
      { kind: "text", text: " rouge" },
    ]);
    expect(kept.tokens).toEqual(c.tokens);
    const removed = reconcile(c, [{ kind: "text", text: "les  rouge" }]);
    expect(plainText(removed.tokens)).toBe("les  rouge");
    expect(words(removed).some((w) => w.original !== undefined)).toBe(false);
  });

  it("stays fast on a long text", () => {
    const text = Array.from({ length: 4000 }, (_, i) => `mot${i}`).join(" ");
    const c = contentFromText(text);
    const t0 = performance.now();
    reconcile(c, [{ kind: "text", text: text.replace("mot2000", "mot2000s") }]);
    expect(performance.now() - t0).toBeLessThan(50);
  });
});

describe("correctWord", () => {
  it("keeps the id, the first original and every revision", () => {
    let c = contentFromText("les fleur");
    const id = idOf(c, "fleur");
    c = { ...c, overlay: [{ id: "a", kind: "arrow", anchors: [id] }] };
    const one = correctWord(c, id, "fleures", 10);
    const two = correctWord(one, id, "fleurs", 20);
    const w = words(two).find((x) => x.id === id)!;
    expect(w.text).toBe("fleurs");
    expect(w.original).toBe("fleur");
    expect(w.revisions).toEqual([
      { text: "fleures", at: 10 },
      { text: "fleurs", at: 20 },
    ]);
    expect(two.overlay).toHaveLength(1);
  });

  it("ignores empty or identical replacements and strips whitespace", () => {
    const c = contentFromText("chat");
    const id = idOf(c, "chat");
    expect(correctWord(c, id, "  ", 1)).toBe(c);
    expect(correctWord(c, id, "chat", 1)).toBe(c);
    expect(words(correctWord(c, id, "ch at", 1))[0]!.text).toBe("chat");
  });
});

describe("History", () => {
  it("undoes and redoes, coalescing typing bursts", () => {
    const a = contentFromText("a");
    const b = contentFromText("ab");
    const c = contentFromText("abc");
    const h = new History(a);
    h.commit(b, 0, true);
    h.commit(c, 100, true);
    expect(h.undo()).toBe(a);
    expect(h.canUndo).toBe(false);
    expect(h.redo()).toBe(c);
  });

  it("does not coalesce non-typing changes and clears redo on new change", () => {
    const a = contentFromText("a");
    const b = contentFromText("b");
    const c = contentFromText("c");
    const h = new History(a);
    h.commit(b, 0, false);
    h.commit(c, 10, false);
    expect(h.undo()).toBe(b);
    h.commit(contentFromText("d"), 20, false);
    expect(h.canRedo).toBe(false);
  });
});
