/**
 * Turning pages. The text is one multi-column flow, one column per sheet; the visible sheet shows
 * one column, and turning a page slides the flow sideways (a CSS variable read by the stylesheet,
 * so it keeps up when the sheet is resized). The browser does not scroll a clipped flow to the caret
 * by itself, so the page follows the caret by measuring it.
 */
export class PageFlow {
  private page = 0;
  private lastCount = 1;
  private announced = false;

  constructor(
    private readonly sheet: HTMLElement,
    private readonly flow: () => HTMLElement,
    private readonly onChange: (page: number, count: number) => void,
  ) {}

  get index(): number {
    return this.page;
  }

  get count(): number {
    return this.lastCount;
  }

  /** Recount pages (reads layout) and keep the current page valid. */
  refresh(): void {
    const width = this.sheet.getBoundingClientRect().width;
    const scrollWidth = this.flow().scrollWidth;
    const count = width > 0 ? Math.max(1, Math.ceil((scrollWidth - 2) / width)) : 1;
    const page = Math.min(this.page, count - 1);
    const changed = !this.announced || count !== this.lastCount || page !== this.page;
    this.announced = true;
    this.lastCount = count;
    this.apply(page);
    if (changed) this.onChange(this.page, count);
  }

  go(page: number): void {
    const clamped = Math.max(0, Math.min(page, this.lastCount - 1));
    if (clamped === this.page) return;
    this.apply(clamped);
    this.onChange(this.page, this.lastCount);
  }

  /** Turn to the page that holds the caret, if the caret is in `root`. */
  followCaret(root: HTMLElement): void {
    const caret = caretPoint(root);
    if (!caret) return;
    const rect = this.sheet.getBoundingClientRect();
    if (rect.width <= 0) return;
    const delta = Math.floor((caret.left - rect.left) / rect.width);
    if (delta !== 0) {
      // A new page may have just been created by typing: count it before going there.
      this.refresh();
      this.go(this.page + delta);
    }
  }

  private apply(page: number): void {
    this.page = page;
    this.sheet.style.setProperty("--page", String(page));
    // The title band belongs to the first sheet only.
    this.sheet.dataset.first = page === 0 ? "1" : "0";
  }
}

/** Where the caret is on screen (collapsed ranges often have no rectangle, so measure a neighbouring character). */
function caretPoint(root: HTMLElement): { left: number; top: number } | null {
  const sel = window.getSelection();
  if (!sel || sel.rangeCount === 0 || !root.contains(sel.anchorNode)) return null;
  const range = sel.getRangeAt(0);
  const node = range.startContainer;
  const offset = range.startOffset;
  const rectOf = (start: number, end: number): DOMRect | null => {
    const r = document.createRange();
    r.setStart(node, start);
    r.setEnd(node, end);
    const rects = r.getClientRects();
    return rects.length > 0 ? rects[rects.length - 1]! : null;
  };
  if (node.nodeType === Node.TEXT_NODE) {
    const len = (node as Text).length;
    if (offset > 0) {
      const r = rectOf(offset - 1, offset);
      if (r) return { left: r.right - 1, top: r.top };
    }
    if (offset < len) {
      const r = rectOf(offset, offset + 1);
      if (r) return { left: r.left + 1, top: r.top };
    }
  }
  const b = range.getBoundingClientRect();
  return b.width > 0 || b.height > 0 ? { left: b.left, top: b.top } : null;
}
