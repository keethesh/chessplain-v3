# Analysis quality roadmap

Captured from a design review of `apps/engine`'s analysis pipeline
(`sweep.ts` → `select.ts` → `verify.ts` → `chess-facts.ts` → `explain.ts`).
Most of this is still plan. Shipped so far (2026-09-23, prompt `2026-09-23.1`):
per-move refutation facts with mate-threat and forced-defence detection, and
the model benchmark harness — both marked below. Current prompt lives in
`apps/engine/src/analysis/prompts.ts`; `docs/MOMENT_PROMPT.md` mirrors it.

## Principle

Code and Stockfish establish what is true (moves, squares, threats,
refutation lines). The model's only job is to turn true facts into a
believable story and one usable habit. Anything the model currently
guesses that code could instead compute is a source of hallucination risk
and should move to code.

## Output ownership — what should generate what

| Output | Owner today | Owner it should be | Why |
|---|---|---|---|
| Which moments matter, severity | Code (`select.ts`) *and* model (`severity_label`) | Code only | Two sources of truth can disagree; code already has the eval swing. |
| Piece/square/threat facts | Code (`chess-facts.ts`) | Code (unchanged) | Already correct. |
| Concept name (fork, trapped piece, tempo…) | Model, free text | Code proposes from a fixed taxonomy, model confirms/picks | Free text means the same idea gets different names across reports; blocks tracking recurring weaknesses per player. |
| `probable_thought` | Model, guesses player's mind from one FEN | See "probable_thought" section below | Least grounded field in the report; see open question resolved below. |
| `what_actually_happens` | Model narrates code-supplied facts | Model (unchanged), but needs richer inputs | Right owner, missing context (see Input gaps). |
| `takeaway` / `focus_habit` | Model | Model (unchanged) | The one field that's genuinely generative and valuable. |

## Resolved: `probable_thought` must not claim to read minds

Problem: a first-person guess of what the player was thinking, generated
from a single board position with no move history, no clock data, and a
guessed rating, is the least grounded field in the report. When it's
wrong, it costs more than it earns — the player concludes the tool doesn't
understand chess and discounts the (correct) explanation that follows.

But the underlying idea is worth keeping: most amateur mistakes come from
faulty reasoning ("hope chess"), not failure to see a move, and naming the
reasoning that failed is more likely to change next-game behavior than
just showing the best move. It's also core to the product's promise ("the
move that looked right").

Plan, two steps:

- **v1 — stop guessing, describe the move's aim instead of the player's
  mind.** Code lists what the move objectively did (attacked the queen,
  defended e5, took a pawn, lined up on the king — derivable from
  `chess-facts.ts`). The model picks the most plausible *purpose* from that
  list and phrases it as the move's aim, not a first-person claim:
  *"This move goes after the pawn on f7 and sets up a fork."* Can still be
  wrong about motive, never wrong about fact, never claims to read minds.
  This is a prompt change only — no new inputs needed.

- **v2 — ask the player.** Add a step before the explanation:
  *"What were you going for?"* with 2–3 options generated from the same
  aim-list, plus "Something else" / "I didn't know."
  - Right option picked → explanation lands on their actual reasoning
    (best version of the feature).
  - "Something else" → fall back to the neutral v1 explanation.
  - "I didn't know" → a finding in itself (signals a planning gap, not a
    miscalculation) — could drive a different takeaway.
  - Fits naturally as a step in the existing 4-stage debrief
    (`before → played → alternative → takeaway` in
    `SharedReportInteractiveView.tsx`), inserted between `before` and
    `played`.
  - Also produces real data on *why* players go wrong across many games —
    useful for the benchmark below and a plausible premium feature
    (tracking a player's recurring reasoning failures over time).
  - Cost: one extra LLM call per option set, generated in the existing
    explain step (~2–3× the text for moments) or on-demand after the
    player answers.

**Decision: ship v1 first** (prompt-only change, no new inputs). Build v2
once the benchmark (below) exists, so we can measure whether naming the
player's own reasoning beats a neutral aim-description.

## Input gaps (what we don't send the model today)

The model is asked to explain a decision without the context a human
would have used to make it:

- **No move history.** Only one FEN (a snapshot) is sent. Most mistakes
  are reactions to the opponent's prior move(s) — send the last 3–4 plies.
- **No clock times.** Chess.com PGNs carry `%clk` annotations; we parse
  none of it. "12 seconds on the clock" explains a lot of blunders and
  changes the honest story.
- **Rating is only read for Chess.com imports.** Username imports get
  `elo_band` from the Chess.com API rating (`mapEloToBand`); pasted PGNs
  default to `1000_1400` even when they carry `WhiteElo`/`BlackElo`, so a
  700-rated player pasting a PGN gets explanations pitched at 1200.
- **No continuation for the better move.** The model gets `best_move` but
  not the line after it, so "why it holds" is reasoned out rather than
  given.
- **Refutation line capped at 3 plies** (`buildRefutationLine`,
  `maxMoves = 3`). Traps that pay off later than that get described
  vaguely or not at all. *Partly addressed:* every move of the line is now
  annotated from its own position, quiet moves carry the mate they threaten
  (`threatens_checkmate`, via a null move), and `after_refutation` states why
  the obvious escape fails, verified by playing it. Found via production report
  `6992cfc4` (18...Ne3 Qxc5 Nxf1 Qc3): the explanation never said the f1
  knight is lost because Qxg7 is mate, and put the knight on the wrong square.
  Still open: threats other than mate (e.g. winning an undefended piece), and
  longer lines.
- **No "only move" signal.** The engine can tell us whether many moves
  were fine or only one held the position. That changes the story ("you
  had to find this" vs "anything reasonable was fine here").

## Selection logic issues (`select.ts`)

- **Raw pawn swings, not win-probability swings.** +8 → +6 counts the same
  as a swing from 0 → −2 today, but only the second one matters to the
  player's result. Lichess-style win% conversion would fix this.
- **`engineAgrees` only exempts the single top engine move.** A move
  nearly as good as the top choice can still get flagged as a mistake.
  Should compare against the top few candidates (multi-PV), not just the
  #1 move.
- **Candidates chosen from the shallow pass.** Moments are selected off
  the fast sweep (`nodes 15000`) and only verified deeply afterward. A
  real mistake the shallow pass missed at that depth never reaches
  verification and never gets flagged.

## Benchmark — harness built (2026-09-23)

Don't switch models on reputation. The harness exists:

- `pnpm --filter @chessplain/engine benchmark:fixtures` (run on the VPS; needs
  Stockfish + DB) freezes verified candidate moments into
  `apps/engine/benchmark/fixtures.json`. Current set: **49 positions from 28
  games** — the 8 representative games plus the 20 most recent completed
  production analyses, all three rating bands, all four severity labels.
  Player names are not stored.
- `OPENROUTER_API_KEY=… pnpm --filter @chessplain/engine benchmark:models`
  sends each fixture through the production payload builder and system prompt
  to every candidate model through OpenRouter's normal routing (any host), and
  records which provider actually served each call. Checks: schema/banned tokens
  (`validateMomentJson`), phantom pieces ("knight on e3" where no knight ever
  stands on e3 in the line), curated must/must-not phrases for known-bad
  positions, and an LLM judge (default `anthropic/claude-sonnet-5`, a different
  family from every candidate) scoring accuracy, *explains why*, thought
  plausibility, and takeaway usefulness. Reports land in
  `apps/engine/benchmark/results/`.

Why a new benchmark: the previous gateway (crof.ai) served models that were not
the ones it advertised, which invalidated earlier results. OpenRouter routes to
real hosts of the named model; the served-by column shows which one answered.

Candidates (OpenRouter list price per 1M tokens in/out, 2026-09-23; Gemini and
Mistral deliberately excluded):

| Model | In | Out |
|---|---|---|
| `openai/gpt-6-luna` (reasoning none, and low) | $0.10 | $0.50 |
| `openai/gpt-6-luna-pro` | $0.10 | $0.50 |
| `deepseek/deepseek-v4.1-flash` | $0.10 | $0.50 |
| `qwen/qwen3.8-flash` | $0.15 | $0.47 |
| `qwen/qwen3.8-omni-flash` | $0.15 | $0.47 |

`qwen/qwen3.7-flash` was dropped: its only host returned 429 on every probe.
The judge runs at `reasoning: low` — at default effort Claude Sonnet 5 spends
the whole token budget reasoning and returns empty content.

### Results (2026-09-23, 49 positions, one run each, judge scores 1–5)

Round 1, prompt `2026-09-23.1` (report `benchmark/results/2026-09-23T15-44-54-026Z.md`):

| Model | Valid | Accuracy | Explains why | Thought | Takeaway | p95 s | $/1k moments |
|---|---|---|---|---|---|---|---|
| gpt-6-luna | 49/49 | 4.02 | 2.86 | 4.06 | 3.65 | 5.8 | 0.13 |
| gpt-6-luna+low | 49/49 | 4.08 | 2.86 | 4.12 | 3.76 | 11.7 | 0.25 |
| gpt-6-luna-pro | 49/49 | 3.98 | 2.78 | 3.96 | 3.69 | 9.7 | 0.66 |
| deepseek-v4.1-flash | 49/49 | 3.71 | 3.31 | 4.08 | 3.69 | 31.5 | 0.31 |
| qwen3.8-flash | 49/49 | 3.67 | 2.88 | 3.94 | 3.69 | 6.2 | 0.15 |
| qwen3.8-omni-flash | 47/49 | 3.57 | 2.85 | 3.94 | 3.68 | 5.9 | 0.39 |

Every model scored ~3/5 or lower on *explains why*, and 12 positions scored low
for every model — the inputs lacked the reason. Fixed in prompt `2026-09-23.2`:
the better move's engine line is now annotated (`best_line_moves`,
`best_line_outcome`), every line move says who plays it (`by`), and mates carry
`mate_reason`. Luna Pro (5× the price, no better) and Qwen Omni (weakest) were
dropped.

Round 2, prompt `2026-09-23.2` (report `benchmark/results/2026-09-23T15-54-31-561Z.md`):

| Model | Valid | Accuracy | Explains why | Thought | Takeaway | p95 s | $/1k moments |
|---|---|---|---|---|---|---|---|
| gpt-6-luna | 49/49 | 4.02 | 3.10 | 4.06 | 3.69 | 4.7 | 0.25 |
| gpt-6-luna+low | 49/49 | 4.00 | 2.88 | 4.02 | 3.71 | 11.5 | 0.31 |
| deepseek-v4.1-flash | 48/49 | 3.79 | 3.52 | 4.04 | 3.85 | 26.5 | 0.34 |
| qwen3.8-flash | 48/49 | 3.71 | 3.19 | 4.02 | 3.81 | 5.8 | 0.29 |

**Choice: `openai/gpt-6-luna`, no reasoning.** Most accurate, all valid, one
real provider (OpenAI) with the tightest latency, ~$0.00025 per moment. DeepSeek
explains a little more but states more wrong facts, and OpenRouter's host
rotation puts its p95 at 26 s. Reasoning effort `low` bought nothing. Verified
against the engine's exact request shape (`reasoning_effort: 'none'`,
`max_tokens: 500`): 8/8 of the longest inputs valid, ≤263 completion tokens.

Caveats: one run per position, and the judge runs at low reasoning — its
comments are occasionally wrong on chess details, so treat ±0.2 as noise.
*Explains why* is still ~3/5; the remaining gaps are lines cut at 3–4 plies and
non-mate threats.

Still open: a summary-prompt benchmark (the per-game summary may justify a
stronger model — spotting a shared root cause across moments is reasoning,
not narration).

**Production LLM since 2026-09-23 16:00 UTC: `openai/gpt-6-luna` via OpenRouter**
(`LLM_API_BASE=https://openrouter.ai/api/v1`, engine commit `1d8d0df`, prompt
`2026-09-23.2`). Verified with the deployment verifier (25/25) and the Ne3
production game run through `runAnalysisPipeline` on the VPS: no fallback prose,
and the explanation names the Qxg7 mate threat and why the f1 knight cannot
escape. The OpenRouter key expires 2026-10-23 with a $10 limit — replace it
before then. Rollback: `/etc/chessplain/engine.env.bak-20260923-155930`.

Before the switch: `deepseek/deepseek-v4.1-flash` through a local CommandCode
proxy on the VPS (`127.0.0.1:3050`, still running, now unused). It ignored
`reasoning_effort:'none'` and `max_tokens`: each moment spent 1.9k–4k reasoning
tokens over 12–23 s, and 3 of 6 test calls returned empty content (which
production turns into a retry, then fallback prose). The `config.ts` default
(`crof.ai`, `deepseek-v4-flash-0731`) is unused.

## Suggested execution order

1. Lock the output-ownership contract (table above) — no model/prompt work
   until this is settled, since it changes what the benchmark measures.
2. Ship `probable_thought` v1 (prompt-only, code already has the facts).
3. Add missing inputs: move history, clock times, real rating from PGN
   headers, best-move continuation, only-move signal.
4. ~~Build the benchmark harness~~ — done; see above.
5. Run candidate models through the benchmark; pick based on results, not
   assumption.
6. Fix selection thresholds (win% swing, multi-PV `engineAgrees`, verify
   against the same depth used for selection).
7. Revisit `probable_thought` v2 (ask-the-player) once the benchmark can
   measure whether it beats v1.
