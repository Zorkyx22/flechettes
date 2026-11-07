import type { Content } from "./types";

/**
 * Correction mode: rewrite one word. The word keeps its id (so arrows attached to it stay),
 * the first original is remembered, and every revision is recorded.
 * Returns the same content object when nothing changes.
 */
export function correctWord(content: Content, wordId: string, replacement: string, at: number): Content {
  const clean = replacement.replace(/\s+/g, "");
  if (clean === "") return content;
  let changed = false;
  const tokens = content.tokens.map((t) => {
    if (t.kind !== "word" || t.id !== wordId || t.text === clean) return t;
    changed = true;
    return {
      ...t,
      text: clean,
      original: t.original ?? t.text,
      revisions: [...(t.revisions ?? []), { text: clean, at }],
    };
  });
  return changed ? { tokens, overlay: content.overlay } : content;
}
