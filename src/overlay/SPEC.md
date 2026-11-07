---
id: overlay
type: module-design
status: draft
title: "Correction overlay: arrows and labels"
parent: architecture
depends-on: [model]
---

# Correction overlay: arrows and labels

What the child can attach to words, and how it is placed. Everything here is made by the child's own action; nothing is inferred from the text (see the goal doc's principles). Screens and gestures live in `editor-ui`.

## The arrow

An overlay item of kind `arrow` with two anchors, **from** and **to** (word ids, always existing and distinct), and data `{ side: above | below, color }`. Color is one of five palette **keys** (`blue`, `red`, `green`, `orange`, `purple`), never CSS, so imported files cannot inject styles. Each color also has its own dash pattern so arrows stay distinguishable without hue. *(Unconfirmed.)*

- Adding the same link (same words, direction and side) again does nothing; a different side or direction is a different arrow.
- Arrows are removed when either word is changed or deleted in writing mode (the `model` rule); correcting a word in correction mode keeps them.
- Arrows are not linked to corrections.

## The label

An overlay item of kind `label` with one anchor (a word id) and data `{ cls?, gender?, number? }`: `cls` one of ten fixed keys (`nom`, `verbe`, `adjectif`, `determinant`, `pronom`, `adverbe`, `preposition`, `conjonction`, `nom_propre`, `interjection`), `gender` `m|f`, `number` `s|p`. At least one field is set, any combination is valid, and a word has at most one label. Setting a field to nothing clears it, and the label disappears when none is left. A label is removed with its word under the same anchor rule as arrows; correcting the word keeps it. The computer never suggests or checks a label.

## Layout (pure)

**Tags:** each tag stays exactly centred over its word and is never moved sideways, so it is always clear which word it belongs to. When two tags on one line would touch, they get narrower (down to 60% of their size) instead: each tag may be at most as wide as the distance to the nearest neighbouring centre, minus a gap. Beyond that floor tags may overlap slightly on very short neighbouring words *(known limit)*. Stacking above a word, from the word upward: crossed-out original, new word, then a thin lane (0.45 × the text size) for above-arrows, then the bubble (one line, or two with gender and number). Arrows are lower on the page than the bubbles: above-arrows hug the words, with small rises and level steps, and on a tagged word they land at the side of the word that faces the other end, leaving the middle to the bubble. The bubble keeps its place whether or not the word has an arrow. Arrows below the words keep their larger rises. *(Known limit: a second, nested above-arrow on the same stretch is only a few pixels higher and can touch the bubbles.)*

**Arrows:**

Given word rectangles, the line height and the text's left/right edges, produce paths:

- **Same line:** one cubic arc leaving the word's top (above) or bottom (below) centre, head on the target.
- **Different lines:** two stubs. The arrow leaves its word towards the margin and enters at the opposite margin on the target's line, ending in a head; both stubs carry a dot where they meet the margin. Forward links exit right and enter left; backward links the reverse.
- **Levels:** arrows on the same line and side are stacked: shortest spans first, each at the lowest level where it does not overlap one already placed; height grows per level and is capped. With the page written on every other row, about two levels fit before arrows start to touch neighbouring lines. *(Known limit.)*
- Lines are identified by clustering word positions, so uneven line boxes (corrections) cannot split a line.
- **Pages.** Words carry their page (relative to the visible sheet) and a line key unique per page and row. A link between pages uses the margin stubs: it leaves through its own page's margin and enters through the target page's margin (shifted by one sheet width per page). Tags are nudged per page with that page's edges.

## Drawing and speed

One SVG over the page. It reads layout once per animation frame after a change (content, resize, settings, fonts), never while typing. Only arrow hit-paths take pointer events, and only in correction mode. 100 arrows lay out well under a frame (tested under 20 ms for the pure part). *(Unconfirmed end to end.)*

## Writing mode vs correction mode

Tags and arrows both draw from one measurement. Words are located by their element in correction mode, and by walking the text nodes against the token list in writing mode. If the page and tokens disagree, no arrows are drawn rather than a wrong one.
