---
id: goal-and-requirements
type: goal-and-requirements
status: active
title: Flechettes — learn to write without mistakes
---

# Flechettes

A web text editor where French-speaking children write freely, then correct their own text by hand using the grammar-analysis techniques taught at school.

## Overview

Two modes over one text: **writing mode** and **correction mode**. The tool never judges the text. All analysis (arrows, word-class labels) is made by the child, as on paper.

## Problem

In French schooling, children learn to fix spelling, agreement and conjugation by reasoning about how words relate (determiner and adjective to noun, subject pronoun to verb) and applying the rules that follow. Spellcheckers, autocomplete and error highlighting replace that reasoning with the machine's answer, and make mistakes jump out in a way paper never does. Children need a digital place to write and practise the reasoning themselves.

## Principles

- **The computer never corrects, suggests or detects.** No autocomplete, spellcheck, grammar check, error underlines, or automatic word-type recognition, in either mode. Mistakes are as invisible as on paper.
- **Annotations are human-made.** Every arrow, label and edit comes from the child's action.
- **The child's reasoning is preserved.** The original text, the annotation overlay and the corrections made afterwards stay distinguishable, so a teacher can later read the process, not just the result.

## Target Users

- **Student** (French primary/secondary school) writing and correcting their own texts.
- **Teacher** who signs in to provision and manage their own students and classes. (Collecting and reading students' texts is not yet built.)
- **Administrator** who provisions teacher accounts and runs the server.

## Capabilities

- **My texts** — a list of the child's texts, each named by its first line; create, open, delete to a 7-day bin, restore.
- **Writing mode** — free typing on a real notebook sheet (a 24×32 grand cahier: lined paper with one line per line of writing and a red margin, or plain), with none of the assistance listed in Principles. The first line is the title, written centered in an unruled band at the top of the sheet. Pasting is limited to text copied from within Flechettes.
- **Pages** — when a sheet fills, writing continues on the next; one sheet is visible at a time and the child turns pages. The sheet looks and breaks lines the same at every screen size, and each text carries its own type size, so a teacher sees exactly what the child saw.
- **Switch between modes** at any time on the same text, with undo/redo across both.
- **Correction mode** — a tool rail on the left offers Identify (the default), Arrow and Rewrite; with Rewrite the child selects a word and rewrites it; the old word stays crossed out with the new one above it, as on paper. Arrows and word labels are separate capabilities below.
- **Arrows** — in correction mode the child links two words with an arrow (determiner or adjective to its noun, pronoun to its verb, ...), above or below the line, in a chosen color, and can erase or undo it. Arrows show faintly in writing mode. The page is written on every other ruled row to leave room, and arrows work across a page turn.
- **Identify word** — in correction mode the child tells what a word is: one of ten word classes (nom, verbe, adjectif, déterminant, pronom, adverbe, préposition, conjonction, nom propre, interjection), and optionally gender and number, each chosen by hand. A small bubble of letters sits exactly above the word: the class code on top, and gender and number as a second, smaller line (for a feminine plural noun, "N" over "f p"), colored by class. Tags show faintly in writing mode.
- **Accounts and roles** — everyone signs in; administrator, teacher and student roles gate what each can do (student: own texts; teacher: manage own students and classes; administrator: manage teachers). Deny by default; see `architecture`.
- **Server storage** — texts, overlays and corrections are stored per student on a self-contained LAN server and auto-saved, so a student signs in from any computer on the network and their work follows them. Writing stays instant and tolerates a brief server outage; nothing to export before leaving.
- **Simple appearance settings** — paper type (lined or plain; a device setting) and text size (saved with each text).

## Non-Goals

- Any automatic correction, detection or suggestion of linguistic content.
- Any dependence on external/third-party services or APIs — the server is fully self-contained.

## Technology

| Aspect | Choice | Rationale |
|---|---|---|
| Platform | TypeScript web app | Requested: web-based; specifics chosen in `architecture.md` |
