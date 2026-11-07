import type { Token, WordToken } from "../model/types";
import { el } from "./dom";

/** A corrected word like on paper: the new word written above the crossed-out original. */
export function correctedNode(word: WordToken): HTMLElement {
  return el(
    "ruby",
    { class: "corr", "data-w": word.id, contenteditable: "false" },
    el("s", { text: word.original ?? "" }),
    el("rt", { text: word.text }),
  );
}

export function renderTokens(root: HTMLElement, tokens: Token[], wordNode: (w: WordToken) => Node): void {
  const frag = document.createDocumentFragment();
  for (const t of tokens) {
    if (t.kind === "sep") frag.append(document.createTextNode(t.text));
    else frag.append(wordNode(t));
  }
  root.replaceChildren(frag);
}
