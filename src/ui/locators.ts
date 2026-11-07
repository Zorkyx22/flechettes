import type { Token } from "../model/types";

/** Correction mode: every word is an element carrying its id. */
export function locateByAttr(...roots: HTMLElement[]): Map<string, DOMRect> {
  const out = new Map<string, DOMRect>();
  for (const root of roots) {
    for (const n of root.querySelectorAll<HTMLElement>("[data-w]")) {
      if (n.dataset.w) out.set(n.dataset.w, n.getBoundingClientRect());
    }
  }
  return out;
}

type Piece = { kind: "text"; node: Text } | { kind: "atom"; el: HTMLElement };

/**
 * Writing mode: the text is plain text nodes. Walk them in step with the token list (which is in
 * sync after every input) and measure each word's range. Returns an empty map if the page and the
 * tokens ever disagree, so arrows disappear rather than point at the wrong word.
 */
export function locateInText(root: HTMLElement, tokens: Token[]): Map<string, DOMRect> {
  const pieces: Piece[] = [];
  let ok = true;
  const walk = (n: Node) => {
    if (n.nodeType === Node.TEXT_NODE) {
      if ((n as Text).length > 0) pieces.push({ kind: "text", node: n as Text });
    } else if (n instanceof HTMLElement) {
      if (n.dataset.w !== undefined) pieces.push({ kind: "atom", el: n });
      else if (n.tagName === "BR" || n.tagName === "DIV" || n.tagName === "P") ok = false;
      else n.childNodes.forEach(walk);
    }
  };
  root.childNodes.forEach(walk);
  const out = new Map<string, DOMRect>();
  if (!ok) return out;

  let pi = 0;
  let off = 0;
  const settle = () => {
    while (pi < pieces.length) {
      const p = pieces[pi]!;
      if (p.kind === "text" && off >= p.node.length) {
        pi++;
        off = 0;
      } else break;
    }
  };

  for (const t of tokens) {
    settle();
    const piece = pieces[pi];
    if (t.kind === "word" && t.original !== undefined) {
      if (!piece || piece.kind !== "atom" || piece.el.dataset.w !== t.id) return new Map();
      out.set(t.id, piece.el.getBoundingClientRect());
      pi++;
      continue;
    }
    if (!piece || piece.kind !== "text") return new Map();
    const range = document.createRange();
    range.setStart(piece.node, off);
    let remaining = t.text.length;
    while (remaining > 0) {
      settle();
      const cur = pieces[pi];
      if (!cur || cur.kind !== "text") return new Map();
      const take = Math.min(remaining, cur.node.length - off);
      off += take;
      remaining -= take;
      if (remaining === 0) range.setEnd(cur.node, off);
    }
    if (t.kind === "word") {
      const rect = range.getClientRects()[0] ?? range.getBoundingClientRect();
      out.set(t.id, rect);
    }
  }
  return out;
}
