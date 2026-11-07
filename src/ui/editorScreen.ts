import type { Doc, TextSize } from "../model/types";
import type { Library } from "../storage/library";
import { S } from "../strings";
import { COLORS, labelsOf, type ColorKey } from "../overlay/types";
import { ArrowLayer, DASH } from "./arrowLayer";
import { LabelLayer } from "./labelLayer";
import { LabelPicker } from "./labelPicker";
import { PageFlow } from "./pages";
import { measure, OverlayScheduler } from "./placement";
import { createCorrectionSurface, type Tools } from "./correctionSurface";
import { el } from "./dom";
import { icon, type IconName } from "./icons";
import { EditorSession } from "./session";
import { applySettings, saveSettings, type Settings } from "./settings";
import { splitTitle } from "../model/doc";
import { locateByAttr, locateInText } from "./locators";
import { createWritingSurface } from "./writingSurface";

type Mode = "write" | "correct";

export function createEditorScreen(opts: {
  doc: Doc;
  library: Library;
  settings: Settings;
  goBack: () => void;
}): HTMLElement {
  const { library, settings } = opts;
  const session = new EditorSession(opts.doc, library);
  const writing = createWritingSurface(session);
  const tools: Tools = { tool: "identify", color: "blue", armed: null };
  const correcting = createCorrectionSurface(session, tools, () => syncTools(), (target) => openPicker(target));
  const paper = el("div", { class: "paper" });
  // The sheet is a clipped viewport onto the text flow; the pager turns its pages.
  const sheet = el("div", { class: "sheet" }, paper);
  const pageLabel = el("span", { class: "page-label", "aria-live": "polite" });
  const prevPage = el("button", { class: "btn icon", "aria-label": S.prevPage, title: S.prevPage, text: "‹", onclick: () => pages.go(pages.index - 1) });
  const nextPage = el("button", { class: "btn icon", "aria-label": S.nextPage, title: S.nextPage, text: "›", onclick: () => pages.go(pages.index + 1) });
  const pager = el("div", { class: "pager" }, prevPage, pageLabel, nextPage);
  const page = el("main", { class: "page" }, sheet, pager);
  let mode: Mode = "write";
  // Only caret movements turn the page by themselves; the pager buttons must not be undone by it.
  let followPending = false;
  const activeRoot = () => (mode === "write" ? writing.root : correcting.root);
  const pages = new PageFlow(sheet, activeRoot, (index, count) => {
    pageLabel.textContent = S.pageOf(index + 1, count);
    prevPage.disabled = index <= 0;
    nextPage.disabled = index >= count - 1;
    picker.close();
    scheduler.requestUpdate();
  });

  const wordText = (id: string) => session.content.tokens.find((t) => t.kind === "word" && t.id === id)?.text ?? "";
  const scheduler = new OverlayScheduler(
    sheet,
    () => session.content.overlay.length > 0,
    () => {
      const { title, body } = splitTitle(session.content.tokens);
      const ids = new Set(title.flatMap((t) => (t.kind === "word" ? [t.id] : [])));
      const locate = () =>
        mode === "write"
          ? new Map([...locateInText(writing.title, title), ...locateInText(writing.root, body)])
          : locateByAttr(correcting.band, correcting.root);
      return measure(sheet, activeRoot(), locate, { ids, shownPage: pages.index });
    },
    [(p) => layer.draw(p), (p) => labels.draw(p)],
    () => {
      pages.refresh();
      if (followPending && mode === "write") pages.followCaret(writing.root);
      followPending = false;
    },
  );
  const layer = new ArrowLayer(sheet, {
    content: () => session.content,
    erase: (id) => session.removeOverlay(id),
    requestUpdate: () => scheduler.requestUpdate(),
  });
  const picker = new LabelPicker(page, {
    current: (id) => labelsOf(session.content.overlay).get(id),
    wordText,
    apply: (id, patch) => session.setLabel(id, patch),
  });
  const labels = new LabelLayer(sheet, {
    content: () => session.content,
    open: (id, anchor) => openPickerFor(id, anchor),
  });

  function openPickerFor(id: string, anchor: DOMRect): void {
    picker.open(id, anchor);
    correcting.find(id)?.classList.add("armed");
  }
  function openPicker(target: HTMLElement): void {
    const id = target.dataset.w;
    if (id) openPickerFor(id, target.getBoundingClientRect());
  }
  page.addEventListener("picker-closed", () => {
    for (const n of sheet.querySelectorAll(".armed")) n.classList.remove("armed");
  });

  /** A large rail button: icon plus a name (the name is hidden on narrow screens but stays as the accessible label). */
  const railBtn = (name: IconName, text: string, onclick: () => void): HTMLButtonElement => {
    const b = el("button", { class: "rail-btn", "aria-label": text, title: text, onclick });
    b.append(icon(name), el("span", { class: "rail-label", text }));
    return b;
  };
  const undoBtn = railBtn("undo", S.undo, () => undoOrRedo(false));
  const redoBtn = railBtn("redo", S.redo, () => undoOrRedo(true));
  const writeBtn = railBtn("write", S.modeWrite, () => setMode("write"));
  const correctBtn = railBtn("correct", S.modeCorrect, () => setMode("correct"));
  const hint = el("p", { class: "hint", text: S.correctHint });

  const identifyBtn = railBtn("identify", S.toolIdentify, () => setTool("identify"));
  const arrowBtn = railBtn("arrow", S.toolArrow, () => setTool("arrow"));
  const rewriteBtn = railBtn("rewrite", S.toolRewrite, () => setTool("rewrite"));
  const palette = el("div", { class: "palette", role: "group", "aria-label": S.toolArrow });
  const swatches = COLORS.map((c) => swatch(c));
  palette.append(...swatches);
  // Order: Identifier, Flèche (with its colors), Réécrire.
  const toolbar = el("div", { class: "rail-tools", role: "group" }, identifyBtn, arrowBtn, palette, rewriteBtn);

  function swatch(color: ColorKey): HTMLButtonElement {
    const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
    svg.setAttribute("viewBox", "0 0 44 14");
    svg.setAttribute("width", "44");
    svg.setAttribute("height", "14");
    const line = document.createElementNS("http://www.w3.org/2000/svg", "path");
    line.setAttribute("d", "M 2 7 L 42 7");
    line.setAttribute("class", `arrow arrow-${color}`);
    if (DASH[color]) line.setAttribute("stroke-dasharray", DASH[color]);
    svg.append(line);
    const b = el("button", { class: "swatch", title: S.colorNames[color], "aria-label": S.colorNames[color], onclick: () => {
      tools.color = color;
      syncTools();
    } });
    b.append(svg);
    b.dataset.color = color;
    return b;
  }

  function setTool(next: Tools["tool"]): void {
    correcting.disarm();
    correcting.close();
    layer.select(null);
    picker.close();
    tools.tool = next;
    syncTools();
  }

  function syncTools(): void {
    rewriteBtn.setAttribute("aria-pressed", String(tools.tool === "rewrite"));
    arrowBtn.setAttribute("aria-pressed", String(tools.tool === "arrow"));
    identifyBtn.setAttribute("aria-pressed", String(tools.tool === "identify"));
    palette.hidden = tools.tool !== "arrow";
    for (const b of swatches) b.setAttribute("aria-pressed", String(b.dataset.color === tools.color));
    hint.textContent =
      tools.tool === "rewrite" ? S.correctHint : tools.tool === "identify" ? S.identifyHint : tools.armed ? S.arrowTo : S.arrowFrom;
    paper.dataset.tool = tools.tool;
    sheet.dataset.tool = tools.tool;
  }

  const followCaret = () => {
    followPending = true;
    scheduler.requestUpdate();
  };
  writing.root.addEventListener("input", followCaret);
  // The title lives on the first sheet: writing in it turns back to page 1.
  writing.title.addEventListener("focus", () => pages.go(0));
  const onSelection = () => {
    if (!sheet.isConnected) return document.removeEventListener("selectionchange", onSelection);
    if (mode === "write" && writing.root.contains(window.getSelection()?.anchorNode ?? null)) followCaret();
  };
  document.addEventListener("selectionchange", onSelection);
  const onPageKey = (e: KeyboardEvent) => {
    if (!sheet.isConnected) return window.removeEventListener("keydown", onPageKey);
    if (e.key === "PageDown" || e.key === "PageUp") {
      e.preventDefault();
      pages.go(pages.index + (e.key === "PageDown" ? 1 : -1));
    }
  };
  window.addEventListener("keydown", onPageKey);

  const syncButtons = () => {
    undoBtn.disabled = !session.canUndo;
    redoBtn.disabled = !session.canRedo;
  };
  session.onChange = () => {
    syncButtons();
    scheduler.requestUpdate();
  };

  function undoOrRedo(redo: boolean): void {
    const c = redo ? session.redo() : session.undo();
    if (!c) return;
    if (mode === "write") writing.render();
    else {
      correcting.render();
      syncTools();
    }
    layer.select(null);
    picker.refresh();
    scheduler.requestUpdate();
  }

  function setMode(next: Mode): void {
    mode = next;
    writeBtn.setAttribute("aria-pressed", String(next === "write"));
    correctBtn.setAttribute("aria-pressed", String(next === "correct"));
    paper.dataset.mode = next;
    hint.style.visibility = next === "correct" ? "visible" : "hidden";
    toolbar.hidden = next !== "correct";
    layer.setInteractive(next === "correct");
    picker.close();
    if (next === "write") {
      correcting.disarm();
      correcting.close();
      writing.render();
      paper.replaceChildren(...writing.elements);
      writing.focus();
    } else {
      (document.activeElement as HTMLElement | null)?.blur();
      correcting.render();
      paper.replaceChildren(...correcting.elements);
      syncTools();
    }
    scheduler.requestUpdate();
  }

  const panel = el("div", { class: "panel", hidden: true });
  const choice = <T extends string>(label: string, current: () => T, set: (v: T) => void, options: [T, string][]) => {
    const row = el("div", { class: "choice" }, el("span", { text: label }));
    const buttons = options.map(([value, text]) =>
      el("button", {
        class: "seg",
        text,
        "aria-pressed": String(current() === value),
        onclick: () => {
          set(value);
          scheduler.requestUpdate();
          for (const b of buttons) b.setAttribute("aria-pressed", String(b.textContent === text));
        },
      }),
    );
    row.append(...buttons);
    return row;
  };
  sheet.dataset.size = session.doc.textSize;
  panel.append(
    choice<Settings["paper"]>(S.paper, () => settings.paper, (v) => {
      settings.paper = v;
      applySettings(settings);
      saveSettings(settings);
    }, [["lined", S.paperLined], ["plain", S.paperPlain]]),
    choice<TextSize>(S.size, () => session.doc.textSize, (v) => {
      session.setTextSize(v);
      sheet.dataset.size = v;
    }, [["m", S.sizeM], ["l", S.sizeL], ["xl", S.sizeXL]]),
    el("button", { class: "btn quiet", text: S.close, onclick: () => (panel.hidden = true) }),
  );

  const backBtn = railBtn("back", S.back, async () => {
    await library.flush();
    opts.goBack();
  });
  const settingsBtn = railBtn("settings", S.settings, () => (panel.hidden = !panel.hidden));
  const rail = el(
    "nav",
    { class: "rail", "aria-label": S.appName },
    backBtn,
    el("div", { class: "rail-group", role: "group" }, writeBtn, correctBtn),
    toolbar,
    el("div", { class: "rail-bottom" }, undoBtn, redoBtn, settingsBtn),
  );

  const stage = el("div", { class: "stage" }, hint, page);
  const screen = el("div", { class: "screen editor" }, rail, stage, panel);
  screen.addEventListener("keydown", (e) => {
    if (e.key === "Escape" && tools.armed) correcting.disarm();
  });
  syncTools();
  setMode("write");
  syncButtons();
  return screen;
}
