import type { OverlayItem } from "../model/types";

export const COLORS = ["blue", "red", "green", "orange", "purple"] as const;
export type ColorKey = (typeof COLORS)[number];
export type Side = "above" | "below";

export type ArrowData = { side: Side; color: ColorKey };

/** An arrow from `anchors[0]` to `anchors[1]`. */
export type Arrow = { id: string; from: string; to: string; side: Side; color: ColorKey };

export function isColor(v: unknown): v is ColorKey {
  return typeof v === "string" && (COLORS as readonly string[]).includes(v);
}

export function isSide(v: unknown): v is Side {
  return v === "above" || v === "below";
}

/** Strictly check arrow data; returns null when it is not exactly `{ side, color }`. */
export function parseArrowData(v: unknown): ArrowData | null {
  if (typeof v !== "object" || v === null || Array.isArray(v)) return null;
  const r = v as Record<string, unknown>;
  if (Object.keys(r).length !== 2 || !isSide(r.side) || !isColor(r.color)) return null;
  return { side: r.side, color: r.color };
}

export function arrowsOf(overlay: OverlayItem[]): Arrow[] {
  const out: Arrow[] = [];
  for (const item of overlay) {
    if (item.kind !== "arrow" || item.anchors.length !== 2) continue;
    const data = parseArrowData(item.data);
    if (data) out.push({ id: item.id, from: item.anchors[0]!, to: item.anchors[1]!, ...data });
  }
  return out;
}

export const CLASSES = [
  "nom",
  "verbe",
  "adjectif",
  "determinant",
  "pronom",
  "adverbe",
  "preposition",
  "conjonction",
  "nom_propre",
  "interjection",
] as const;
export type ClassKey = (typeof CLASSES)[number];
export type Gender = "m" | "f";
export type Num = "s" | "p";

/** What the child said about one word. Every field is optional; at least one is set. */
export type LabelData = { cls?: ClassKey; gender?: Gender; number?: Num };
export type Label = LabelData & { id: string; word: string };

export function isClass(v: unknown): v is ClassKey {
  return typeof v === "string" && (CLASSES as readonly string[]).includes(v);
}

/** Strictly check label data; returns null unless it is 1–3 known fields with known values. */
export function parseLabelData(v: unknown): LabelData | null {
  if (typeof v !== "object" || v === null || Array.isArray(v)) return null;
  const r = v as Record<string, unknown>;
  const keys = Object.keys(r);
  if (keys.length === 0 || keys.some((k) => k !== "cls" && k !== "gender" && k !== "number")) return null;
  const out: LabelData = {};
  if ("cls" in r) {
    if (!isClass(r.cls)) return null;
    out.cls = r.cls;
  }
  if ("gender" in r) {
    if (r.gender !== "m" && r.gender !== "f") return null;
    out.gender = r.gender;
  }
  if ("number" in r) {
    if (r.number !== "s" && r.number !== "p") return null;
    out.number = r.number;
  }
  return out;
}

/** Labels by word id. */
export function labelsOf(overlay: OverlayItem[]): Map<string, Label> {
  const out = new Map<string, Label>();
  for (const item of overlay) {
    if (item.kind !== "label" || item.anchors.length !== 1) continue;
    const data = parseLabelData(item.data);
    if (data) out.set(item.anchors[0]!, { id: item.id, word: item.anchors[0]!, ...data });
  }
  return out;
}
