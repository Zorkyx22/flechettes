import type { Content } from "./types";

/** Snapshot undo/redo. Content is immutable, so a snapshot is just a reference. */
export class History {
  private past: Content[] = [];
  private future: Content[] = [];
  private lastPushAt = 0;

  constructor(
    private current: Content,
    private readonly coalesceMs = 800,
    private readonly limit = 200,
  ) {}

  get content(): Content {
    return this.current;
  }

  get canUndo(): boolean {
    return this.past.length > 0;
  }

  get canRedo(): boolean {
    return this.future.length > 0;
  }

  /** Record a change. Typing bursts (`coalesce`) within the window share one undo step. */
  commit(next: Content, now: number, coalesce: boolean): void {
    if (next === this.current) return;
    const merge = coalesce && this.past.length > 0 && now - this.lastPushAt < this.coalesceMs;
    if (!merge) {
      this.past.push(this.current);
      if (this.past.length > this.limit) this.past.shift();
    }
    this.lastPushAt = now;
    this.current = next;
    this.future = [];
  }

  undo(): Content | null {
    const prev = this.past.pop();
    if (!prev) return null;
    this.future.push(this.current);
    this.current = prev;
    this.lastPushAt = 0;
    return prev;
  }

  redo(): Content | null {
    const next = this.future.pop();
    if (!next) return null;
    this.past.push(this.current);
    this.current = next;
    this.lastPushAt = 0;
    return next;
  }
}
