import { newId } from "./ids";
import type { Content, OverlayItem, Segment, SepToken, Token, WordToken } from "./types";
import { tokenize } from "./words";

/** Where the new token list came from, so unchanged words keep their identity. */
function sameToken(a: Token, b: Token): boolean {
  if (a.kind !== b.kind) return false;
  if (a.kind === "word" && b.kind === "word") {
    // A corrected word is atomic: matched by id only; plain words by text.
    if (a.original !== undefined || b.original !== undefined) return a.id === b.id;
    return a.text === b.text;
  }
  return a.text === b.text;
}

function segmentsToTokens(segments: Segment[], previous: Token[]): Token[] {
  const corrected = new Map<string, WordToken>();
  for (const t of previous) if (t.kind === "word" && t.original !== undefined) corrected.set(t.id, t);

  const out: Token[] = [];
  const pushSep = (text: string) => {
    const last = out[out.length - 1];
    if (last && last.kind === "sep") out[out.length - 1] = { kind: "sep", text: last.text + text };
    else out.push({ kind: "sep", text });
  };
  for (const seg of segments) {
    if (seg.kind === "atom") {
      const word = corrected.get(seg.id);
      if (word) out.push(word);
      continue;
    }
    for (const raw of tokenize(seg.text)) {
      if (raw.kind === "sep") pushSep(raw.text);
      else out.push({ kind: "word", id: "", text: raw.text });
    }
  }
  return out;
}

/**
 * Turn what the page now shows into a new token list. Words that did not change keep their id
 * (so annotations stay attached); changed or removed words lose theirs, and overlay items
 * anchored to them are dropped.
 */
export function reconcile(prev: Content, segments: Segment[]): Content {
  const next = segmentsToTokens(segments, prev.tokens);
  const old = prev.tokens;

  let head = 0;
  while (head < old.length && head < next.length && sameToken(old[head]!, next[head]!)) head++;
  let tail = 0;
  while (
    tail < old.length - head &&
    tail < next.length - head &&
    sameToken(old[old.length - 1 - tail]!, next[next.length - 1 - tail]!)
  )
    tail++;

  const oldMid = old.slice(head, old.length - tail);
  const newMid = next.slice(head, next.length - tail);
  const matchedOld = lcsMatch(oldMid, newMid);

  const result: Token[] = [];
  for (let i = 0; i < head; i++) result.push(old[i]!);
  newMid.forEach((tok, j) => {
    const oldIndex = matchedOld.get(j);
    if (oldIndex !== undefined) result.push(oldMid[oldIndex]!);
    else result.push(tok.kind === "word" ? { ...tok, id: newId() } : (tok as SepToken));
  });
  for (let i = old.length - tail; i < old.length; i++) result.push(old[i]!);

  const alive = new Set<string>();
  for (const t of result) if (t.kind === "word") alive.add(t.id);
  return { tokens: result, overlay: prev.overlay.filter((item) => item.anchors.every((a) => alive.has(a))) };
}

/** Longest common subsequence between two (short) token lists: new index -> old index. */
function lcsMatch(a: Token[], b: Token[]): Map<number, number> {
  const n = a.length;
  const m = b.length;
  const matches = new Map<number, number>();
  if (n === 0 || m === 0) return matches;
  const width = m + 1;
  const table = new Uint32Array((n + 1) * width);
  for (let i = n - 1; i >= 0; i--) {
    for (let j = m - 1; j >= 0; j--) {
      table[i * width + j] = sameToken(a[i]!, b[j]!)
        ? table[(i + 1) * width + j + 1]! + 1
        : Math.max(table[(i + 1) * width + j]!, table[i * width + j + 1]!);
    }
  }
  let i = 0;
  let j = 0;
  while (i < n && j < m) {
    if (sameToken(a[i]!, b[j]!)) {
      matches.set(j, i);
      i++;
      j++;
    } else if (table[(i + 1) * width + j]! >= table[i * width + j + 1]!) i++;
    else j++;
  }
  return matches;
}

export function dropOverlayFor(overlay: OverlayItem[], removed: Set<string>): OverlayItem[] {
  return overlay.filter((item) => !item.anchors.some((a) => removed.has(a)));
}
