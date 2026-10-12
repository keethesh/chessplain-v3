# Analysis quality roadmap

Captured from a design review of `apps/engine`'s analysis pipeline
(`sweep.ts` → `select.ts` → `verify.ts` → `chess-facts.ts` → `explain.ts`).
Implemented as of 2026-09-23: per-move refutation facts with mate-threat and
forced-defence detection, the better-line annotations, and the model benchmark
that selected the current provider/model. Remaining work is marked below.
Current prompt lives in `apps/engine/src/analysis/prompts.ts`;
`docs/MOMENT_PROMPT.md` mirrors it.

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

**v1 shipped 2026-09-23 (prompt `2026-09-23.3`).** `probable_thought` is now a
third-person description of what the move does or sets up, grounded in
`played_move`'s facts; `validateMomentJson` rejects "I/me/my", and the report
labels it "The idea" (originally "What the move was going for") instead of a quoted thought. Stored
reports from before the change still hold first-person text. v2 remains open.

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
- **Resolved 2026-09-30: the Quiet drift fallback skipped depth-20 checking.**
  `verify.ts` exempted `Quiet drift` from its swing floor, so shallow noise
  was published as a lesson (two stored reports flagged a move whose depth-20
  swing was −0.32). Verification now re-applies each candidate's own floor at
  depth 20: −1.0 for normal candidates, `MIN_QUIET_DRIFT_SWING` (−0.75) for
  the fallback. Regression tests: `test/verify-drops-best-move.test.ts`.

## Production corpus audit (2026-09-30)

All 26 completed production reports were replayed with chess.js and scored
0–3 per moment on correctness, relevance, clarity and actionability. Averages:
2.50 / 2.54 / 2.96 / 2.88. Every stored move and refutation line is legal.
Defects are mostly historical (pre-current prompt and pre-fix selection):
downstream claims beyond the stored 3-ply line (13.cxd5 "mate", 27.Qa3 "rook
loss"), one report of four fallback cards from the September LLM outage, and
the Quiet drift noise above. The two reports on prompt `2026-09-24.1` scored 3
on every axis. n is small and mostly internal testing.

- **Yield:** moments per report were 0×4, 1×11, 2×6, 3×3, 4×2. The four empty
  reports are genuine (a two-ply resignation and clean Black games whose worst
  swings were −0.42 to −0.60), not missed mistakes. Low yield is a threshold
  and product decision (item 6 below), not a bug.
- **Latency:** worker runs with moments took 4.3–48 s; the 48 s cases are two
  30 s LLM timeout windows. Since 2026-09-30 each completed report logs
  per-stage wall time (sweep, verify, explain, summary) and cache hit rate,
  and sends them to PostHog. First production numbers, 2026-09-30: a new game
  took 19.8 s (sweep 0.7 s, verify 10.3 s, explain 4.1 s, summary 4.6 s;
  cache 13%), so depth-20 verification dominates new games. Re-runs with a
  warm cache took 6–7 s, where the LLM stages dominate and the summary runs
  only after every explanation finishes.
- **Grounding:** `validateMomentJson` checks shape, banned terms, word counts
  and first-person claims, but not causal claims against `chess-facts.ts`.
  The 2026-09-30 benchmark rerun on the current prompt had 1 phantom-piece
  output in 49 (the 2026-09-23 run had 2), within noise.
- **Input safety:** PGN `White`/`Black` headers reached prompts and storage
  unbounded. `parsePgn` now strips control characters and caps them at 80
  characters (regression test in `test/pipeline.test.ts`).

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

Round 3, Luna only, prompt `2026-09-23.3` vs `2026-09-23.2`, same 49 fixtures,
2 runs each (reports `benchmark/results/2026-09-23T20-24-05-969Z.md` and
`2026-09-23-ab-baseline-prompt-2026-09-23.2.md`). The judge's *Thought* criterion
now scores whether the aim matches the board in the third person, so first
person is penalised:

| Prompt | Valid | Accuracy | Explains why | Thought | Takeaway | Phantom pieces |
|---|---|---|---|---|---|---|
| `2026-09-23.2` | 98/98 | 3.98 | 3.00 | 3.82 | 3.72 | 7 |
| `2026-09-23.3` | 98/98 | 3.98 | 3.20 | 4.22 | 3.84 | 5 |

Changes in `.3`: the move's aim replaces the mind-read; `what_actually_happens`
opens with the one fact the move overlooked (removing the intention framing
alone cost ~0.2 on *explains why* until this was added); lines no longer stop
mid-exchange (report `d93a5f01` had told the player the better move loses the
queen when the next move recaptured it); the payload states the player's
standing in words, and alternatives in lost positions are framed as limiting
the damage. Remaining visible errors: occasional wrong "your" on the
opponent's pieces, and dubious claims about lines of attack.

Still open: a summary-prompt benchmark (the per-game summary may justify a
stronger model — spotting a shared root cause across moments is reasoning,
not narration).

Round 4, Luna only, prompt `2026-09-24.1`, 1 run (report
`benchmark/results/2026-09-23T21-07-27-121Z.md`): 49/49 valid, accuracy 3.86,
explains why 3.00, thought 4.10, takeaway 3.86, 2 phantom pieces. The better
move moved out of `what_actually_happens` into its own `why_better` field so
each debrief stage shows its own short text; the report page had been showing
the same ~66-word paragraph on three of four stages. Median length is now 34
words for `what_actually_happens` and 24 for `why_better` (validated at 60 and
45). Judge scores are within single-run noise of round 3; readability per stage
was the goal. Reports saved before this lack `why_better`; the page falls back
to `what_actually_happens`.

**Production LLM since 2026-09-23 16:00 UTC: `openai/gpt-6-luna` via OpenRouter**
(`LLM_API_BASE=https://openrouter.ai/api/v1`). Current: engine commit `20830d6`,
prompt `2026-09-24.1` (deployed 2026-09-23 ~21:25 UTC). Verified with the deployment verifier (25/25) and the Ne3
production game run through `runAnalysisPipeline` on the VPS: no fallback prose,
and the explanation names the Qxg7 mate threat and why the f1 knight cannot
escape. The OpenRouter key was replaced on 2026-09-26 ($10 limit, expires
2026-12-25). Rollback: `/etc/chessplain/engine.env.bak-20260923-155930`.

Before the switch: `deepseek/deepseek-v4.1-flash` through a local CommandCode
proxy on the VPS (`127.0.0.1:3050`, still running, now unused). It ignored
`reasoning_effort:'none'` and `max_tokens`: each moment spent 1.9k–4k reasoning
tokens over 12–23 s, and 3 of 6 test calls returned empty content (which
production turns into a retry, then fallback prose). The `config.ts` default
(`crof.ai`, `deepseek-v4-flash-0731`) is unused.

## Suggested execution order

1. ~~Lock the output-ownership contract~~ — benchmarked current contract; the
   model narrates facts while code owns board truth.
2. ~~Ship `probable_thought` v1~~ — done in prompt `2026-09-23.3`.
3. **Add missing inputs** — still open: last 3–4 plies, clock times, real rating
   from pasted PGN headers, and an only-move signal. The better-move continuation
   and per-move/forced-defence facts are now shipped.
4. ~~Build the benchmark harness~~ — done; 49 anonymized fixtures and automatic
   plus judge checks are committed.
5. ~~Run candidate models and choose one~~ — done; production uses
   `openai/gpt-6-luna` with no reasoning through OpenRouter.
6. **Fix selection thresholds** — still open: win-probability swing instead of
   raw pawns, multi-PV `engineAgrees`, and selecting/validating at aligned depth.
   Rerun the 49-position benchmark on the current prompt before changing them.
7. **Benchmark the summary prompt** — still open; the game-level summary may
   justify a stronger model.
8. **Revisit `probable_thought` v2** — ask the player what they were going for
   after v1 can be compared against a neutral aim description.

## Concept tags (phase 1 gate)

`classifyMoment` is scored offline by `pnpm --filter @chessplain/engine benchmark:concepts`
against `apps/engine/benchmark/concepts/labelled.json`. The gate fails under
90% overall accuracy or 90% precision on non-null predictions.

Concepts (2026-10-12): five things the move allowed (hanging piece, double
attack, missed mate threat, weak back rank, losing exchange) and one the player
missed (missed chance). A hanging piece now includes a piece a cheaper piece
takes, or one with more attackers than defenders; a defended piece has to cost
two points net. A missed chance is a forced mate given up, or a better line
that wins at least three points in the stored line while the played move
loses less than two. Once the opponent has a forced mate, only the mate
concepts may tag the moment.

Labelled set: 212 verified turning points (`quietDriftFallback: false`,
15k-node sweep, depth-20 verify) from recent rapid, blitz and daily games.

- **Dev, 98 moments** (players rated 753–2071): the 2026-10-11 set, minus one
  moment the pipeline no longer selects (a mate in 7 played as a mate in 8).
  Its 20 new labels (5 wider hanging pieces, 15 missed chances) come from two
  blind motif labellers (allowed or missed, plus the tactic) and integrator
  rulings on their 29 disagreements. The new rules were tuned on this set.
- **Held-out, 114 moments** from 19 other players (796–1680, two recent games
  each), labelled blind by two labellers with the six definitions. They agreed
  on 98; the integrator ruled the other 16. One rule change came after scoring
  it (a given-up forced mate now outranks the material concepts), which fixed
  one held-out error.

| Set | Rules | Accuracy | Non-null precision | Moments tagged |
|---|---|---|---|---|
| Dev (98) | before | 0.776 | 14/14 | 14 |
| Dev (98) | after | 0.888 | 25/25 | 25 |
| Held-out (114) | before | 0.667 | 16/18 | 18 |
| Held-out (114) | after | 0.807 | 34/38 | 38 |
| All (212) | after | 0.844 | 59/63 (0.937) | 63 |

Held-out per concept after the change (precision, recall): missed chance 16/19,
16/24; hanging piece 6/7, 6/9; double attack 6/6, 6/10; weak back rank 3/3,
3/4; missed mate threat 2/2, 2/4; losing exchange 1/1, 1/2.

On fresh games the gate fails on both counts. Held-out precision is 34/38
(89%; 95% range 76–96%), one tag short of 90%; the pooled 59/63 (0.937) passes
only because it includes the 25/25 on the dev set the rules were tuned on.
`benchmark:concepts` prints the pooled figures; the held-out rows are the ids
containing `-h<N>-`. Per concept, only the missed chance has enough fresh tags
to say much (16/19, 84%; 95% range 62–94%); the other five have 1–7 each.
Accuracy fails because of recall: the rules read the stored lines (3–4 moves
plus captures), so wins and losses that land later stay `null`. The old rules
scored 0.980 on the dev set but 0.667 on fresh games, so the earlier figure was
optimistic.

The four held-out errors all come from that line length. In two missed
chances the player stayed clearly winning (+11.7 and +3.7 after the move) and
the played line wins the same material later. In one, the move allowed a fork
that wins the exchange beyond the stored line, so the missed win was the
smaller story. In one hanging piece (the original rule), the recapture comes
after a quiet move.

Tried and dropped: reading the full depth-20 PV (14 plies) for missed
chances. Two depth-20 runs of the same positions gave different tails and
different material counts, so the rule was not repeatable.

Mate scores are 100 − N pawns, so a mate that only got longer (mate in 7 to
mate in 8) read as a one-pawn mistake and reached reports as a turning point.
`select.ts` and `verify.ts` now drop a move when the same side is mating, or
50+ pawns ahead, before and after it.

Limits: mostly blitz; labels are two labellers plus one integrator; the rare
concepts have 2–4 held-out cases each.

Scan coverage (2026-10-12): the last 20 rapid, blitz and daily games of 13
players outside both labelled sets (rated 770–1687), scanned like production,
each turning point classified by the old and the new rules.

| Games | Rules | Players with a gremlin in 2+ games | Turning points tagged |
|---|---|---|---|
| 10 | before | 10/13 | 60/342 (18%) |
| 10 | after | 12/13 | 112/342 (33%) |
| 20 | before | 13/13 | 123/721 (17%) |
| 20 | after | 13/13 | 226/721 (31%) |

With the new rules the missed chance is the top gremlin for 7 of 13 players at
10 games and 9 of 13 at 20: the most common gremlin is also the one with the
lowest precision (16/19 held-out) and the weakest explanations.

## What happened vs what was allowed (prompt 2026-10-11.2)

Problem: the refutation line is the opponent's best reply, but the moment
field holding it is named `what_actually_happens`, and nothing told the model
what was really played. Moments told unplayed lines as events, and summaries
built on them stated false game events and endings ("the queen moved to g7
with checkmate. The game ended there." in a game that went on to move 56).

Fix: `inGameFacts` (`pgn.ts`) reads the moves really played after each moment
from the game record (each with who played it), counts how much of the line
the game followed, and flags games that ended inside it. The moment prompt
gets in-game rules only when that record is present; the summary gets the
same facts, the moment text renamed `what_the_move_allowed`, and how the game
ended (`ended_by`, a closed word from the board or the Termination header).

Evaluation (2026-10-11, judged by hand against the game records, no LLM judge):
14 real games, 48 moments, regenerated on `2026-10-11.1` and `2026-10-11.2`
with `openai/gpt-6-luna`. 42 moments are at risk: the game left the engine line
or ended inside it.

| Check | `2026-10-11.1` | `2026-10-11.2` |
|---|---|---|
| Summaries stating an engine line as a game event, or a false ending | 10/14 | 0/14 |
| Summaries with any other wrong game fact | 2/14 | 2/14 |
| At-risk moments telling an unplayed move as an event | 38/42 | 2/42, both corrected by an "In the game" sentence |
| At-risk moments misstating what was played | – | 2/42 |
| Validation failures, fallbacks | 0 | 0 |

The remaining wrong facts: one summary credits the opponent's move to the
player ("you played ...Kf1") and one gives move 21's f3 to move 20; one moment
calls 40...Qh5 a bishop move, and one says "a move later" for an immediate
capture by a different piece. The moment benchmark (no LLM judge) stays at
49/49 valid with 0 phantom pieces, but its fixtures have no game record, so it
exercises only the base prompt; the in-game rules are covered by this
hand-judged corpus alone. Limits: one reader, 14 games.

## Missed chances and the hanging-piece fact (prompt 2026-10-12.1)

The base prompt explains what a move allowed. For a missed chance the mistake
is the win not taken, so `momentSystemPrompt` appends a block that tells that
story from the better line. Widening the hanging piece exposed a grounding gap:
the tactical context never says whether a piece had a defender, and the model
called every lost piece "undefended". `buildMomentPayload` now sends
`code_concept.fact` from `hangingPieceFact` ("had no defender", "had 1
defender, but a cheaper piece (their pawn) could take it", or attackers against
defenders); on the seven widened-hanging fixtures every explanation then
matched it.

Missed-chance explanations, read by hand after three prompt rounds (11
moments: 5 benchmark fixtures, 6 labelled): 7 clean. The other 4 narrate the
opponent's line when they should not, and two of those misstate it (a pawn
push told as a capture; "down a knight for a bishop"). The no-judge benchmark
stays at 49/49 valid; its 3 phantom flags are on moments with no code concept.
Next: a judged pass on missed-chance moments before treating them as solid.

## A code-checked fact for missed chances (prompt 2026-10-12.2)

The four failures above were a grounding gap, not a wording one: the payload
carried the refutation line (what the played move allowed) for a moment whose
mistake is the win not taken, and no code sentence said what that win was.
`missedChanceFact` (`concepts.ts`) now replays the stored best line and the
played line with chess.js and writes the account from the player's side:
"Nxd4 would have won a knight for nothing. Instead, Kf2 kept the material
level." or "You had mate in 5 starting with d4. After e4, it is gone." A line
that ends mid-exchange, promotes, or whose captures do not add up to the
board's net says only "won material", because a named piece would be a guess.
For this concept `buildMomentPayload` sends the fact as `code_concept.fact` and
drops `refutation_line` and the refutation annotations from
`tactical_context`; `best_move`, `best_line_moves`, `best_line_outcome` and
`in_the_game` stay. `MOMENT_MISSED_CHANCE_RULES` says to state the fact as
given and never name material the fact does not name.

No-judge benchmark, 49/49 valid, 1 phantom flag on a moment with no code
concept (`benchmark/results/2026-10-12T01-31-28-761Z.md`). The 7
missed-chance fixtures (5 distinct positions: two queen-winning captures,
two Rxd7 lines, one Rh8# in three copies) all state the fact and their
`why_better` follows `best_line_moves` capture by capture. Limits: the
fixtures hold none of the 6 labelled moments that failed before, so this is
evidence that the fact is stated and consistent, not a re-run of those
failures; the netted wording ("a knight and a pawn for nothing" when a bishop
was taken and a bishop given back) is true but may read oddly. Classification
is unchanged (pooled precision 0.937, accuracy 0.844; fresh games 34/38).

Two more code-side checks landed with it: the severity label is now
`candidateType` from code on every return path of `explainMoment` (the model's
own label had shown "Quiet drift" on mate moments), and a summary that says
"you played" a SAN which `in_the_game` attributes only to the opponent fails
validation, retries once, then falls back.

## Production grounding for missed-chance output (prompt 2026-10-12.3)

The same 11-position no-judge rerun of the old hand-check failures produced
11/11 valid responses but only 7/11 fully clean: the model still expanded
`why_better` beyond a fact that deliberately said only "won material", and
occasionally made a concrete claim about the played move's intention without
board evidence. The prompt now tells it not to do either.

Production no longer relies on that instruction alone. When the code has a
`missedChanceFact`, `explainMoment` owns `why_better` from that fact and uses a
neutral `probable_thought` ("You may have been looking for a useful move.").
The raw benchmark remains evidence about the model response, not the final
post-grounding report. The rerun artifacts are
`benchmark/results/2026-10-12T02-09-14-032Z-missed-chance-rerun.{json,md}`;
cost was $0.0025.
