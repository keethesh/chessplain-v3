---
name: Chessplain
description: Gremlin Club. A playful, illustrated coach for the mistake you keep making.
colors:
  ink: "#0A0A0A"
  paper: "#FFFFFF"
  ink-2: "#4A4A4A"
  butter: "#FEFFB0"
  pink: "#FFDEED"
  mint: "#DDFFF1"
  sky: "#A6D7FF"
  lilac: "#E9E0FF"
  peach: "#FFE0C7"
  red: "#D4213F"
  red-fill: "#FF4D6D"
  blue: "#1F4FD8"
  blue-fill: "#2F6BFF"
  board-light: "#DEECF7"
  board-dark: "#5EAAE8"
typography:
  display:
    fontFamily: "Archivo (wdth 125), Arial Black, sans-serif"
    fontWeight: 900
    textTransform: uppercase
    lineHeight: "0.9"
    fontSize: "clamp(52px, 10vw, 180px)"
  h1:
    fontFamily: "Archivo (wdth 125)"
    fontWeight: 900
    fontSize: "clamp(40px, 6.4vw, 104px)"
  h2:
    fontFamily: "Archivo (wdth 125)"
    fontWeight: 900
    fontSize: "clamp(30px, 4vw, 60px)"
  h3:
    fontFamily: "Archivo (wdth 125)"
    fontWeight: 800
    fontSize: "clamp(20px, 1.8vw, 26px)"
  body:
    fontFamily: "Satoshi, system-ui, sans-serif"
    fontSize: "18px"
    lineHeight: "1.45"
  label:
    fontFamily: "Satoshi"
    fontWeight: 700
    fontSize: "13px"
    letterSpacing: "0.06em"
    textTransform: uppercase
rounded:
  panel: "0"
  control: "999px"
borders:
  line: "2px solid ink"
motion:
  ease-out: "cubic-bezier(0.23, 1, 0.32, 1)"
  ease-in-out: "cubic-bezier(0.77, 0, 0.175, 1)"
  ease-drawer: "cubic-bezier(0.32, 0.72, 0, 1)"
  ease-stamp: "cubic-bezier(0.34, 1.56, 0.64, 1)"
  press: "140ms"
  ui: "200ms"
  reveal: "560ms"
---

# Design System: Chessplain

## North star: "Gremlin Club"

Chessplain finds the mistake a player keeps making and turns it into a character: a
**gremlin**. The Hanger walks off with undefended pieces, Double Trouble forks, The Mate
Misser never sees the mate coming, The Back-Rank Sleeper naps on the back rank, The Bad
Trader offers trades that are never fair. Externalising the mistake makes it memorable,
shareable and non-judgemental ("The Hanger showed up again", not "you blundered").

The visual language is a white page, black ink, heavy wide capitals and flat pastel scenes,
in the register of a confident consumer app (reference for energy and craft: macadam.app).
Warmth comes from authored illustration, not from gradients, glass or dark-mode moodiness.

**Two registers, one system**

- **Playful** (homepage, scan, results, empty states, share cards, emails): gremlins, big
  type, pastel scene panels, stickers, short punchy lines.
- **Exact** (the board, the explanation, the try-it): same palette and type, no characters on
  the board, calm layout. Every claim is checked; the board is the proof. Never let cartoon
  energy leak into chess facts.

## Colour

- **Paper** white is the page. **Ink** near-black is text, borders and primary buttons.
- **Pastels** (butter, pink, mint, sky, lilac, peach) fill scene panels, one per scene. Never mix
  two pastels inside one panel.
- **Concept tints**: each gremlin owns one pastel, applied with `data-concept` +
  `.bg-concept`: hanging_piece lilac, double_attack pink, missed_mate_threat butter,
  weak_back_rank sky, losing_exchange mint, missed_chance peach.
- **Red** marks what went wrong (the played move, losses); **Blue** marks the checked
  line and focus. They are semantic, never decoration. Use `--red`/`--blue` for text and the
  `-fill` variants for arrows and board marks.
- Secondary text is `--ink-2` (#4A4A4A), which passes AA on white and every pastel. Never
  use light grey text.
- Board: pale sky light squares, sky dark squares, 2px ink frame. White pieces get 1.2:1 on
  light and 2.5:1 on dark, like standard boards; arrows at 85% opacity so the blue arrow
  still reads on blue squares.

## Typography

- **Display**: Archivo Expanded (wdth 125) Black, uppercase, tight leading. Headlines are
  short sentences with a full stop. One `.hl` butter highlight per headline at most.
- **Celebration type** (`.display--extruded`): white letters, ink outline, a pastel and an ink
  offset layer. Only for big moments: the gremlin reveal, an answered check-in, an idea
  retired. Never for ordinary headings.
- **Body**: Satoshi Medium (500) by default, 700 for emphasis, 18px base. Labels and buttons are Satoshi 700 uppercase with
  0.06em tracking.
- Moves and numbers use `.move` (tabular figures, never wrap).
- Fonts load with `<link>` in `app/layout.tsx` (Google Fonts for Archivo, Fontshare for
  Satoshi). Never `next/font/google` (Workers constraint).

## Shape and surface

- **Persuade surfaces** (homepage scenes, pricing, share cards): framed `.panel`s, square
  corners, 2px ink border on the white page.
- **Operate surfaces** (scan progress, account, lists, report chrome): `.surface`, a soft
  neutral `#F1F4F7` card (or `.surface--white` with a hairline) with 16px radius and no heavy
  border.
- Controls are pills everywhere (`.btn`, `.input`, `.tag`). That is the whole radius system.
- `.btn` is the black pill (hover inverts on pointer devices). `.btn--key` is the white
  "keyboard key" with a hard 4px ink shadow that presses down; use it for secondary actions
  and game controls. Hard shadows appear nowhere else.
- No cards inside cards, no soft drop shadows, no gradients, no glass.
- Slight rotations (≤ 2°) are allowed on stickers, slips and quote cards to feel hand-placed.

## Gremlins

- Rendered only through `components/Gremlin.tsx` (one place to swap in Rive later).
- Character art lives in `public/gremlins/<concept_id>.png` (transparent, thick ink outline,
  flat pastel fills, sneakers). New characters must match that style exactly.
- A gremlin can sit in front of display type (the Macadam move) or stand on a panel's
  baseline. Never place a gremlin on the chess board or over explanation text.
- Names and taglines for marketing live in `lib/gremlins.ts`; chess truth (definition,
  habit) always comes from the engine's `ConceptInfo`.

## Motion

Motion is authored and purposeful (Emil Kowalski's rules). The premium feel comes from a few
authored big moments (character animation, reveals), while UI chrome stays simple: fades and
short slides.

- Custom curves only: `--ease-out` for entering and UI, `--ease-in-out` for on-screen
  movement, `--ease-stamp` (overshoot) only for rare celebratory moments (a sticker landing,
  the gremlin reveal). UI transitions stay ≤ 200ms; buttons press to `scale(0.97)` in 140ms.
- Never `transition: all`, never `scale(0)`, never `ease-in`.
- Content is visible by default; `<Reveal>` hides and reveals only after hydration and only
  below the fold. Stagger 60ms. Reduced motion removes movement entirely.
- Signature moments: the gremlin walks onto the hero headline; scan slips settle one by one
  and stickers stamp onto the games where the gremlin appeared; the result reveals the
  gremlin with a short overshoot. Frequent interactions (board stepping, tabs) do not animate
  beyond the piece move itself.
- Hover effects are gated behind `(hover: hover) and (pointer: fine)`.
- Rive animations for gremlins will replace the stills later; until then a stepped "walk"
  bob is acceptable for the hero only.

## Layout

- `.page` container, max 1440px, 16–32px side padding. Scenes are framed `.panel`s sitting on
  the white page with space between them.
- Every screen ends with one obvious next step. No dead ends, no blank forms after a result.
- Mobile: one column, display type sized in `vw`, buttons full width under 560px.

## Copy voice

Plain, warm, a little cheeky, never mocking the player. The gremlin takes the blame. Short
sentences in second person; titles may be a question or an exclamation ("Found it!", "Did
it come up?", "Oops, Chess.com didn't answer. Try again?", "Nothing decisive. Nice!").
Loading copy names what is happening ("Chessplain is reading your games…"). Empty states
point forward. Say "your last 10 games", "the move", "the check for your next game". Avoid
"accuracy", "blunder" (except quoting players), "AI-powered", "insights", and anything
about coins, streaks or rewards. Never invent numbers: counts come from the scan, sample
data is labelled as a sample.

Calibration reference: macadam.app's design system, motion and voice (the owner's
reverse-engineered notes). Reference only: none of its fonts, Rive files, sounds,
characters or copy ship in Chessplain.

## Accessibility

- Focus ring: 3px blue outline, 3px offset, on everything focusable.
- 44px minimum targets; inputs and buttons are 56px.
- Colour never carries meaning alone: results also say W/L/D, the checked move is named in text.
- Board has an accessible description of the position; try-it outcomes are announced in a
  live region.
