import type { LabelPatch } from "../overlay/ops";
import { CLASSES, type Gender, type LabelData, type Num } from "../overlay/types";
import { S } from "../strings";
import { el } from "./dom";

type Deps = {
  /** The word's current label, or undefined. */
  current: (wordId: string) => LabelData | undefined;
  wordText: (wordId: string) => string;
  apply: (wordId: string, patch: LabelPatch) => void;
};

/**
 * The panel next to a word where the child says what it is. Every choice applies at once;
 * choosing the same value again clears it. Nothing here suggests an answer.
 */
export class LabelPicker {
  private panel: HTMLElement | null = null;
  private wordId: string | null = null;

  constructor(private readonly host: HTMLElement, private readonly deps: Deps) {
    document.addEventListener("pointerdown", this.outside);
  }

  get openFor(): string | null {
    return this.wordId;
  }

  close(): void {
    this.panel?.remove();
    this.panel = null;
    this.wordId = null;
    this.host.dispatchEvent(new CustomEvent("picker-closed"));
  }

  open(wordId: string, anchor: DOMRect): void {
    this.close();
    this.wordId = wordId;
    const panel = el("div", { class: "picker", role: "dialog", "aria-label": S.pickerTitle(this.deps.wordText(wordId)) });
    this.panel = panel;
    this.build(panel);
    panel.addEventListener("keydown", (e) => {
      if (e.key === "Escape") {
        e.preventDefault();
        this.close();
      }
    });
    this.host.append(panel);
    // Place below the word, kept inside the page.
    const hostRect = this.host.getBoundingClientRect();
    const width = panel.offsetWidth;
    const left = Math.min(Math.max(anchor.left + anchor.width / 2 - hostRect.left - width / 2, 0), Math.max(0, hostRect.width - width));
    panel.style.left = `${left}px`;
    panel.style.top = `${anchor.bottom - hostRect.top + 8}px`;
    panel.querySelector<HTMLElement>("button")?.focus();
  }

  /** Repaint the pressed states after a change (also used after undo/redo). */
  refresh(): void {
    if (this.panel && this.wordId) this.build(this.panel);
  }

  private outside = (e: Event): void => {
    if (!this.host.isConnected) {
      document.removeEventListener("pointerdown", this.outside);
      return;
    }
    if (this.panel && !(e.target as Element | null)?.closest(".picker")) this.close();
  };

  private build(panel: HTMLElement): void {
    const id = this.wordId!;
    const cur = this.deps.current(id) ?? {};
    const toggle = <K extends keyof LabelPatch>(key: K, value: NonNullable<LabelPatch[K]>, on: boolean) => () =>
      this.choose(id, { [key]: on ? null : value } as LabelPatch);

    const classes = el(
      "div",
      { class: "picker-classes" },
      ...CLASSES.map((c) =>
        el("button", { class: `btn pick-class cls-${c}`, text: S.classLong[c], "aria-pressed": String(cur.cls === c), onclick: toggle("cls", c, cur.cls === c) }),
      ),
    );
    const row = <T extends string>(label: string, key: "gender" | "number", options: [T, string][], active: T | undefined) =>
      el(
        "div",
        { class: "picker-row" },
        el("span", { text: label }),
        ...options.map(([v, text]) =>
          el("button", { class: "seg", text, "aria-pressed": String(active === v), onclick: toggle(key, v as never, active === v) }),
        ),
      );

    const children: Node[] = [
      el("p", { class: "picker-title", text: S.pickerTitle(this.deps.wordText(id)) }),
      classes,
      row<Gender>(S.genderLabel, "gender", [["m", S.genderLong.m!], ["f", S.genderLong.f!]], cur.gender),
      row<Num>(S.numberLabel, "number", [["s", S.numberLong.s!], ["p", S.numberLong.p!]], cur.number),
    ];
    const actions = el("div", { class: "picker-actions" });
    if (cur.cls || cur.gender || cur.number) {
      actions.append(el("button", { class: "btn quiet", text: S.clearLabel, onclick: () => this.choose(id, { cls: null, gender: null, number: null }) }));
    }
    actions.append(el("button", { class: "btn quiet", text: S.closePicker, onclick: () => this.close() }));
    children.push(actions);
    panel.replaceChildren(...children);
  }

  private choose(wordId: string, patch: LabelPatch): void {
    const buttons = () => [...(this.panel?.querySelectorAll<HTMLElement>("button") ?? [])];
    const index = buttons().indexOf(document.activeElement as HTMLElement);
    this.deps.apply(wordId, patch);
    this.refresh();
    // The panel was rebuilt: keep keyboard focus on the same button.
    buttons()[Math.max(index, 0)]?.focus();
  }
}
