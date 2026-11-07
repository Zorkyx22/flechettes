import type { Box, Frame } from "../overlay/geometry";

/** Where every located word sits on the visible sheet, plus the text's frame. */
export type Placement = { boxes: Map<string, Box>; frame: Frame; fontSize: number };

/** Tag heights in units of the text size (one line, and two lines with gender/number); the stylesheet uses the same factors. */
export const TAG_EM = 0.9;
export const TAG_EM_TWO = 1.5;

export const tagHeight = (twoLines: boolean, fontSize: number): number => fontSize * (twoLines ? TAG_EM_TWO : TAG_EM);
/** Space between a word and its bubble, in units of the text size: a thin lane for arrows above the words. */
export const TAG_GAP_EM = 0.45;
export const tagGap = (fontSize: number): number => fontSize * TAG_GAP_EM;

/**
 * `host` is the sheet. The text flow may be shifted sideways to show another page, so coordinates
 * are relative to the visible sheet: words on the next page are one `period` to the right.
 */
export function measure(
  host: HTMLElement,
  surface: HTMLElement,
  locate: () => Map<string, DOMRect>,
  /** Words that do not move with the page (the title, always on the first sheet), and the page now shown. */
  fixed: { ids: Set<string>; shownPage: number } = { ids: new Set(), shownPage: 0 },
): Placement {
  // A detached surface (mid mode switch, or screen already left) has no layout to read.
  if (!surface.isConnected || !host.isConnected) return { boxes: new Map(), frame: { pitch: 1, left: 0, right: 0 }, fontSize: 0 };
  const hostRect = host.getBoundingClientRect();
  const style = getComputedStyle(surface);
  const fontSize = parseFloat(style.fontSize);
  const pitch = parseFloat(style.lineHeight) || fontSize * 3;
  const period = hostRect.width;
  const frame: Frame = {
    pitch,
    left: parseFloat(style.paddingLeft) - 6,
    right: period - parseFloat(style.paddingRight) + 6,
    period,
  };
  const boxes = new Map<string, Box>();
  for (const [id, r] of locate()) {
    // A fixed word sits where page 1 puts it: when another page is shown it is off-screen to the left.
    const shift = fixed.ids.has(id) ? -fixed.shownPage * period : 0;
    const left = r.left - hostRect.left + shift;
    const right = r.right - hostRect.left + shift;
    boxes.set(id, { left, right, top: r.top - hostRect.top, bottom: r.bottom - hostRect.top, page: Math.floor((left + right) / 2 / period) });
  }
  // Line index: cluster word centres vertically so uneven line boxes (corrections) cannot split a line.
  // Rows repeat on every sheet, so the key also carries the page.
  const centres = [...new Set([...boxes.values()].map((b) => Math.round((b.top + b.bottom) / 2)))].sort((a, b) => a - b);
  const lineIndex = new Map<number, number>();
  let line = -1;
  let prev = -Infinity;
  for (const c of centres) {
    if (c - prev > pitch / 2) line++;
    lineIndex.set(c, line);
    prev = c;
  }
  for (const b of boxes.values()) b.line = (b.page ?? 0) * 1000 + (lineIndex.get(Math.round((b.top + b.bottom) / 2)) ?? 0);
  return { boxes, frame, fontSize };
}

/**
 * One layout read per animation frame, shared by every layer drawn over the sheet. `prepare` runs
 * first (it may turn the page). When there is nothing to draw (`needed` false) nothing is measured,
 * so plain writing never pays for it.
 */
export class OverlayScheduler {
  private requested = false;

  constructor(
    host: HTMLElement,
    private readonly needed: () => boolean,
    private readonly measureNow: () => Placement,
    private readonly layers: ((p: Placement | null) => void)[],
    private readonly prepare: () => void = () => {},
  ) {
    new ResizeObserver(() => this.requestUpdate()).observe(host);
    void document.fonts?.ready.then(() => this.requestUpdate());
  }

  requestUpdate = (): void => {
    if (this.requested) return;
    this.requested = true;
    requestAnimationFrame(() => {
      this.requested = false;
      this.prepare();
      const placement = this.needed() ? this.measureNow() : null;
      for (const draw of this.layers) draw(placement);
    });
  };
}
