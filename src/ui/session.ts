import { correctWord } from "../model/correct";
import { contentOf, withContent } from "../model/doc";
import { History } from "../model/history";
import { newId } from "../model/ids";
import { reconcile } from "../model/reconcile";
import { addArrow, removeOverlay, setLabel, type LabelPatch } from "../overlay/ops";
import type { ColorKey, Side } from "../overlay/types";
import type { Content, Doc, Segment, TextSize } from "../model/types";
import type { Library } from "../storage/library";

/** One open text: the document, its undo history, and persistence. Both modes edit through it. */
export class EditorSession {
  private history: History;
  doc: Doc;
  onChange: () => void = () => {};

  constructor(
    doc: Doc,
    private readonly library: Library,
    private readonly now: () => number = Date.now,
  ) {
    this.doc = doc;
    this.history = new History(contentOf(doc));
  }

  get content(): Content {
    return this.history.content;
  }

  get canUndo(): boolean {
    return this.history.canUndo;
  }

  get canRedo(): boolean {
    return this.history.canRedo;
  }

  /** Writing mode: the page changed; rebuild the model from what it now shows. */
  type(segments: Segment[]): void {
    this.apply(reconcile(this.history.content, segments), true);
  }

  /** Correction mode: rewrite one word. Returns false when nothing changed. */
  correct(wordId: string, replacement: string): boolean {
    const next = correctWord(this.history.content, wordId, replacement, this.now());
    if (next === this.history.content) return false;
    this.apply(next, false);
    return true;
  }

  /** Correction mode: draw an arrow. Returns false when nothing changed. */
  addArrow(from: string, to: string, side: Side, color: ColorKey): boolean {
    const next = addArrow(this.history.content, newId(), from, to, side, color);
    if (next === this.history.content) return false;
    this.apply(next, false);
    return true;
  }

  /** Identify tool: set or clear part of a word's label. One undo step per call. */
  setLabel(wordId: string, patch: LabelPatch): boolean {
    const next = setLabel(this.history.content, newId(), wordId, patch);
    if (next === this.history.content) return false;
    this.apply(next, false);
    return true;
  }

  removeOverlay(id: string): boolean {
    const next = removeOverlay(this.history.content, id);
    if (next === this.history.content) return false;
    this.apply(next, false);
    return true;
  }

  undo(): Content | null {
    const c = this.history.undo();
    if (c) this.persist(c);
    return c;
  }

  redo(): Content | null {
    const c = this.history.redo();
    if (c) this.persist(c);
    return c;
  }

  /** Type size belongs to the text (it decides the line and page breaks); not part of undo. */
  setTextSize(size: TextSize): void {
    this.doc = { ...this.doc, textSize: size, updatedAt: this.now() };
    this.library.save(this.doc);
  }

  private apply(next: Content, coalesce: boolean): void {
    this.history.commit(next, this.now(), coalesce);
    this.persist(next);
  }

  private persist(content: Content): void {
    this.doc = withContent(this.doc, content, this.now());
    this.library.save(this.doc);
    this.onChange();
  }
}
