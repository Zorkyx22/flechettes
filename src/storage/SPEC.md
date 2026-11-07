---
id: storage
type: module-design
status: draft
title: Local storage, bin and backup
parent: architecture
depends-on: [model, overlay]
---

# Local storage, bin and backup

Everything a child writes stays in the browser (IndexedDB). Nothing here uses the network.

## Responsibilities

- **Library.** The list of texts lives in memory (title, dates, bin state), kept in its own store beside the texts, so the list screen never opens a text. `save` returns immediately; writes are debounced (400 ms) and `flush` forces them when the tab is hidden or closed, or before leaving a text.
- **Schema.** Versioned; migrations happen in the upgrade hook and never by dropping data. Version 2 moved the title onto the page: a text that had a stored title gets it written in front of its words (new word ids; overlay anchors untouched) and a default type size. Version 1 backup files are migrated the same way on import; version 2 files must carry a valid type size and their stored title is ignored in favour of the derived one.
- **Bin.** Deleting moves a text to the bin; it can be restored for **7 days** and is erased when the app next opens after that. Chosen over longer retention because child data should not linger (security first).
- **Backup.** Export is a JSON file of one or all texts. It is **unencrypted** (the UI says to keep it private) and never contains bin state. Import is untrusted input: strict schema check, size and count limits, word and overlay ids validated, everything rebuilt field by field. Overlay items must be arrows (two distinct existing words, enumerated side and color) or labels (one existing word, known class/gender/number, at most one per word) as defined in `overlay`; any other kind is rejected. Imported texts never overwrite: a clashing id gets a new one.

## Accepted limitations

- Anyone with the browser profile can read the texts (shared school computers). To be revisited with accounts.
- Undo history is not saved across sessions.
