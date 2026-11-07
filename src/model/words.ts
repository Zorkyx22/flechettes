import type { Token } from "./types";

// A word is letters/digits, joined by inner hyphens, with an optional closing apostrophe
// (so "l'arbre" is "l'" + "arbre"). Everything else is a separator. Words are split only to
// give anchors; they are never classified.
const WORD = /[\p{L}\p{M}\p{N}]+(?:-[\p{L}\p{M}\p{N}]+)*['’]?/gu;

export type RawToken = { kind: "word" | "sep"; text: string };

export function tokenize(text: string): RawToken[] {
  const out: RawToken[] = [];
  let last = 0;
  for (const m of text.matchAll(WORD)) {
    const start = m.index ?? 0;
    if (start > last) out.push({ kind: "sep", text: text.slice(last, start) });
    out.push({ kind: "word", text: m[0] });
    last = start + m[0].length;
  }
  if (last < text.length) out.push({ kind: "sep", text: text.slice(last) });
  return out;
}

/** The text a token list currently shows (replacements, not originals). */
export function plainText(tokens: Token[]): string {
  return tokens.map((t) => t.text).join("");
}
