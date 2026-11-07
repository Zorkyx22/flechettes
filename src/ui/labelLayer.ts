import { fitTags, type TagInput } from "../overlay/geometry";
import type { Content } from "../model/types";
import { labelsOf } from "../overlay/types";
import { el } from "./dom";
import { tagGap, tagHeight, type Placement } from "./placement";
import { tagLines, tagLong } from "./tagText";

type Deps = {
  content: () => Content;
  /** A tag was tapped (Identify tool): open the picker for its word. */
  open: (wordId: string, anchor: DOMRect) => void;
};

/**
 * Draws each word's tag above it as an HTML pill. Tags are rendered, measured, then positioned so
 * neighbours never overlap. Redrawn only when the scheduler hands over fresh measurements.
 */
export class LabelLayer {
  readonly root: HTMLElement;

  constructor(host: HTMLElement, private readonly deps: Deps) {
    this.root = el("div", { class: "tags", "aria-hidden": "true" });
    host.append(this.root);
  }

  draw(placement: Placement | null): void {
    this.root.replaceChildren();
    if (!placement) return;
    const labels = labelsOf(this.deps.content().overlay);
    if (labels.size === 0) return;

    const made: { id: string; node: HTMLElement; line: number; center: number; top: number }[] = [];
    for (const [wordId, label] of labels) {
      const box = placement.boxes.get(wordId);
      if (!box) continue;
      const lines = tagLines(label);
      const node = el(
        "span",
        { class: `tag${label.cls ? ` cls-${label.cls}` : ""}${lines.second !== null ? " two" : ""}`, title: tagLong(label), "data-word": wordId },
        el("span", { class: "tag-main", text: lines.main }),
        lines.second !== null ? el("span", { class: "tag-gn", text: lines.second }) : null,
      );
      node.addEventListener("click", () => this.deps.open(wordId, node.getBoundingClientRect()));
      this.root.append(node);
      made.push({ id: wordId, node, line: box.line ?? 0, center: (box.left + box.right) / 2, top: box.top - tagHeight(lines.second !== null, placement.fontSize) - tagGap(placement.fontSize) });
    }
    const inputs: TagInput[] = made.map((m) => ({ id: m.id, line: m.line, center: m.center, width: m.node.offsetWidth }));
    const fits = fitTags(inputs);
    for (const m of made) {
      const fit = fits.get(m.id);
      // Centred exactly over the word; narrower, never shifted, when neighbours are close.
      m.node.style.left = `${fit?.center ?? m.center}px`;
      m.node.style.top = `${m.top}px`;
      m.node.style.transform = `translateX(-50%) scale(${fit?.scale ?? 1})`;
    }
  }
}
