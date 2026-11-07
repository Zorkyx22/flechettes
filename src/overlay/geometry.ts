import type { ColorKey, Side } from "./types";

/**
 * `line` identifies the text line the word sits on (unique per page and row; derived from position when absent).
 * `page` is the sheet the word is on, relative to the visible one (0 = visible, 1 = next, -1 = previous).
 */
export type Box = { left: number; right: number; top: number; bottom: number; line?: number; page?: number; tagged?: boolean };
export type ArrowInput = { id: string; from: Box; to: Box; side: Side; color: ColorKey };
/**
 * `pitch` is the line height; `left`/`right` are the text's edges on the visible sheet, where wrapped
 * arrows enter and leave. `period` is the distance between one sheet and the next (0 when unpaged).
 */
export type Frame = { pitch: number; left: number; right: number; period?: number };

export type Segment = {
  arrowId: string;
  d: string;
  color: ColorKey;
  /** Arrowhead at the end (the target word), or a portal dot where the arrow leaves/enters at a margin. */
  end: "head" | "dot";
  /** A dot where a re-entering arrow starts at the margin. */
  startDot: boolean;
  /** Where "Effacer" may sit. */
  mid: { x: number; y: number };
};

type Raw = { arrowId: string; line: number; side: Side; color: ColorKey; x1: number; y1: number; x2: number; y2: number; end: "head" | "dot"; startDot: boolean };

export const LEVEL_CAP = 3;

const centerX = (b: Box) => (b.left + b.right) / 2;
/**
 * Where an arrow meets a word. A tagged word has its bubble centred just above it, so arrows land
 * on the side of the word that faces the other end, leaving the middle to the bubble.
 */
const meetX = (b: Box, towardX: number) => {
  if (!b.tagged) return centerX(b);
  const w = b.right - b.left;
  return towardX < centerX(b) ? b.left + w * 0.25 : b.left + w * 0.75;
};
const lineOf = (b: Box, pitch: number) => b.line ?? Math.floor((b.top + b.bottom) / 2 / pitch);
const anchorY = (b: Box, side: Side) => (side === "above" ? b.top : b.bottom);

/** Same-line arrows become one arc; arrows between lines become two stubs through the margins. */
export function layoutArrows(inputs: ArrowInput[], frame: Frame): Segment[] {
  const raws: Raw[] = [];
  for (const a of inputs) {
    const lf = lineOf(a.from, frame.pitch);
    const lt = lineOf(a.to, frame.pitch);
    const xf = meetX(a.from, centerX(a.to));
    const xt = meetX(a.to, centerX(a.from));
    const yf = anchorY(a.from, a.side);
    const yt = anchorY(a.to, a.side);
    if (lf === lt) {
      raws.push({ arrowId: a.id, line: lf, side: a.side, color: a.color, x1: xf, y1: yf, x2: xt, y2: yt, end: "head", startDot: false });
    } else {
      const forward = lt > lf;
      // Margins belong to each word's own sheet.
      const shift = (b: Box) => (b.page ?? 0) * (frame.period ?? 0);
      const exitX = (forward ? frame.right : frame.left) + shift(a.from);
      const enterX = (forward ? frame.left : frame.right) + shift(a.to);
      const xfOut = meetX(a.from, exitX);
      const xtIn = meetX(a.to, enterX);
      raws.push({ arrowId: a.id, line: lf, side: a.side, color: a.color, x1: xfOut, y1: yf, x2: exitX, y2: yf, end: "dot", startDot: false });
      raws.push({ arrowId: a.id, line: lt, side: a.side, color: a.color, x1: enterX, y1: yt, x2: xtIn, y2: yt, end: "head", startDot: true });
    }
  }

  // Levels per (line, side): shortest spans first, each at the lowest level where it does not overlap.
  const levels = new Map<Raw, number>();
  const groups = new Map<string, Raw[]>();
  for (const r of raws) {
    const key = `${r.line}:${r.side}`;
    const g = groups.get(key);
    if (g) g.push(r);
    else groups.set(key, [r]);
  }
  for (const g of groups.values()) {
    const placed: { lo: number; hi: number; level: number }[] = [];
    for (const r of [...g].sort((a, b) => Math.abs(a.x2 - a.x1) - Math.abs(b.x2 - b.x1))) {
      const lo = Math.min(r.x1, r.x2);
      const hi = Math.max(r.x1, r.x2);
      let level = 0;
      while (placed.some((p) => p.level === level && lo < p.hi + 4 && hi > p.lo - 4)) level++;
      placed.push({ lo, hi, level });
      levels.set(r, level);
    }
  }

  return raws.map((r) => {
    const level = Math.min(levels.get(r) ?? 0, LEVEL_CAP);
    const dir = r.side === "above" ? -1 : 1;
    const dx = r.x2 - r.x1;
    // Height: a base, a step per level, and a little more for longer spans. Arrows above the words
    // hug them (they run in the thin lane under the word-type bubbles); arrows below have more room.
    const low = r.side === "above";
    const base = low ? 0.07 : 0.14;
    const step = low ? 0.05 : 0.12;
    const span = low ? 0.05 : 0.15;
    const cy = (frame.pitch * (base + step * level) + Math.min(Math.abs(dx) * 0.02, frame.pitch * span)) * dir;
    const c1x = r.x1 + dx * 0.15;
    const c2x = r.x2 - dx * 0.15;
    const d = `M ${f(r.x1)} ${f(r.y1)} C ${f(c1x)} ${f(r.y1 + cy * 1.3)}, ${f(c2x)} ${f(r.y2 + cy * 1.3)}, ${f(r.x2)} ${f(r.y2)}`;
    return {
      arrowId: r.arrowId,
      d,
      color: r.color,
      end: r.end,
      startDot: r.startDot,
      mid: { x: (r.x1 + r.x2) / 2, y: (r.y1 + r.y2) / 2 + cy * 0.98 },
    };
  });
}

const f = (n: number) => Math.round(n * 10) / 10;

export type TagInput = { id: string; line: number; center: number; width: number };
export type TagFit = { center: number; scale: number };

/** Tags are never narrower than this fraction of their natural size. */
export const MIN_TAG_SCALE = 0.6;

/**
 * Tags stay exactly centred over their word. When two tags on one line would touch, they get
 * narrower instead of sliding sideways: each tag may be at most as wide as the distance to the
 * nearest neighbouring centre, minus a gap (two such tags always fit).
 */
export function fitTags(tags: TagInput[], gap = 4): Map<string, TagFit> {
  const out = new Map<string, TagFit>();
  const lines = new Map<number, TagInput[]>();
  for (const t of tags) lines.set(t.line, [...(lines.get(t.line) ?? []), t]);
  for (const line of lines.values()) {
    const sorted = [...line].sort((a, b) => a.center - b.center);
    sorted.forEach((t, i) => {
      const left = i > 0 ? t.center - sorted[i - 1]!.center : Infinity;
      const right = i < sorted.length - 1 ? sorted[i + 1]!.center - t.center : Infinity;
      const room = Math.min(left, right) - gap;
      const scale = t.width > 0 ? Math.max(MIN_TAG_SCALE, Math.min(1, room / t.width)) : 1;
      out.set(t.id, { center: t.center, scale });
    });
  }
  return out;
}
