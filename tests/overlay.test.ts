import { describe, expect, it } from "vitest";
import { contentFromText } from "../src/model/doc";
import type { Content, WordToken } from "../src/model/types";
import { layoutArrows, type Box } from "../src/overlay/geometry";
import { addArrow, removeOverlay } from "../src/overlay/ops";
import { arrowsOf, parseArrowData } from "../src/overlay/types";
import { reconcile } from "../src/model/reconcile";

const id = (c: Content, text: string) => (c.tokens.find((t): t is WordToken => t.kind === "word" && t.text === text))!.id;
const box = (left: number, line: number, width = 40): Box => ({ left, right: left + width, top: line * 60 + 20, bottom: line * 60 + 50 });
const frame = { pitch: 60, left: 10, right: 500 };

describe("addArrow / removeOverlay", () => {
  const c = contentFromText("les petites fleurs");
  it("adds an arrow between two words, in order", () => {
    const next = addArrow(c, "a", id(c, "petites"), id(c, "fleurs"), "below", "blue");
    expect(arrowsOf(next.overlay)).toEqual([{ id: "a", from: id(c, "petites"), to: id(c, "fleurs"), side: "below", color: "blue" }]);
  });
  it("ignores same word, unknown word and exact duplicates", () => {
    const one = addArrow(c, "a", id(c, "les"), id(c, "fleurs"), "above", "red");
    expect(addArrow(one, "b", id(c, "les"), id(c, "les"), "above", "red")).toBe(one);
    expect(addArrow(one, "b", "nope", id(c, "les"), "above", "red")).toBe(one);
    expect(addArrow(one, "b", id(c, "les"), id(c, "fleurs"), "above", "green")).toBe(one);
    expect(addArrow(one, "b", id(c, "les"), id(c, "fleurs"), "below", "red")).not.toBe(one);
  });
  it("removes by id and survives unrelated edits", () => {
    const one = addArrow(c, "a", id(c, "les"), id(c, "fleurs"), "above", "red");
    expect(removeOverlay(one, "a").overlay).toEqual([]);
    expect(removeOverlay(one, "zzz")).toBe(one);
    const edited = reconcile(one, [{ kind: "text", text: "les petites fleurs rouges" }]);
    expect(edited.overlay).toHaveLength(1);
    const changed = reconcile(one, [{ kind: "text", text: "les petites fleur" }]);
    expect(changed.overlay).toHaveLength(0);
  });
});

describe("parseArrowData", () => {
  it("accepts only side + color from the palette", () => {
    expect(parseArrowData({ side: "above", color: "blue" })).toEqual({ side: "above", color: "blue" });
    for (const bad of [null, [], {}, { side: "left", color: "blue" }, { side: "above", color: "#f00" }, { side: "above", color: "blue", x: 1 }])
      expect(parseArrowData(bad)).toBeNull();
  });
});

describe("layoutArrows", () => {
  it("stacks overlapping same-side arrows at different heights, and keeps disjoint ones level", () => {
    const [nested, outer, apart] = ["n", "o", "p"] as const;
    const segs = layoutArrows(
      [
        { id: nested, from: box(100, 0), to: box(200, 0), side: "below", color: "blue" },
        { id: outer, from: box(50, 0), to: box(300, 0), side: "below", color: "red" },
        { id: apart, from: box(350, 0), to: box(450, 0), side: "below", color: "green" },
      ],
      frame,
    );
    const bottom = (arrowId: string) => Number(segs.find((s) => s.arrowId === arrowId)!.mid.y);
    expect(bottom("o")).toBeGreaterThan(bottom("n"));
    expect(bottom("p")).toBeCloseTo(bottom("n"), 5);
    expect(segs.every((s) => s.end === "head")).toBe(true);
  });
  it("puts above arrows above the words and below arrows below", () => {
    const [up, down] = layoutArrows(
      [
        { id: "u", from: box(10, 1), to: box(150, 1), side: "above", color: "blue" },
        { id: "d", from: box(10, 1), to: box(150, 1), side: "below", color: "blue" },
      ],
      frame,
    );
    expect(up!.mid.y).toBeLessThan(80);
    expect(down!.mid.y).toBeGreaterThan(110);
  });
  it("splits an arrow between lines into an exit stub and an entry stub through the margins", () => {
    const segs = layoutArrows([{ id: "w", from: box(400, 0), to: box(30, 1), side: "below", color: "orange" }], frame);
    expect(segs).toHaveLength(2);
    expect(segs[0]).toMatchObject({ end: "dot", startDot: false });
    expect(segs[0]!.d).toContain("500");
    expect(segs[1]).toMatchObject({ end: "head", startDot: true });
    expect(segs[1]!.d).toContain("M 10");
  });
  it("reverses the margins when the target is on an earlier line", () => {
    const segs = layoutArrows([{ id: "w", from: box(30, 1), to: box(400, 0), side: "above", color: "blue" }], frame);
    expect(segs[0]!.d).toContain("10 ");
    expect(segs[1]!.d.startsWith("M 500")).toBe(true);
  });
  it("lays out 100 arrows quickly", () => {
    const inputs = Array.from({ length: 100 }, (_, i) => ({ id: `a${i}`, from: box(10 + i, i % 10), to: box(300 + i, i % 10), side: (i % 2 ? "above" : "below") as "above" | "below", color: "blue" as const }));
    const t0 = performance.now();
    layoutArrows(inputs, frame);
    expect(performance.now() - t0).toBeLessThan(20);
  });
});

import { fitTags, MIN_TAG_SCALE } from "../src/overlay/geometry";
import { setLabel } from "../src/overlay/ops";
import { labelsOf, parseLabelData } from "../src/overlay/types";

describe("setLabel", () => {
  const c = contentFromText("les petites fleurs");
  const w = id(c, "petites");
  it("creates, merges, toggles off and removes when empty", () => {
    const a = setLabel(c, "L1", w, { cls: "adjectif" });
    expect(labelsOf(a.overlay).get(w)).toMatchObject({ id: "L1", cls: "adjectif" });
    const b = setLabel(a, "L2", w, { gender: "f", number: "p" });
    expect(b.overlay).toHaveLength(1);
    expect(labelsOf(b.overlay).get(w)).toEqual({ id: "L1", word: w, cls: "adjectif", gender: "f", number: "p" });
    const d = setLabel(b, "L3", w, { cls: null });
    expect(labelsOf(d.overlay).get(w)).toEqual({ id: "L1", word: w, gender: "f", number: "p" });
    const e = setLabel(setLabel(d, "x", w, { gender: null }), "x", w, { number: null });
    expect(e.overlay).toEqual([]);
  });
  it("returns the same content when nothing changes or the word is unknown", () => {
    const a = setLabel(c, "L1", w, { cls: "nom" });
    expect(setLabel(a, "L2", w, { cls: "nom" })).toBe(a);
    expect(setLabel(c, "L1", w, { cls: null })).toBe(c);
    expect(setLabel(c, "L1", "nope", { cls: "nom" })).toBe(c);
  });
  it("is dropped when its word changes, and coexists with arrows", () => {
    const a = addArrow(setLabel(c, "L1", w, { cls: "adjectif" }), "A1", id(c, "les"), id(c, "fleurs"), "above", "blue");
    const edited = reconcile(a, [{ kind: "text", text: "les petite fleurs" }]);
    expect(edited.overlay.map((o) => o.id)).toEqual(["A1"]);
    const keep = reconcile(a, [{ kind: "text", text: "les petites fleurs rouges" }]);
    expect(keep.overlay.map((o) => o.id).sort()).toEqual(["A1", "L1"]);
  });
});

describe("parseLabelData", () => {
  it("accepts 1–3 known fields only", () => {
    expect(parseLabelData({ cls: "nom_propre", gender: "m", number: "s" })).toEqual({ cls: "nom_propre", gender: "m", number: "s" });
    expect(parseLabelData({ gender: "f" })).toEqual({ gender: "f" });
    for (const bad of [null, [], {}, { cls: "verb" }, { gender: "x" }, { number: 1 }, { cls: "nom", extra: 1 }, { cls: "nom;x" }])
      expect(parseLabelData(bad)).toBeNull();
  });
});

describe("fitTags", () => {
  it("keeps a lone tag centred at full size", () => {
    expect(fitTags([{ id: "a", line: 0, center: 100, width: 40 }]).get("a")).toEqual({ center: 100, scale: 1 });
  });
  it("never moves a tag; it shrinks when a neighbour is close, so two tags always fit", () => {
    const m = fitTags([
      { id: "a", line: 0, center: 100, width: 60 },
      { id: "b", line: 0, center: 155, width: 60 },
      { id: "c", line: 0, center: 400, width: 60 },
    ]);
    expect(m.get("a")!.center).toBe(100);
    expect(m.get("b")!.center).toBe(155);
    expect(m.get("c")).toEqual({ center: 400, scale: 1 });
    const a = m.get("a")!;
    const b = m.get("b")!;
    expect(a.scale).toBeLessThan(1);
    expect((60 * a.scale + 60 * b.scale) / 2 + 4).toBeLessThanOrEqual(55 + 1e-9);
  });
  it("does not go below the minimum scale and keeps lines independent", () => {
    const m = fitTags([
      { id: "a", line: 0, center: 100, width: 60 },
      { id: "b", line: 0, center: 105, width: 60 },
      { id: "z", line: 1, center: 101, width: 60 },
    ]);
    expect(m.get("a")!.scale).toBe(MIN_TAG_SCALE);
    expect(m.get("z")!.scale).toBe(1);
  });
});

describe("pages", () => {
  const paged = { pitch: 60, left: 10, right: 500, period: 600 };
  it("exits through the source page's right margin and enters through the target page's left margin", () => {
    const from: Box = { ...box(400, 0), page: 0, line: 0 };
    const to: Box = { ...box(630, 0), page: 1, line: 1000 };
    const segs = layoutArrows([{ id: "p", from, to, side: "below", color: "blue" }], paged);
    expect(segs).toHaveLength(2);
    expect(segs[0]!.d).toContain("500"); // right margin of page 0
    expect(segs[1]!.d.startsWith("M 610")).toBe(true); // left margin of page 1 = 10 + 600
    expect(segs[1]).toMatchObject({ end: "head", startDot: true });
  });
  it("goes the other way for a target on an earlier page", () => {
    const from: Box = { ...box(630, 0), page: 1, line: 1000 };
    const to: Box = { ...box(100, 0), page: 0, line: 0 };
    const segs = layoutArrows([{ id: "p", from, to, side: "above", color: "red" }], paged);
    expect(segs[0]!.d).toContain("610 "); // leaves through the left margin of its own page
    expect(segs[1]!.d.startsWith("M 500")).toBe(true); // enters through the right margin of the target page
  });
  it("keeps same-page arrows as one arc even when rows repeat on another page", () => {
    const a: Box = { ...box(50, 0), page: 0, line: 0 };
    const b: Box = { ...box(150, 0), page: 0, line: 0 };
    expect(layoutArrows([{ id: "s", from: a, to: b, side: "below", color: "blue" }], paged)).toHaveLength(1);
  });
  it("treats the same row on two pages as different lines when fitting tags", () => {
    const m = fitTags([
      { id: "a", line: 0, center: 100, width: 60 },
      { id: "b", line: 1000, center: 104, width: 60 },
    ]);
    expect(m.get("a")!.scale).toBe(1);
    expect(m.get("b")!.scale).toBe(1);
  });
});
