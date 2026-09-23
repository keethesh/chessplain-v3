---
name: Chessplain
description: Evidence-first game review for the move that changed everything.
colors:
  graphite: "#111310"
  panel: "#191d19"
  panel-raised: "#20261f"
  rule: "#343b32"
  text: "#f0f1e9"
  muted: "#aab1a3"
  lime: "#c9f36d"
  lime-soft: "#dff5a2"
  coral: "#ff725c"
  cream: "#e9e8dc"
  board-light: "#d9dfca"
  board-dark: "#566956"
typography:
  display:
    fontFamily: "IBM Plex Sans, system-ui, sans-serif"
    fontSize: "clamp(52px, 6.5vw, 88px)"
    fontWeight: 600
    lineHeight: "0.98"
    letterSpacing: "-0.035em"
  body:
    fontFamily: "IBM Plex Sans, system-ui, sans-serif"
    fontSize: "15px"
    fontWeight: 400
    lineHeight: "1.5"
  label:
    fontFamily: "IBM Plex Mono, ui-monospace, monospace"
    fontSize: "12px"
    fontWeight: 500
    lineHeight: "1.45"
rounded:
  control: "4px"
  panel: "6px"
spacing:
  small: "8px"
  medium: "16px"
  large: "32px"
  section: "68px"
components:
  button-primary:
    backgroundColor: "{colors.lime}"
    textColor: "{colors.graphite}"
    rounded: "{rounded.control}"
    padding: "0 18px"
    height: "54px"
  button-primary-hover:
    backgroundColor: "{colors.lime-soft}"
  input:
    backgroundColor: "{colors.panel}"
    textColor: "{colors.text}"
    rounded: "{rounded.control}"
    padding: "0 16px"
    height: "54px"
  analysis-panel:
    backgroundColor: "{colors.panel}"
    rounded: "{rounded.panel}"
    padding: "14px"
---

# Design System: Chessplain

## Overview

**Creative North Star: "The Forensic Match Report"**

Chessplain is an evidence-first debrief for a player who knows a move felt wrong and wants to understand why. The interface belongs to the analysis room, not a wellness app and not an engine cockpit. Every visual element should point to a concrete fact: a square, a move, a threat, a consequence, or a question to carry into the next game.

The first surface creates curiosity through tension, then earns trust through correct chess evidence. A valid board, readable notation, and linked annotations matter more than decorative atmosphere. The system is dark because it should feel like focused post-game analysis; lime identifies useful insight and action, while coral identifies the played mistake and its consequence.

**Key Characteristics:**
- Graphite analysis-room canvas with layered panels and defined rules.
- Chess-native grammar: 8x8 grid, coordinates, arrows, notation, and marked squares.
- Lime means useful insight or action; coral means played mistake and consequence.
- No invented telemetry, decorative grain, or accuracy-score theater.

## Colors

A dark evidence palette. Lime and coral carry fixed semantic meaning.

### Primary
- **Signal Lime** ({colors.lime}): primary action, recommended continuation, and useful insight.
- **Mistake Coral** ({colors.coral}): played mistake, overlooked threat, and causal break.

### Neutral
- **Graphite** ({colors.graphite}): page ground and analysis-room atmosphere.
- **Panel** ({colors.panel}): primary working surface.
- **Raised Panel** ({colors.panel-raised}): selected rows and hover states.
- **Text** ({colors.text}): primary reading color.
- **Muted Ink** ({colors.muted}): supporting explanation and metadata.
- **Rule** ({colors.rule}): structural separators.
- **Cream** ({colors.cream}): board pieces and high-priority evidence.

**The Two-Signal Rule.** Lime is useful insight or action. Coral is the played mistake. Never swap them within one surface.

## Typography

**Display Font:** IBM Plex Sans (with system sans fallback)
**Body Font:** IBM Plex Sans (with system sans fallback)
**Label/Mono Font:** IBM Plex Mono (with ui-monospace fallback)

Instrument-like and precise without becoming a developer console. Mono is reserved for actual notation, coordinates, and compact measurement.

### Hierarchy
- **Display** (600, fluid 52px to 88px, 0.98 line-height): player tension and conversion promise.
- **Body** (400, 15px, 1.5 line-height): explanations and supporting copy.
- **Label** (500, 12px, 1.45 line-height): notation, coordinates, and compact evidence metadata.

**The No-Costume-Mono Rule.** Mono is data language only.

## Layout

The homepage uses a two-column evidence composition: the player’s question and submission path on the left, a truthful annotated position on the right. The container caps at 1240px. Below the hero, the experience moves from turning point to method to retained question. At tablet widths the composition stacks; mobile keeps controls and notation visible.

Report pages prioritize the board, with move selection and explanation adjacent on desktop and sequenced on mobile. Pricing remains a simple comparison surface, not an analysis dashboard.

## Elevation & Depth

Depth comes from graphite tonal layers, one-pixel rules, and restrained offset shadows on surfaces that need separation. The board itself is the highest-contrast object because it carries the product evidence.

## Shapes

Controls use compact 4px corners. Analysis panels use 6px corners. Board squares stay square. Structural rules stay precise; organic curvature is reserved for hand-drawn judgment marks.

## Components

### Buttons
- **Primary:** Signal Lime fill with Graphite text, 54px minimum height.
- **Hover / Focus:** Lime Soft hover; 2px lime focus ring with offset.
- **Secondary:** text or rule-based treatment.

### Inputs / Fields
- **Style:** Panel fill, Rule border, 4px corners.
- **Focus:** Signal Lime border and outer ring.
- **Error:** Coral and plain-language recovery that preserves input.

### Analysis Panel
- **Structure:** board, coordinates, move notation, played move, alternative, and explanation form one evidence chain.
- **State:** the same position source drives board, notation, arrows, side-to-move, and explanation.
- **Annotation:** coral marks played mistake; lime marks useful continuation; highlight the referenced square.
- **Square chips:** every square named in explanation text renders as a small mono chip in one of five mark colours (sky `#7cc4ff`, amber `#ffc15e`, violet `#c6a0ff`, teal `#5fdcc4`, pink `#ff9ad5`), assigned in order of first mention. The board outlines the same squares in the same colour; hovering or tapping a chip fills its square. Mark colours never replace lime or coral meanings.
- **Stage text:** each debrief stage shows only its own text (idea and what it missed; why the alternative works; the habit). The full explanation stays behind "Read the full explanation".

### Analysis Wait State
- A 300px board replays Morphy's Opera Game (Paris 1858) on a loop with short captions, beside the stage stepper and one rotating habit. Motion is piece movement only; reduced motion disables piece animation and caption fades.

## Do's and Don'ts

### Do:
- Derive positions from valid FEN or the real chessboard component.
- Show the square and arrow named by the explanation.
- Make sample evidence truthful before making it atmospheric.
- Respect reduced motion and keyboard focus.

### Don't:
- Use invented game IDs, timestamps, or evaluation numbers as texture.
- Ship a board whose pieces disagree with notation.
- Make accuracy-score conventions the primary product language.
- Use lime for a mistake or coral for a recommendation.

