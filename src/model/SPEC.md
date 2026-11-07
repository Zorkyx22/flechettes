---
id: model
type: module-design
status: draft
title: Document model
parent: architecture
---

# Document model

Pure logic, no browser APIs: what a text is, how it changes, and how undo works. It holds no linguistic knowledge (see the goal doc's principles).

## Responsibilities

- **Words as anchors.** A text is a sequence of word and separator tokens. A word is letters/digits joined by inner hyphens with an optional closing apostrophe, so `l'arbre` is `l'` + `arbre`. Each word has a stable id. Words are split only to give annotations something to attach to, never classified. *(Unconfirmed: `aujourd'hui` splits in two; revisit with the overlay.)*
- **Identity across edits.** After a writing-mode edit, words that did not change keep their id; changed or deleted words lose it, and every overlay item anchored to a lost id is dropped. Nothing else is touched. Correcting a word keeps its id, so arrows attached to it stay: they are the reason for the correction.
- **Corrections.** Rewriting a word records its first original and every replacement with a time. A corrected word is **atomic** in writing mode: it can be deleted as a unit (taking its corrections and anchored overlay with it) but not edited. *(Unconfirmed.)* Corrections are never linked to overlay items.
- **Title and size.** The text's name is its first line (up to the first newline) as it currently reads, corrections included; it is derived, never stored separately from the words. A pure split cuts the tokens at the first newline into a title part and a body part (a separator containing the newline is cut at it) so the interface can show them in two regions and join them again with one newline. A text also carries its type size (`m`, `l`, `xl`), outside undo, because it decides line and page breaks.
- **Overlay is opaque.** Overlay items (`id`, `kind`, `anchors`, optional `data`) belong to the correction-overlay module; this module only guarantees anchors are never dangling.
- **History.** Snapshot undo/redo over text, corrections and overlay together. Typing bursts within 800 ms share one step. History lives for the open session only.

## Speed

Reconciling a page edit trims the common prefix and suffix and runs a longest-common-subsequence only on the changed middle, so a keystroke in a long text stays cheap (tested: 4000 words under 50 ms).
