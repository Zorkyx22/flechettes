import { el } from "./dom";

let current: HTMLElement | null = null;
let timer: ReturnType<typeof setTimeout> | undefined;

/** A short, neutral message. Never used to comment on what a child wrote. */
export function toast(message: string): void {
  current?.remove();
  clearTimeout(timer);
  current = el("div", { class: "toast", role: "status", text: message });
  document.body.append(current);
  timer = setTimeout(() => current?.remove(), 3500);
}

export function confirmDialog(opts: { title: string; help?: string; yes: string; no: string }): Promise<boolean> {
  return new Promise((resolve) => {
    const dialog = el("dialog", { class: "ask" });
    const finish = (answer: boolean) => {
      dialog.close();
      dialog.remove();
      resolve(answer);
    };
    dialog.append(el("h2", { text: opts.title }));
    if (opts.help) dialog.append(el("p", { text: opts.help }));
    dialog.append(
      el(
        "div",
        { class: "row" },
        el("button", { class: "btn quiet big", text: opts.no, onclick: () => finish(false) }),
        el("button", { class: "btn danger big", text: opts.yes, onclick: () => finish(true) }),
      ),
    );
    dialog.addEventListener("cancel", () => resolve(false));
    document.body.append(dialog);
    dialog.showModal();
  });
}

/** A single-field modal prompt. Resolves the entered value, or null if cancelled. */
export function promptDialog(opts: {
  title: string;
  label: string;
  type?: string;
  ok: string;
  cancel: string;
}): Promise<string | null> {
  return new Promise((resolve) => {
    const dialog = el("dialog", { class: "ask" });
    const input = el("input", { type: opts.type ?? "text", class: "prompt-input" });
    const finish = (answer: string | null) => {
      dialog.close();
      dialog.remove();
      resolve(answer);
    };
    const form = el(
      "form",
      { class: "prompt" },
      el("h2", { text: opts.title }),
      el("label", { text: opts.label }),
      input,
      el(
        "div",
        { class: "row" },
        el("button", { class: "btn quiet big", type: "button", text: opts.cancel, onclick: () => finish(null) }),
        el("button", { class: "btn primary big", type: "submit", text: opts.ok }),
      ),
    );
    form.addEventListener("submit", (e) => {
      e.preventDefault();
      finish(input.value);
    });
    dialog.append(form);
    dialog.addEventListener("cancel", () => resolve(null));
    document.body.append(dialog);
    dialog.showModal();
    input.focus();
  });
}
