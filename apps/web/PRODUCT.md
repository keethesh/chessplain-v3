# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Users

Adult club-level Chess.com players, roughly 600–1800 Elo, in the moment right after losing a game. Their job: find out *why* they lost — in their own terms, not a study course and not a grading report. (Note: the shipped voice prompts in `docs/MOMENT_PROMPT.md` currently target 600–1200 with Elo bands under_1000 / 1000_1400 / above_1400.)

## Product Purpose

Chessplain turns a lost chess game into a plain-English explanation. The player submits a Chess.com username (most recent game auto-fetched) or pastes a PGN, and gets a report: a one-line headline naming where the game was actually decided, a short story referencing the key moments, and per-moment cards (probable thought → what actually happened → one teachable concept → one checkable takeaway). Success = the player closes the tab knowing one habit to check at the board next game.

## Positioning

The anti-accuracy-score game review. Competing products grade moves and speak engine; Chessplain explains the flaw in the *plan*, not the quality of the *move* — no accuracy percentages, no centipawn evals, no grade words. Engine numbers are pipeline-internal and never shown to the player.

## Operating Context

- Submission happens in the moment of frustration after a loss — time-to-clarity matters; analysis completes in under ~20 seconds (3-stage engine evaluation) on the external engine service (`apps/engine`, deployed separately, `api.getchessplain.com`); the report page follows an async queue.
- Reports are shareable at `/r/[shareId]` (public share view with view tracking) — players post them where they talk about their games.
- PostHog tracks the funnel (`landing_viewed` → `pgn_submitted` → `game_submitted`) and deterministic hero-copy variants (A/B/E) for messaging experiments.

## Capabilities and Constraints

- Two submission methods: Chess.com username (auto-fetches most recent game) or pasted PGN.
- Free tier: first 2 games/week without an account. Paid tier exists (`/pricing`, Stripe via the engine service).
- Routes: `/` (landing + submit), `/report/[id]`, `/r/[shareId]`, `/pricing`, `/privacy`, `/terms`, `/auth/callback`.
- Stack: Next.js 16 (App Router, Turbopack), React 19, Tailwind CSS 4, react-chessboard, chess.js; Supabase auth/data; PostHog analytics.
- Analysis copy is machine-generated under a strict voice contract with a mechanical banned-token check (blunder, mistake, accuracy, eval, percentages, signed numbers, etc. are forbidden in player-facing text).

## Brand Commitments

- **Binding (user-confirmed):** the first taste is free and requires no signup — the core loop must never be gated behind an account wall in the design.
- Name: Chessplain.
- A voice contract exists (`docs/MOMENT_PROMPT.md`) and the "no accuracy score" anti-positioning is shipped in live copy, but the user has **not** marked either as a binding contract — treat them as strong defaults, not constraints, and ask before treating them as immovable.

## Evidence on Hand

- `docs/MOMENT_PROMPT.md` — voice contract for moment + summary generation, with gold-standard examples and a weekly spot-check rubric.
- `docs/REBUILD_STRATEGY_31082026.md`, `CHESSPLAIN_V3_REBUILD_EXECUTION_PLAN.md` — strategy and build plan for the v3 rebuild.
- `wireframes-report-page.html` — interactive wireframe of the report page; renders the voice-contract outputs 1:1.
- Hero copy variants A/B/E live in `apps/web/app/page.tsx`.
- No logo or brand asset files found in the repo. No testimonials, reviews, or customer evidence exist — future work must not fabricate any.

## Product Principles

1. **The explanation is the product.** Every screen serves getting to, reading, or sharing the explanation; everything else recedes.
2. **Meet the player in the moment.** Speed and clarity beat depth; a 900-rated player must understand every sentence.
3. **Value before accounts.** First taste free, instant, no signup — design the core loop accountless.
4. **Plans, not grades.** Severity reads as story, never as a score; the idea was usually reasonable.
