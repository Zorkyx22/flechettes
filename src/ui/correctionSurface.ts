import { splitTitle } from "../model/doc";
import type { WordToken } from "../model/types";
import type { ColorKey } from "../overlay/types";
import { S } from "../strings";
import { el, noAssist } from "./dom";
import { correctedNode, renderTokens } from "./render";
import type { EditorSession } from "./session";

/**
 * Correction mode: the text cannot be typed into. The child picks one word and rewrites it;
 * the old word stays crossed out with the new one above it.
 */
export type Tools = {
  tool: "rewrite" | "arrow" | "identify";
  color: ColorKey;
  /** The word an arrow is being drawn from, once the first word is tapped. */
  armed: string | null;
};

export function createCorrectionSurface(
  session: EditorSession,
  tools: Tools,
  onToolState: () => void,
  onIdentify: (target: HTMLElement) => void,
): {
  root: HTMLElement;
  band: HTMLElement;
  elements: HTMLElement[];
  render: () => void;
  close: () => void;
  disarm: () => void;
  find: (id: string) => HTMLElement | null;
} {
  const root = el("div", { class: "surface correcting", "aria-label": S.modeCorrect });
  // The title, in its own unruled band at the top of the sheet.
  const titleView = el("div", { class: "title-host", "aria-label": S.titleLabel });
  const band = el("div", { class: "title-band" }, titleView);
  let editing: HTMLInputElement | null = null;

  const wordNode = (w: WordToken): HTMLElement => {
    const node =
      w.original !== undefined
        ? correctedNode(w)
        : el("span", { class: "w", "data-w": w.id }, document.createTextNode(w.text));
    node.removeAttribute("contenteditable");
    node.classList.add("pick");
    if (tools.armed === w.id) node.classList.add("armed");
    node.setAttribute("role", "button");
    node.tabIndex = 0;
    return node;
  };

  const render = () => {
    close();
    tools.armed = null;
    const { title, body } = splitTitle(session.content.tokens);
    renderTokens(titleView, title, wordNode);
    renderTokens(root, body, wordNode);
  };

  const disarm = () => {
    if (tools.armed === null) return;
    find(tools.armed)?.classList.remove("armed");
    tools.armed = null;
    onToolState();
  };

  /** Arrow tool: first tap picks the start word, second tap the end word (upper half = above). */
  function tapForArrow(target: HTMLElement, clientY: number | null): void {
    const id = target.dataset.w;
    if (!id) return;
    if (tools.armed === null) {
      tools.armed = id;
      target.classList.add("armed");
      onToolState();
      return;
    }
    if (tools.armed === id) {
      disarm();
      return;
    }
    const rect = target.getBoundingClientRect();
    const side = clientY !== null && clientY < rect.top + rect.height / 2 ? "above" : "below";
    const from = tools.armed;
    disarm();
    session.addArrow(from, id, side, tools.color);
  }

  const find = (id: string): HTMLElement | null =>
    [...band.querySelectorAll<HTMLElement>("[data-w]"), ...root.querySelectorAll<HTMLElement>("[data-w]")].find((n) => n.dataset.w === id) ?? null;

  function close(): void {
    const input = editing;
    editing = null;
    input?.remove();
  }

  function begin(target: HTMLElement): void {
    const id = target.dataset.w;
    const word = session.content.tokens.find((t): t is WordToken => t.kind === "word" && t.id === id);
    if (!word || !id) return;
    close();
    const rect = target.getBoundingClientRect();
    // The input sits in whichever positioned region holds the word.
    const container = target.closest<HTMLElement>(".title-band") ?? root;
    const host = container.getBoundingClientRect();
    const input = el("input", {
      class: "word-input",
      type: "text",
      value: word.text,
      "aria-label": S.modeCorrect,
      maxlength: "100",
    });
    noAssist(input);
    input.style.left = `${rect.left - host.left}px`;
    input.style.top = `${rect.top - host.top}px`;
    input.style.minWidth = `${Math.max(rect.width, 60)}px`;
    input.style.height = `${rect.height}px`;
    editing = input;
    let finished = false;
    const finish = (commit: boolean) => {
      if (finished) return;
      finished = true;
      const value = input.value;
      close();
      if (commit && session.correct(id, value)) {
        const fresh = session.content.tokens.find((t): t is WordToken => t.kind === "word" && t.id === id);
        const old = find(id);
        if (fresh && old) old.replaceWith(wordNode(fresh));
      }
      find(id)?.focus();
    };
    input.addEventListener("keydown", (e) => {
      if (e.key === "Enter") {
        e.preventDefault();
        finish(true);
      } else if (e.key === "Escape") {
        e.preventDefault();
        finish(false);
      }
    });
    input.addEventListener("blur", () => finish(true));
    container.append(input);
    input.focus();
    input.select();
  }

  for (const region of [root, band]) region.addEventListener("click", (e) => {
    const target = (e.target as HTMLElement).closest<HTMLElement>("[data-w]");
    if (!target || !region.contains(target)) return;
    if (tools.tool === "arrow") tapForArrow(target, e.clientY);
    else if (tools.tool === "identify") onIdentify(target);
    else begin(target);
  });
  for (const region of [root, band]) {
    region.addEventListener("keydown", (e) => {
      if (e.target instanceof HTMLElement && e.target.dataset.w !== undefined && (e.key === "Enter" || e.key === " ")) {
        e.preventDefault();
        if (tools.tool === "arrow") tapForArrow(e.target, null);
        else if (tools.tool === "identify") onIdentify(e.target);
        else begin(e.target);
      }
    });
    // Nothing can be dropped or pasted into this surface.
    for (const type of ["drop", "paste", "dragover"] as const) region.addEventListener(type, (e) => e.preventDefault());
  }

  render();
  return { root, band, elements: [band, root], render, close, disarm, find };
}
