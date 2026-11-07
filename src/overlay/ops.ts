import type { Content } from "../model/types";
import { arrowsOf, parseLabelData, type ClassKey, type ColorKey, type Gender, type LabelData, type Num, type Side } from "./types";

/**
 * Add an arrow. Both words must exist and differ; drawing the same link again
 * (same words, direction, side) changes nothing. Returns the same object when nothing changes.
 */
export function addArrow(content: Content, id: string, from: string, to: string, side: Side, color: ColorKey): Content {
  if (from === to) return content;
  const alive = new Set<string>();
  for (const t of content.tokens) if (t.kind === "word") alive.add(t.id);
  if (!alive.has(from) || !alive.has(to)) return content;
  if (arrowsOf(content.overlay).some((a) => a.from === from && a.to === to && a.side === side)) return content;
  return { tokens: content.tokens, overlay: [...content.overlay, { id, kind: "arrow", anchors: [from, to], data: { side, color } }] };
}

export function removeOverlay(content: Content, id: string): Content {
  if (!content.overlay.some((o) => o.id === id)) return content;
  return { tokens: content.tokens, overlay: content.overlay.filter((o) => o.id !== id) };
}

export type LabelPatch = { cls?: ClassKey | null; gender?: Gender | null; number?: Num | null };

/**
 * Set or clear parts of a word's label. A field set to `null` is cleared; omitted fields stay.
 * When nothing is left the label disappears. Returns the same object when nothing changes.
 */
export function setLabel(content: Content, newItemId: string, wordId: string, patch: LabelPatch): Content {
  if (!content.tokens.some((t) => t.kind === "word" && t.id === wordId)) return content;
  const existing = content.overlay.find((o) => o.kind === "label" && o.anchors[0] === wordId);
  const current: LabelData = existing ? (parseLabelData(existing.data) ?? {}) : {};
  const merged: Record<string, string> = { ...current };
  for (const key of ["cls", "gender", "number"] as const) {
    if (!(key in patch)) continue;
    const value = patch[key];
    if (value === null || value === undefined) delete merged[key];
    else merged[key] = value;
  }
  const same = JSON.stringify(sorted(merged)) === JSON.stringify(sorted(current));
  if (same) return content;
  const rest = content.overlay.filter((o) => o !== existing);
  if (Object.keys(merged).length === 0) return { tokens: content.tokens, overlay: rest };
  const item = { id: existing?.id ?? newItemId, kind: "label", anchors: [wordId], data: merged };
  const overlay = existing ? content.overlay.map((o) => (o === existing ? item : o)) : [...rest, item];
  return { tokens: content.tokens, overlay };
}

const sorted = (o: Record<string, unknown>) => Object.fromEntries(Object.entries(o).sort(([a], [b]) => a.localeCompare(b)));
