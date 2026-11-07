import type { Content } from "../model/types";
import { layoutArrows, type ArrowInput, type Box, type Segment } from "../overlay/geometry";
import { arrowsOf, COLORS, labelsOf, type ColorKey } from "../overlay/types";
import type { Placement } from "./placement";
import { S } from "../strings";
import { el } from "./dom";

const NS = "http://www.w3.org/2000/svg";
const svgEl = <K extends keyof SVGElementTagNameMap>(tag: K, attrs: Record<string, string> = {}): SVGElementTagNameMap[K] => {
  const n = document.createElementNS(NS, tag);
  for (const [k, v] of Object.entries(attrs)) n.setAttribute(k, v);
  return n;
};

/** Dash pattern per color, so arrows stay distinguishable without relying on hue alone. */
export const DASH: Record<ColorKey, string> = { blue: "", red: "7 4", green: "2 4", orange: "10 4 2 4", purple: "16 5" };

type Deps = {
  content: () => Content;
  erase: (arrowId: string) => void;
  /** Ask for a redraw (the scheduler measures and calls `draw`). */
  requestUpdate: () => void;
};

/**
 * Draws the arrows in an SVG laid over the page. Reads layout in one animation frame after a
 * change, never during typing. Only arrow hit-paths take pointer events, and only when interactive.
 */
export class ArrowLayer {
  readonly svg: SVGSVGElement;
  readonly eraseBtn: HTMLButtonElement;
  private interactive = false;
  private selected: string | null = null;
  private lastSegments: Segment[] = [];

  constructor(private readonly host: HTMLElement, private readonly deps: Deps) {
    this.svg = svgEl("svg", { class: "arrows", "aria-hidden": "false" });
    const defs = svgEl("defs");
    for (const c of COLORS) {
      const head = svgEl("marker", { id: `head-${c}`, viewBox: "0 0 10 10", refX: "8", refY: "5", markerWidth: "3.4", markerHeight: "3.4", orient: "auto-start-reverse" });
      head.append(svgEl("path", { d: "M 0 0 L 10 5 L 0 10 z", class: `mk mk-${c}` }));
      const dot = svgEl("marker", { id: `dot-${c}`, viewBox: "0 0 10 10", refX: "5", refY: "5", markerWidth: "3.5", markerHeight: "3.5" });
      dot.append(svgEl("circle", { cx: "5", cy: "5", r: "4", class: `mk mk-${c}` }));
      defs.append(head, dot);
    }
    this.svg.append(defs);
    this.eraseBtn = el("button", { class: "btn erase", text: S.erase, hidden: true, onclick: () => this.eraseSelected() });
    host.append(this.svg, this.eraseBtn);
    document.addEventListener("pointerdown", this.outside);
  }

  destroy(): void {
    document.removeEventListener("pointerdown", this.outside);
  }

  setInteractive(on: boolean): void {
    this.interactive = on;
    this.host.classList.toggle("arrows-live", on);
    if (!on) this.select(null);
    this.requestUpdate();
  }

  requestUpdate(): void {
    this.deps.requestUpdate();
  }

  select(id: string | null): void {
    this.selected = id;
    this.render();
    if (id) this.svg.querySelector<SVGElement>(`.arrow-g[data-arrow="${id}"]`)?.focus();
  }

  private outside = (e: Event): void => {
    if (!this.host.isConnected) {
      this.destroy();
      return;
    }
    const t = e.target as Element | null;
    if (this.selected && t && !t.closest(".arrow-g") && t !== this.eraseBtn) this.select(null);
  };

  private eraseSelected(): void {
    const id = this.selected;
    this.select(null);
    if (id) this.deps.erase(id);
  }

  /** Called by the scheduler with fresh measurements (null when there is nothing to measure). */
  draw(placement: Placement | null): void {
    const content = this.deps.content();
    const arrows = arrowsOf(content.overlay);
    if (!placement || arrows.length === 0) {
      this.lastSegments = [];
      this.render();
      return;
    }
    const tagged = labelsOf(content.overlay);
    // Arrows stay close to the words, under the word-type bubbles; on a tagged word they land beside the bubble.
    const withTag = (id: string): Box | undefined => {
      const box = placement.boxes.get(id);
      return box && tagged.has(id) ? { ...box, tagged: true } : box;
    };
    const inputs: ArrowInput[] = [];
    for (const a of arrows) {
      const from = withTag(a.from);
      const to = withTag(a.to);
      if (from && to) inputs.push({ id: a.id, from, to, side: a.side, color: a.color });
    }
    this.lastSegments = layoutArrows(inputs, placement.frame);
    this.render();
  }

  private render(): void {
    for (const old of [...this.svg.querySelectorAll(".arrow-g")]) old.remove();
    const content = this.deps.content();
    const words = new Map<string, string>();
    for (const t of content.tokens) if (t.kind === "word") words.set(t.id, t.text);
    const arrows = new Map(arrowsOf(content.overlay).map((a) => [a.id, a]));
    const byArrow = new Map<string, Segment[]>();
    for (const s of this.lastSegments) byArrow.set(s.arrowId, [...(byArrow.get(s.arrowId) ?? []), s]);

    let selectedMid: { x: number; y: number } | null = null;
    for (const [id, segs] of byArrow) {
      const a = arrows.get(id);
      if (!a) continue;
      const g = svgEl("g", { class: `arrow-g${id === this.selected ? " selected" : ""}`, "data-arrow": id });
      if (this.interactive) {
        g.setAttribute("tabindex", "0");
        g.setAttribute("role", "button");
        g.setAttribute("aria-label", S.arrowLabel(words.get(a.from) ?? "", words.get(a.to) ?? ""));
        g.addEventListener("click", () => this.select(id));
        g.addEventListener("keydown", (e) => {
          if (e.key === "Enter" || e.key === " ") {
            e.preventDefault();
            this.select(id);
          } else if (e.key === "Delete" || e.key === "Backspace") {
            e.preventDefault();
            this.select(id);
            this.eraseSelected();
          }
        });
      }
      for (const s of segs) {
        const path = svgEl("path", { d: s.d, class: `arrow arrow-${s.color}`, "marker-end": `url(#${s.end === "head" ? "head" : "dot"}-${s.color})` });
        if (s.startDot) path.setAttribute("marker-start", `url(#dot-${s.color})`);
        if (DASH[s.color]) path.setAttribute("stroke-dasharray", DASH[s.color]);
        g.append(svgEl("path", { d: s.d, class: "arrow-hit" }), path);
        if (id === this.selected && (s.end === "head" || !selectedMid)) selectedMid = s.mid;
      }
      this.svg.append(g);
    }
    if (selectedMid) {
      this.eraseBtn.hidden = false;
      this.eraseBtn.style.left = `${selectedMid.x}px`;
      this.eraseBtn.style.top = `${selectedMid.y}px`;
    } else {
      this.eraseBtn.hidden = true;
    }
  }
}
