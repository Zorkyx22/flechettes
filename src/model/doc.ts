import { newId } from "./ids";
import { reconcile } from "./reconcile";
import type { Content, Doc, Token } from "./types";
import { tokenize } from "./words";

/** The text's name: its first line (up to the first newline) as it currently reads, corrections included. */
export function titleOf(tokens: Token[]): string {
  let out = "";
  for (const t of tokens) {
    const nl = t.kind === "sep" ? t.text.indexOf("\n") : -1;
    if (nl >= 0) return (out + t.text.slice(0, nl)).trim();
    out += t.text;
  }
  return out.trim();
}

export function createDoc(now: number): Doc {
  return { id: newId(), title: "", textSize: "m", createdAt: now, updatedAt: now, deletedAt: null, tokens: [], overlay: [] };
}

export function contentOf(doc: Doc): Content {
  return { tokens: doc.tokens, overlay: doc.overlay };
}

export function withContent(doc: Doc, content: Content, now: number): Doc {
  return { ...doc, tokens: content.tokens, overlay: content.overlay, title: titleOf(content.tokens), updatedAt: now };
}

/** Build content from plain text (used by tests and import tooling). */
export function contentFromText(text: string): Content {
  return reconcile({ tokens: [], overlay: [] }, [{ kind: "text", text }]);
}

/**
 * Version 1 kept the title in a separate field. From version 2 the title is the first line of the
 * text, so a stored title is written in front of the words (with new word ids; overlay anchors
 * only ever point at old words, so they are untouched).
 */
export function migrateV1(doc: Omit<Doc, "textSize"> & { textSize?: Doc["textSize"] }): Doc {
  const title = doc.title.trim();
  let tokens = doc.tokens;
  if (title !== "") {
    const head: Token[] = tokenize(title.replace(/\s+/g, " ")).map((r) => (r.kind === "word" ? { kind: "word", id: newId(), text: r.text } : { kind: "sep", text: r.text }));
    const first = tokens[0];
    const lead: Token[] = [...head, { kind: "sep", text: "\n" }];
    // Merge with a leading separator so no two separators sit side by side.
    if (first && first.kind === "sep") tokens = [...head, { kind: "sep", text: "\n" + first.text }, ...tokens.slice(1)];
    else tokens = [...lead, ...tokens];
  }
  return { ...doc, textSize: doc.textSize ?? "m", tokens, title: titleOf(tokens) };
}

/**
 * Cut a text into its title (up to the first newline) and the body after it. A separator that
 * contains the newline is cut at it (the newline itself belongs to neither part). With no
 * newline, everything is title.
 */
export function splitTitle(tokens: Token[]): { title: Token[]; body: Token[] } {
  const i = tokens.findIndex((t) => t.kind === "sep" && t.text.includes("\n"));
  if (i < 0) return { title: tokens, body: [] };
  const sep = tokens[i]!;
  const nl = sep.text.indexOf("\n");
  const before = sep.text.slice(0, nl);
  const after = sep.text.slice(nl + 1);
  const title = tokens.slice(0, i);
  if (before !== "") title.push({ kind: "sep", text: before });
  const body = after !== "" ? [{ kind: "sep", text: after } as Token] : [];
  return { title, body: [...body, ...tokens.slice(i + 1)] };
}
