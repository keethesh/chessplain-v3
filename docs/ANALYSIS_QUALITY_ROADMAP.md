# Analysis quality roadmap

Captured from a design review of `apps/engine`'s analysis pipeline
(`sweep.ts` → `select.ts` → `verify.ts` → `chess-facts.ts` → `explain.ts`).
Nothing here is implemented yet — this is the plan for the next round of
prompt/model/selection work. Current prompt lives in
`apps/engine/src/analysis/prompts.ts` (`PROMPT_VERSION`); `docs/MOMENT_PROMPT.md`
is the older spec and is now behind the code — reconcile or retire it when
this work lands.

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
- **Rating is guessed, not read.** PGNs carry `WhiteElo`/`BlackElo`, but
  `elo_band` defaults to `1000_1400` unless set elsewhere — `[INFERENCE]`,
  not yet traced where/if it's set from the PGN on ingest. A 700-rated
  player can get explanations pitched at 1200.
- **No continuation for the better move.** The model gets `best_move` but
  not the line after it, so "why it holds" is reasoned out rather than
  given.
- **Refutation line capped at 3 plies** (`buildRefutationLine`,
  `maxMoves = 3`). Traps that pay off later than that get described
  vaguely or not at all.
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

## Benchmark plan (prerequisite for any model change)

Don't switch models on reputation. Build first:

1. **30–50 real positions** from actual games — all three rating bands,
   wins and losses, and the common recurring ideas (hanging piece, fork,
   trapped piece, tempo loss, back-rank weakness).
2. **Automatic checks** (mostly code we already have): valid JSON, no
   banned tokens (`findBannedTokens`), every square/piece mentioned
   matches the board (extend the fact-grounding check beyond banned
   words), stated outcome matches `outcome` field.
3. **Model-as-judge for subjective quality**: is the stated move-aim (v1)
   or player reasoning (v2) plausible, is the takeaway checkable mid-game,
   is the tone right for the register.
4. **Run 3–4 candidate models** through the harness and compare cost vs.
   quality. Working hypothesis (`[INFERENCE]`, unverified): a cheap fast
   model is sufficient for per-moment explanation once the model is only
   narrating code-supplied facts; the once-per-game summary may justify a
   stronger reasoning model since spotting a shared root cause across
   moments is genuine cross-moment reasoning, not narration.

Current model: `deepseek-v4-flash-0731` via `crof.ai` (`config.ts`,
`LLM_MODEL` env var), called at `temperature: 0.2` with
`response_format: json_object`, one retry at `temperature: 0.1` with
violations quoted back.

## Suggested execution order

1. Lock the output-ownership contract (table above) — no model/prompt work
   until this is settled, since it changes what the benchmark measures.
2. Ship `probable_thought` v1 (prompt-only, code already has the facts).
3. Add missing inputs: move history, clock times, real rating from PGN
   headers, best-move continuation, only-move signal.
4. Build the benchmark harness (positions + automatic checks + judge
   questions).
5. Run candidate models through the benchmark; pick based on results, not
   assumption.
6. Fix selection thresholds (win% swing, multi-PV `engineAgrees`, verify
   against the same depth used for selection).
7. Revisit `probable_thought` v2 (ask-the-player) once the benchmark can
   measure whether it beats v1.
