import type { Segment, Token } from "../model/types";

/** Read what a writing surface shows: plain text, and corrected words as atoms. */
export function readSegments(root: Node): Segment[] {
  const out: Segment[] = [];
  const text = (t: string) => {
    if (t === "") return;
    const last = out[out.length - 1];
    if (last && last.kind === "text") last.text += t;
    else out.push({ kind: "text", text: t });
  };
  const walk = (node: Node, first: boolean) => {
    if (node.nodeType === Node.TEXT_NODE) {
      text((node.nodeValue ?? "").replace(/\u200b/g, ""));
      return;
    }
    if (!(node instanceof HTMLElement)) {
      node.childNodes.forEach((c, i) => walk(c, i === 0));
      return;
    }
    const id = node.dataset.w;
    if (id !== undefined) {
      out.push({ kind: "atom", id });
      return;
    }
    if (node.tagName === "BR") {
      text("\n");
      return;
    }
    const block = node.tagName === "DIV" || node.tagName === "P";
    if (block && !first) text("\n");
    node.childNodes.forEach((c, i) => walk(c, i === 0));
  };
  root.childNodes.forEach((c, i) => walk(c, i === 0));
  return out;
}

/** The plain text of some segments, with corrected words as their current replacement. */
export function segmentsText(segments: Segment[], tokens: Token[]): string {
  const current = new Map<string, string>();
  for (const t of tokens) if (t.kind === "word") current.set(t.id, t.text);
  return segments.map((s) => (s.kind === "text" ? s.text : (current.get(s.id) ?? ""))).join("");
}
