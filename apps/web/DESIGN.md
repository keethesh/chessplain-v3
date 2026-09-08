---
name: Chessplain
description: Quiet tournament editorial, with warm paper and muted green.
colors:
  canvas: "#f8f6f0"
  surface: "#fffdf8"
  surface-subtle: "#eeeae0"
  border: "#dcd6c9"
  border-strong: "#bdb5a4"
  ink: "#252a24"
  ink-secondary: "#62665d"
  ink-caption: "#707266"
  accent: "#52664c"
  accent-hover: "#354a32"
  accent-soft: "#e2e8db"
  error: "#9c3d30"
  error-soft: "#f5e5df"
  success: "#3f744c"
  success-soft: "#e4f0e5"
  board-dark: "#8b9b83"
  board-light: "#ede8dc"
typography:
  display:
    fontFamily: "Newsreader, Georgia, serif"
    fontSize: "48px"
    fontWeight: 450
    lineHeight: "52px"
  headline:
    fontFamily: "Newsreader, Georgia, serif"
    fontSize: "32px"
    fontWeight: 450
    lineHeight: "38px"
  body:
    fontFamily: "Arial, Helvetica, sans-serif"
    fontSize: "16px"
    lineHeight: "26px"
  label:
    fontFamily: "Arial, Helvetica, sans-serif"
    fontSize: "12px"
    lineHeight: "18px"
rounded:
  badge: "5px"
  control: "6px"
  panel: "12px"
spacing:
  small: "8px"
  medium: "16px"
  large: "24px"
  section: "48px"
components:
  button-primary:
    backgroundColor: "{colors.accent}"
    textColor: "{colors.surface}"
    rounded: "{rounded.control}"
    padding: "12px 20px"
  button-primary-hover:
    backgroundColor: "{colors.accent-hover}"
  button-secondary:
    rounded: "{rounded.control}"
    padding: "10px 16px"
  input:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.ink}"
    rounded: "{rounded.control}"
    padding: "12px 14px"
  card:
    backgroundColor: "{colors.surface}"
    rounded: "{rounded.panel}"
  badge-accent:
    backgroundColor: "{colors.accent-soft}"
    textColor: "{colors.accent}"
    rounded: "{rounded.badge}"
    padding: "4px 8px"
---

# Design System: Chessplain

## Overview

**Creative North Star: "Modern Tournament Editorial"**

Retain the scorebook and annotated-game character of the original direction. The implemented palette pairs warm paper with muted green, serif headlines, and restrained interface typography. The board and explanation carry the page; framing and controls support reading and checking an idea.

This source-derived record was refreshed on 2026-09-06. Rendered screenshots were unavailable during this pass; it is not a visual, accessibility, or cross-device certification.

**Key Characteristics:**

- Warm paper surfaces and muted green actions.
- Editorial serif headlines with plain sans-serif controls.
- One selected moment, with a board beside its explanation on wide screens.

## Colors

### Primary

Muted green is the action and emphasis color; its deeper variant signals hover and its pale tint supports badges. The chessboard uses a related green and warm neutral pairing. Played-move arrows use a separate terracotta accent (`#aa5939`).

### Neutral

Canvas, surface, and subtle surface separate the page, form, and teaching callouts. Ink has primary, secondary, and caption roles. Border tones distinguish structural separators from input outlines. Error and success pairs communicate explicit states. The stylesheet currently implements a light palette only; the historical dark theme is not implemented.

## Typography

Newsreader is loaded through `next/font/google` with swap behavior; Georgia is its fallback. Arial and Helvetica serve body text and controls. Chess notation uses `ui-monospace, Consolas, monospace` with tabular numerals.

Frontmatter records reusable type classes. The landing headline is a separate responsive treatment: weight 430, desktop size clamped between 48px and 72px, line height 1.02, and tight tracking. Report headlines also adapt by breakpoint. Keep body explanations comfortably readable rather than extending headline treatment into controls.

## Layout

The site container caps at 1160px with 40px side margins, reducing to 24px below 1000px and 16px below 380px. Landing hero, lesson, FAQ, and pricing layouts collapse to one column below 740px. Navigation drops its extra CTA at that breakpoint while retaining sample and pricing links.

The report uses its own max-width container, stacking board and explanation until the `lg` breakpoint (1024px). On larger screens the board is sticky at a 32px top offset. There is no sticky mobile mini-board. Moment selection appears above the board and resets continuation and alternative state.

## Elevation & Depth

Borders and tonal surfaces provide most depth. Global shadow tokens exist, but major landing and pricing panels are not lifted by default. Do not add shadows everywhere merely because the tokens exist. Exact shadow values and motion behavior are in `.impeccable/design.json`.

## Shapes

Panels use gently rounded corners; buttons and inputs have tighter corners, and badges are compact rounded rectangles. Report controls also use 8px corners. Chess squares remain a legible grid inside a rounded frame.

## Components

### Buttons and navigation

Primary buttons have a minimum height of 48px, green fill, and light text. Secondary buttons have a minimum height of 44px and outlined treatment. Disabled primary actions reduce opacity. Global keyboard focus uses a 2px green outline with 4px offset. Navigation uses text links with a minimum height of 44px and a serif wordmark with a line-drawn chess symbol.

### Inputs and method choices

Fields retain visible labels, minimum 48px height, and stronger borders. PGN input is a resizable monospace textarea. Submission method choices use `aria-pressed` and an accent underline; errors appear inline with alert semantics. Busy submission disables controls and changes the action label.

### Panels and badges

Forms and pricing use quiet bordered panels. Callouts use tonal fills. Badge colors indicate semantic states rather than decorative category variety.

### Interactive review

One moment card is selected at a time. Back and Continue advance legally replayed positions; an explicit control compares an alternative when available. Arrow keys operate within the continuation control region. Flip board is an explicit button, not a global F shortcut. Completed reports without moments have a recovery link; pending reports use a skeleton. The sample is illustrative, not a customer result.

## Do's and Don'ts

- **Do** keep the board, explanation, and next action legible.
- **Do** preserve visible focus, labels, semantic states, and reduced-motion behavior.
- **Do** use the implemented paper-and-green tokens when extending screens.
- **Don't** restore the historical ochre palette or imply a shipped dark mode.
- **Don't** claim WCAG conformance or visual verification without measurement.
- **Don't** use customer evidence or performance claims as decoration.
