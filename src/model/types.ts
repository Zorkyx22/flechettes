export type WordToken = {
  kind: "word";
  id: string;
  text: string;
  /** Present once the word has been corrected: the word as first written. */
  original?: string;
  /** Every replacement made in correction mode, oldest first. */
  revisions?: Revision[];
};

export type SepToken = { kind: "sep"; text: string };

export type Token = WordToken | SepToken;

export type Revision = { text: string; at: number };

/** Overlay items belong to the correction-overlay module; the editor only keeps anchors consistent. */
export type OverlayItem = { id: string; kind: string; anchors: string[]; data?: unknown };

export type TextSize = "m" | "l" | "xl";

export type Doc = {
  id: string;
  /** The first line of the text, as it currently reads. Derived from `tokens`; kept for the list. */
  title: string;
  createdAt: number;
  updatedAt: number;
  /** Type size, saved with the text so every reader sees the same line and page breaks. */
  textSize: TextSize;
  /** Time the text went to the bin, or null. */
  deletedAt: number | null;
  tokens: Token[];
  overlay: OverlayItem[];
};

/** The part of a document that undo/redo covers. */
export type Content = { tokens: Token[]; overlay: OverlayItem[] };

/** A piece of editable text as read from the page: plain text, or an atomic corrected word. */
export type Segment = { kind: "text"; text: string } | { kind: "atom"; id: string };
