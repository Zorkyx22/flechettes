---
id: editor-ui
type: module-design
status: draft
title: "Editor UI: list, rail, sheet, writing and correction modes"
parent: architecture
depends-on: [model, storage, overlay]
---

# Editor UI: list, rail, sheet, writing and correction modes

The screens a child sees, plus sign-in and account management. French only; every string lives in `src/strings.ts`. *(Unconfirmed: translation is out of scope.)*

## Screens

- **Sign-in.** A login screen, and a one-time first-run setup that creates the administrator, gate the app (see `server`). A persistent **account bar** shows who is signed in, a saving indicator (saving / saved / offline), logout, and a **Manage** link for teachers and admins. Sessions auto-logout when idle; logout clears the local cache once synced; auth transitions reload for clean state. On first sign-in in a browser that still holds old local texts, a one-time offer imports them into the account.
- **Account management** (`#/gestion`, teachers and admins only; not reachable by students). Admin: create/disable teacher accounts and reset their passwords. Teacher: create classes, create/disable students, reset their passwords, and set each student's class.
- **My texts.** Newest first, title and date. New text, delete (confirmation, then bin), bin with restore. Route is the URL hash; opening a missing or binned text returns to the list with a neutral message. (Child-facing backup export/import was removed — the server auto-saves; see `storage`.)
- **Editor.** A **left rail** and the sheet. The rail is one vertical bar, stable in both modes: back to the list, the J'écris / Je corrige switch, the tools (correction mode only: Identifier, Flèche with its colors, Réécrire, in that order; a text opens on Identifier and keeps the last tool while open), and undo/redo/settings pinned at the bottom, so hiding the tools moves nothing. On narrow screens the rail keeps its place and shrinks to icons (names stay as accessible labels). A hint line above the sheet has reserved height. Settings: paper (Lignée or Blanc; a device setting, cosmetic; a stored "Seyès" loads as Lignée) and text size (three steps; saved with the text because it changes the line and page breaks).
- **The sheet.** A 24×32 grand cahier, portrait, sized by the available width, with everything inside in container-width units so it looks and wraps the same at any screen width. *(Unconfirmed: sub-pixel text layout could still shift a wrap at some sizes; same break verified at two widths in Chromium.)* On a short screen the sheet is taller than the window and scrolls vertically; fitting the whole sheet to the height was not chosen.
- **Pages.** The text is one multi-column flow, one column per sheet, clipped by the sheet (which paints the paper, ruling and margin); turning a page slides the flow sideways. The pager shows "Page n / N" with previous/next (PageUp/PageDown too). Only caret movement turns the page by itself (the browser does not scroll a clipped flow to the caret), so pressing the pager is never undone. No blank pages: a page appears when text overflows and disappears when emptied. Selecting by dragging across a page turn is not possible. Playwright's own box model is wrong inside CSS columns; measure in the page when testing.
- **Title zone.** An unruled band at the top of every sheet, about 3 cm of the 32 cm (12.5% of the sheet width); ruling starts under it. On the first sheet the title is written there, centered, bold and larger; later sheets keep the same empty band (every page is laid out identically because the columns are). The title is still the first line of the text and is annotated like any other words. It has its own editing region: Enter (or a pasted line break, which becomes a space) never adds a newline to the title; Enter, Right/Down at its end move to the body; Up/Left at the body's very start return to the title; Backspace at the body's start or Delete at the title's end join the first body line onto the title. A selection cannot be dragged across title and body. Focusing the title turns to page 1; its band is hidden on other pages and its words count as page 1 for overlays. Hint while empty: "Écris ton titre, puis appuie sur Entrée." *(Unconfirmed: band height; text-area-wide centering with a long wrapped title shows up to the band height.)*

## Writing mode

- The body is one `contenteditable="plaintext-only"` flow on the sheet, with the title zone as its top padding. **Lined paper** is one light line under every line of writing (the writing sits on it) and one bold red margin line; **plain paper** has neither. There is no grid and no sub-lines (an earlier Seyès grid was judged too busy). Text lines are two rows tall so arrows and tags have room above and below; only one ruled line per text line is drawn.
- Arrows and tags from correction mode show **faintly** and cannot be touched here.
- **No assistance.** Spellcheck, autocorrect, autocapitalize, autocomplete, writing suggestions and extension hooks are switched off; the page itself transforms nothing. **Accepted limitation:** some on-screen keyboards show their own suggestions, which a web page cannot disable. *(Unconfirmed: to test on Chromebooks.)*
- **Paste** is refused unless the clipboard carries our own marker set on copy/cut; the refusal is a neutral message. Drop and drag are blocked.
- Browser undo is replaced by the model's history so one history covers both modes.
- Corrected words appear as the crossed-out original with the new word above it (HTML ruby).

## Correction mode

- The text cannot be typed into. Tapping or keyboard-activating a word opens a small input over it; Enter or leaving the field commits, Escape cancels. Empty or unchanged input is ignored.
- The rail's tools pick **Identify**, **Arrow** or **Rewrite**, so a tap always means one thing. With Arrow, a small always-visible column of colors appears under it. *(Palette placement was first requested in a "more control" tier, then replaced by always visible; unconfirmed.)*
- **Drawing:** tap the start word (highlighted), then the end word: upper half of the end word draws the arrow above the line, lower half below. Same word, Escape or changing tool cancels. A keyboard activation on the end word draws below.
- **Erasing:** tap an arrow to select it; "Effacer" appears near it; Delete/Backspace on a focused arrow also erases. Drawing and erasing are single undo steps.
- **Identify** opens a picker beside the tapped word (or its tag): ten word classes, then masculin/féminin and singulier/pluriel. Each choice applies at once as one undo step; choosing a set value again clears it; "Effacer l'étiquette" clears all; Escape or tapping elsewhere closes. Tags are short bubbles of **letters** above the word, centred on it: the class code on the first line (N, V, Adj, Dét, Pr, Adv, Prép, Conj, NP, Int) and gender m/f and number s/p as a second, smaller line of the same bubble, e.g. "N" over "f p" (a class alone, or gender/number alone, is one line); the picker and the tooltip use the full names. A two-line bubble is taller. Arrows above the words run in the thin lane between the words and the bubbles, lower on the page than the bubbles. Class colors are fixed and the class code is always shown too. *(Unconfirmed: the ten colors.)*
- **Layers.** Arrows (SVG) and tags (HTML) are drawn over the sheet from one layout read per animation frame, in coordinates relative to the visible sheet (words on another page sit one sheet-width away); the first line has headroom so tags and arrows fit above it. Tags show faintly in writing mode and cannot be touched there. A link between pages leaves through the right (or left) margin of its page and enters through the margin of the target's page, visible once that page is turned to.
- Text is only ever rendered as text, never as markup.

## Verification

Model (including the title split), storage and overlay layout (including pages) are unit-tested, and the server (auth, roles, texts, account management) is unit- and HTTP-tested (see `server`). The UI was verified end to end in Chromium against the production build: editing, the title zone (centering, key handling, hidden on other pages), arrows, labels and pages (overflow onto page 2, caret following, pager keys, same break at two widths, tag plus cross-page arrow, reload, shrinking back to one page). Those scripts are not yet in the repository.
