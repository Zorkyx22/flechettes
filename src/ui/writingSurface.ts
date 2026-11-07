import { splitTitle } from "../model/doc";
import type { Segment, Token } from "../model/types";
import { S } from "../strings";
import { el, noAssist } from "./dom";
import { correctedNode, renderTokens } from "./render";
import { readSegments, segmentsText } from "./segments";
import type { EditorSession } from "./session";
import { toast } from "./toast";

/** Marker put on the clipboard by our own copy, so paste can tell "from here" from "from elsewhere". */
const CLIP_MARK = "application/x-flechettes";

const BLOCKED_INPUT = new Set([
  "insertFromPaste",
  "insertFromPasteAsQuotation",
  "insertFromDrop",
  "insertFromYank",
  "insertReplacementText",
  "insertLink",
]);

export type WritingSurface = {
  /** The body flow (the part that paginates). */
  root: HTMLElement;
  /** The title host, centred in the unruled band at the top of the sheet. */
  title: HTMLElement;
  /** Everything to put on the sheet, in order. */
  elements: HTMLElement[];
  render: () => void;
  focus: () => void;
};

function editable(host: HTMLElement): void {
  // plaintext-only blocks formatting and markup; older browsers fall back to "true" and we only ever read text.
  host.setAttribute("contenteditable", "plaintext-only");
  if (host.contentEditable !== "plaintext-only") host.setAttribute("contenteditable", "true");
  noAssist(host);
}

/**
 * Writing mode. The text is one token sequence shown in two editable regions: the title (everything
 * before the first newline) in the top band, and the body in the page flow. Reading the page joins
 * them with a newline, so the model never knows about the split.
 */
export function createWritingSurface(session: EditorSession): WritingSurface {
  const root = el("div", { class: "surface writing", role: "textbox", "aria-multiline": "true", "aria-label": S.modeWrite });
  const title = el("div", { class: "title-host", role: "textbox", "aria-label": S.titleLabel });
  const band = el("div", { class: "title-band" }, title);
  editable(root);
  editable(title);
  title.dataset.hint = S.titleHint;

  const parts = () => splitTitle(session.content.tokens);
  const wordNode = (w: Token & { kind: "word" }) => (w.original !== undefined ? correctedNode(w) : document.createTextNode(w.text));

  const syncEmpty = () => title.classList.toggle("is-empty", parts().title.length === 0);
  const render = () => {
    const { title: t, body } = parts();
    renderTokens(title, t, wordNode);
    renderTokens(root, body, wordNode);
    syncEmpty();
  };

  /** What both regions show now, joined by the newline that separates title from body. */
  const readAll = (withNewline = true): Segment[] => [
    ...readSegments(title),
    ...(withNewline ? [{ kind: "text", text: "\n" } as Segment] : []),
    ...readSegments(root),
  ];
  const onInput = () => {
    session.type(readAll());
    syncEmpty();
  };

  const undoOrRedo = (redo: boolean) => {
    const c = redo ? session.redo() : session.undo();
    if (!c) return;
    render();
    const { body } = parts();
    placeCaretAtEnd(body.length > 0 ? root : title);
  };

  /** Join the first body line onto the title (the newline between them is deleted). */
  const mergeBodyIntoTitle = () => {
    const chars = parts().title.reduce((n, t) => n + t.text.length, 0);
    session.type(readAll(false));
    render();
    placeCaretAtChar(title, parts().title, chars);
  };

  for (const host of [root, title]) {
    host.addEventListener("beforeinput", (e) => {
      const type = e.inputType;
      if (BLOCKED_INPUT.has(type) || type.startsWith("format")) e.preventDefault();
      else if (type === "historyUndo" || type === "historyRedo") {
        e.preventDefault();
        undoOrRedo(type === "historyRedo");
      } else if (host === title && (type === "insertParagraph" || type === "insertLineBreak")) {
        e.preventDefault();
        placeCaretAtStart(root);
        root.focus();
      }
    });
    host.addEventListener("input", onInput);
    host.addEventListener("keydown", (e) => {
      if ((e.ctrlKey || e.metaKey) && !e.altKey) {
        const k = e.key.toLowerCase();
        if (k === "z") {
          e.preventDefault();
          undoOrRedo(e.shiftKey);
        } else if (k === "y") {
          e.preventDefault();
          undoOrRedo(true);
        }
        return;
      }
      if (e.shiftKey || e.altKey || e.ctrlKey || e.metaKey || !isCollapsedIn(host)) return;
      if (host === title) {
        if (e.key === "Enter") {
          e.preventDefault();
          root.focus();
          placeCaretAtStart(root);
        } else if ((e.key === "ArrowDown" || e.key === "ArrowRight") && caretAtEdge(title, "end")) {
          e.preventDefault();
          root.focus();
          placeCaretAtStart(root);
        } else if (e.key === "Delete" && caretAtEdge(title, "end")) {
          e.preventDefault();
          mergeBodyIntoTitle();
        }
      } else if ((e.key === "ArrowUp" || e.key === "ArrowLeft") && caretAtEdge(root, "start")) {
        e.preventDefault();
        title.focus();
        placeCaretAtEnd(title);
      } else if (e.key === "Backspace" && caretAtEdge(root, "start")) {
        e.preventDefault();
        mergeBodyIntoTitle();
      }
    });

    const selectedText = (): string => {
      const sel = window.getSelection();
      if (!sel || sel.rangeCount === 0 || sel.isCollapsed) return "";
      const holder = document.createElement("div");
      holder.append(sel.getRangeAt(0).cloneContents());
      return segmentsText(readSegments(holder), session.content.tokens);
    };
    const copy = (e: ClipboardEvent) => {
      const text = selectedText();
      if (text === "" || !e.clipboardData) return false;
      e.preventDefault();
      e.clipboardData.setData("text/plain", text);
      e.clipboardData.setData(CLIP_MARK, "1");
      return true;
    };
    host.addEventListener("copy", (e) => void copy(e));
    host.addEventListener("cut", (e) => {
      if (copy(e)) document.execCommand("delete");
    });
    host.addEventListener("paste", (e) => {
      e.preventDefault();
      const data = e.clipboardData;
      if (!data || !data.types.includes(CLIP_MARK)) {
        toast(S.pasteRefused);
        return;
      }
      let text = data.getData("text/plain");
      // The title is one line: pasted line breaks become spaces.
      if (host === title) text = text.replace(/\s*\n+\s*/g, " ");
      if (text !== "" && !document.execCommand("insertText", false, text)) insertAtCaret(host, text);
    });
    for (const type of ["drop", "dragstart", "dragover"] as const) host.addEventListener(type, (e) => e.preventDefault());
  }

  render();
  return { root, title, elements: [band, root], render, focus: () => (parts().title.length > 0 ? root : title).focus() };
}

function isCollapsedIn(host: HTMLElement): boolean {
  const sel = window.getSelection();
  return !!sel && sel.rangeCount > 0 && sel.isCollapsed && host.contains(sel.anchorNode);
}

/** True when the caret sits at the very start or end of the host's content. */
function caretAtEdge(host: HTMLElement, edge: "start" | "end"): boolean {
  const sel = window.getSelection();
  if (!sel || sel.rangeCount === 0 || !sel.isCollapsed) return false;
  const caret = sel.getRangeAt(0);
  const rest = document.createRange();
  if (edge === "end") {
    rest.setStart(caret.endContainer, caret.endOffset);
    rest.setEnd(host, host.childNodes.length);
  } else {
    rest.setStart(host, 0);
    rest.setEnd(caret.startContainer, caret.startOffset);
  }
  return rest.toString() === "" && rest.cloneContents().querySelector("[data-w]") === null;
}

function placeCaretAtEnd(host: HTMLElement): void {
  const range = document.createRange();
  range.selectNodeContents(host);
  range.collapse(false);
  const sel = window.getSelection();
  sel?.removeAllRanges();
  sel?.addRange(range);
}

function placeCaretAtStart(host: HTMLElement): void {
  const range = document.createRange();
  range.selectNodeContents(host);
  range.collapse(true);
  const sel = window.getSelection();
  sel?.removeAllRanges();
  sel?.addRange(range);
}

/** Put the caret after `chars` characters of the host's tokens (a corrected word counts as its new text). */
function placeCaretAtChar(host: HTMLElement, tokens: Token[], chars: number): void {
  host.focus();
  const range = document.createRange();
  let left = chars;
  let placed = false;
  tokens.forEach((t, i) => {
    if (placed) return;
    const node = host.childNodes[i];
    if (!node) return;
    if (left <= t.text.length && node.nodeType === Node.TEXT_NODE) {
      range.setStart(node, Math.min(left, (node as Text).length));
      placed = true;
    } else if (left <= t.text.length) {
      range.setStartAfter(node);
      placed = true;
    }
    left -= t.text.length;
  });
  if (!placed) {
    placeCaretAtEnd(host);
    return;
  }
  range.collapse(true);
  const sel = window.getSelection();
  sel?.removeAllRanges();
  sel?.addRange(range);
}

/** Fallback when execCommand is unavailable. */
function insertAtCaret(host: HTMLElement, text: string): void {
  const sel = window.getSelection();
  if (!sel || sel.rangeCount === 0) return;
  const range = sel.getRangeAt(0);
  range.deleteContents();
  const node = document.createTextNode(text);
  range.insertNode(node);
  range.setStartAfter(node);
  range.collapse(true);
  host.dispatchEvent(new Event("input", { bubbles: true }));
}
