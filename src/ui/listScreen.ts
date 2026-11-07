import { BIN_DAYS, type Library } from "../storage/library";
import type { Meta } from "../storage/store";
import { S } from "../strings";
import { el } from "./dom";
import { confirmDialog } from "./toast";

const DAY = 86_400_000;
const dateFormat = new Intl.DateTimeFormat("fr-FR", { day: "numeric", month: "long", hour: "2-digit", minute: "2-digit" });

export function createListScreen(opts: { library: Library; open: (id: string) => void }): HTMLElement {
  const { library } = opts;
  const list = el("ul", { class: "cards" });
  const binList = el("ul", { class: "cards" });
  const binSection = el("section", { class: "bin", hidden: true });
  const binToggle = el("button", { class: "btn quiet" });

  function refresh(): void {
    const items = library.list();
    list.replaceChildren(
      ...(items.length === 0
        ? [el("li", { class: "empty", text: S.noTexts })]
        : items.map((m) => card(m, false))),
    );
    const binned = library.bin();
    binToggle.textContent = `${S.bin} (${binned.length})`;
    binList.replaceChildren(
      ...(binned.length === 0 ? [el("li", { class: "empty", text: S.binEmpty })] : binned.map((m) => card(m, true))),
    );
  }

  function card(m: Meta, binned: boolean): HTMLElement {
    const name = m.title === "" ? S.untitled : m.title;
    if (!binned) {
      return el(
        "li",
        { class: "card" },
        el(
          "button",
          { class: "card-main", onclick: () => opts.open(m.id) },
          el("strong", { text: name }),
          el("small", { text: dateFormat.format(m.updatedAt) }),
        ),
        el("button", {
          class: "btn quiet",
          text: S.deleteText,
          onclick: async () => {
            if (await confirmDialog({ title: S.deleteAsk, help: S.deleteAskHelp, yes: S.deleteYes, no: S.deleteNo })) {
              await library.trash(m.id);
              refresh();
            }
          },
        }),
      );
    }
    const left = Math.max(0, Math.ceil(((m.deletedAt ?? 0) + BIN_DAYS * DAY - Date.now()) / DAY));
    return el(
      "li",
      { class: "card" },
      el("div", { class: "card-main static" }, el("strong", { text: name }), el("small", { text: S.daysLeft(left) })),
      el("button", {
        class: "btn",
        text: S.restore,
        onclick: async () => {
          await library.restore(m.id);
          refresh();
        },
      }),
      el("button", {
        class: "btn quiet",
        text: S.eraseNow,
        onclick: async () => {
          if (await confirmDialog({ title: S.eraseAsk, yes: S.eraseYes, no: S.eraseNo })) {
            await library.erase(m.id);
            refresh();
          }
        },
      }),
    );
  }

  binToggle.addEventListener("click", () => (binSection.hidden = !binSection.hidden));
  binSection.append(el("p", { class: "help", text: S.binHelp }), binList);

  const screen = el(
    "div",
    { class: "screen library" },
    el("header", { class: "bar" }, el("h1", { text: S.myTexts })),
    el(
      "div",
      { class: "actions" },
      el("button", {
        class: "btn primary big",
        text: `+ ${S.newText}`,
        onclick: async () => opts.open((await library.create()).id),
      }),
    ),
    list,
    el("footer", { class: "tools" }, binToggle),
    binSection,
  );
  refresh();
  return screen;
}
