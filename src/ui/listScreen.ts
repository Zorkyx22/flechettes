import { exportDocs, ImportError, LIMITS, parseExport } from "../storage/exchange";
import { BIN_DAYS, type Library } from "../storage/library";
import type { Meta } from "../storage/store";
import { S } from "../strings";
import { el } from "./dom";
import { confirmDialog, toast } from "./toast";

const DAY = 86_400_000;
const dateFormat = new Intl.DateTimeFormat("fr-FR", { day: "numeric", month: "long", hour: "2-digit", minute: "2-digit" });

function download(name: string, content: string): void {
  const url = URL.createObjectURL(new Blob([content], { type: "application/json" }));
  const a = el("a", { href: url, download: name });
  document.body.append(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export function createListScreen(opts: { library: Library; open: (id: string) => void }): HTMLElement {
  const { library } = opts;
  const list = el("ul", { class: "cards" });
  const binList = el("ul", { class: "cards" });
  const binSection = el("section", { class: "bin", hidden: true });
  const binToggle = el("button", { class: "btn quiet" });

  async function exportIds(ids: string[], name: string): Promise<void> {
    await library.flush();
    const docs = [];
    for (const id of ids) {
      const d = await library.open(id);
      if (d) docs.push(d);
    }
    download(name, exportDocs(docs));
    toast(S.exportNote);
  }

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
        el("button", { class: "btn quiet", text: S.saveOne, onclick: () => void exportIds([m.id], `${name}.json`) }),
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

  const fileInput = el("input", { type: "file", accept: ".json,application/json", hidden: true });
  fileInput.addEventListener("change", async () => {
    const file = fileInput.files?.[0];
    fileInput.value = "";
    if (!file) return;
    try {
      if (file.size > LIMITS.fileBytes) throw new ImportError("too large");
      const count = await library.importDocs(parseExport(await file.text()));
      toast(S.importDone(count));
      refresh();
    } catch (e) {
      if (e instanceof ImportError) toast(S.importFailed);
      else throw e;
    }
  });

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
    el(
      "footer",
      { class: "tools" },
      el("button", {
        class: "btn quiet",
        text: S.saveAll,
        onclick: () => void exportIds(library.list().map((m) => m.id), "fléchettes-sauvegarde.json"),
      }),
      el("button", { class: "btn quiet", text: S.openBackup, onclick: () => fileInput.click() }),
      binToggle,
      fileInput,
    ),
    binSection,
  );
  refresh();
  return screen;
}
