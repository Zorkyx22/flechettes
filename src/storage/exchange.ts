import { migrateV1, titleOf } from "../model/doc";
import type { Doc, OverlayItem, TextSize, Token } from "../model/types";
import { parseArrowData, parseLabelData } from "../overlay/types";

export const FORMAT = "flechettes-export";
export const VERSION = 2;

export const LIMITS = {
  fileBytes: 5_000_000,
  texts: 500,
  tokens: 50_000,
  tokenChars: 200,
  titleChars: 200,
  overlayItems: 20_000,
  revisions: 100,
};

const ID = /^[A-Za-z0-9_-]{1,64}$/;

export function exportDocs(docs: Doc[]): string {
  // Roster ownership is deliberately not part of a backup: it is a local/sync concern, and an
  // owner id in a portable file would dangle on another device. Drop it, like bin state.
  return JSON.stringify({
    format: FORMAT,
    version: VERSION,
    texts: docs.map(({ studentId: _drop, ...d }) => ({ ...d, deletedAt: null })),
  });
}

export class ImportError extends Error {}

/** Import is untrusted input: every field is checked and rebuilt, never passed through. */
export function parseExport(raw: string): Doc[] {
  if (raw.length > LIMITS.fileBytes) throw new ImportError("file too large");
  let data: unknown;
  try {
    data = JSON.parse(raw);
  } catch {
    throw new ImportError("not a Flechettes file");
  }
  if (!isRecord(data) || data.format !== FORMAT || (data.version !== 1 && data.version !== VERSION) || !Array.isArray(data.texts))
    throw new ImportError("not a Flechettes file");
  if (data.texts.length > LIMITS.texts) throw new ImportError("too many texts");
  const version = data.version;
  return data.texts.map((t) => parseDoc(t, version));
}

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

function str(v: unknown, max: number, what: string): string {
  if (typeof v !== "string" || v.length > max) throw new ImportError(`bad ${what}`);
  return v;
}

function time(v: unknown, what: string): number {
  if (typeof v !== "number" || !Number.isFinite(v) || v < 0) throw new ImportError(`bad ${what}`);
  return v;
}

function id(v: unknown, what: string): string {
  if (typeof v !== "string" || !ID.test(v)) throw new ImportError(`bad ${what}`);
  return v;
}

function parseDoc(v: unknown, version: number): Doc {
  if (!isRecord(v) || !Array.isArray(v.tokens) || !Array.isArray(v.overlay)) throw new ImportError("bad text");
  if (v.tokens.length > LIMITS.tokens || v.overlay.length > LIMITS.overlayItems) throw new ImportError("text too large");
  const tokens = v.tokens.map(parseToken);
  const wordIds = new Set(tokens.flatMap((t) => (t.kind === "word" ? [t.id] : [])));
  const overlay = v.overlay.map((o) => parseOverlay(o, wordIds));
  const labelled = new Set<string>();
  for (const o of overlay) {
    if (o.kind !== "label") continue;
    if (labelled.has(o.anchors[0]!)) throw new ImportError("bad overlay");
    labelled.add(o.anchors[0]!);
  }
  const base = {
    id: id(v.id, "id"),
    createdAt: time(v.createdAt, "date"),
    updatedAt: time(v.updatedAt, "date"),
    deletedAt: null,
    tokens,
    overlay,
  };
  // Version 1 files keep the title in a separate field; it moves onto the page.
  if (version === 1) return migrateV1({ ...base, title: str(v.title, LIMITS.titleChars, "title") });
  const textSize = v.textSize;
  if (textSize !== "m" && textSize !== "l" && textSize !== "xl") throw new ImportError("bad text size");
  return { ...base, textSize: textSize as TextSize, title: titleOf(tokens) };
}

function parseToken(v: unknown): Token {
  if (!isRecord(v)) throw new ImportError("bad token");
  if (v.kind === "sep") return { kind: "sep", text: str(v.text, LIMITS.tokenChars, "separator") };
  if (v.kind !== "word") throw new ImportError("bad token");
  const word: Token = { kind: "word", id: id(v.id, "word id"), text: str(v.text, LIMITS.tokenChars, "word") };
  if (v.original !== undefined) {
    word.original = str(v.original, LIMITS.tokenChars, "word");
    if (!Array.isArray(v.revisions) || v.revisions.length > LIMITS.revisions) throw new ImportError("bad revisions");
    word.revisions = v.revisions.map((r) => {
      if (!isRecord(r)) throw new ImportError("bad revision");
      return { text: str(r.text, LIMITS.tokenChars, "word"), at: time(r.at, "date") };
    });
  }
  return word;
}

function parseOverlay(v: unknown, wordIds: Set<string>): OverlayItem {
  if (!isRecord(v) || !Array.isArray(v.anchors)) throw new ImportError("bad overlay");
  const anchors = v.anchors.map((a) => id(a, "anchor"));
  if (!anchors.every((a) => wordIds.has(a))) throw new ImportError("bad overlay");
  const itemId = id(v.id, "overlay id");
  if (v.kind === "arrow") {
    const data = parseArrowData(v.data);
    if (!data || anchors.length !== 2 || anchors[0] === anchors[1]) throw new ImportError("bad overlay");
    return { id: itemId, kind: "arrow", anchors, data };
  }
  if (v.kind === "label") {
    const data = parseLabelData(v.data);
    if (!data || anchors.length !== 1) throw new ImportError("bad overlay");
    return { id: itemId, kind: "label", anchors, data };
  }
  throw new ImportError("bad overlay");
}
