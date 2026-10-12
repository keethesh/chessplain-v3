# Missed-chance rerun — prompt 2026-10-12.2

The 11 moments from the pre-fact hand check (5 fixtures + 6 labelled in `labelled.json`), regenerated with current `buildMomentPayload` / `momentSystemPrompt`, `openai/gpt-6-luna`, `reasoning: none`, temperature 0.2, opponent name Sam. Every call validated on attempt 1 (production retry was armed). Served by OpenAI. Cost $0.0017. Raw rows: `2026-10-12T01-51-45-336Z-missed-chance-rerun.json`.

Hand check is against chess.js replays of `bestLineSan` and the played move plus `refutationLineSan`, and against `code_concept.fact`. No LLM judge. 9/11 correct. Both earlier named misstatements are gone: `12...c6` is a pawn push (`captured: null` after Nxd4 Rxd4), and the liber0 refutation Nxf6+ Nxf6 is an equal knight-for-bishop trade, which the fact correctly calls material level.

| Position | Code fact | Explanation | Correct |
|---|---|---|---|
| carlinoravioli-55-013 | Qb4+ would have won a bishop for nothing. Instead, Rb1 kept the material level. | Qb4+ would have won a bishop for nothing. Instead, 28.Rb1 kept the material level. 28.Qb4+ checks, Kg8, queen takes the bishop on b6. | correct |
| funfunpieces-9-030 | d4 would have won a bishop for nothing. Instead, d3 kept the material level. | States the fact. 5.d4 attacks the bishop on c5 and the pawn on e5; after Qg6, dxc5 takes the bishop. | correct |
| nerdquestadventures-47-032 | Bxh8 would have won a rook for nothing. Instead, Qxf7+ won 2 pawns for nothing. | States the fact. Bxh8 takes the rook; the bishop goes to f6. Played line is Qxf7+ and Qxf5, two pawns, nothing given back. | correct |
| takuc2-23-036 | Nxc6 would have won a knight for nothing. Instead, a3 kept the material level. | States the fact. Nxc6 takes the knight and the line loses nothing. The old "c-pawn takes your rook" is not repeated; c6 captures nothing. | correct |
| plomo24-49-055 | Nxc4 would have won a rook and a pawn for a knight. Instead, Rac1 lost a pawn. | States the fact. Nxc4, bxc4, Qxc4+. Played line's only capture is Qxd4+. | correct |
| liber0-25-062 | Nd6+ would have won material. Instead, Qf3 kept the material level. | What states the fact. Why-better says the line wins a queen and pawn for a bishop and knight. Probable thought says Qf3 attacks or defends nothing. | incorrect |
| rep-knight-fork-c7:27 | Bxe6 would have won a queen for a bishop. Instead, Re1 kept the material level. | States the fact. Bxe6, bishop recaptures. | correct |
| rep-knight-fork-c7:37 | Nxe6+ would have won a queen and a pawn for a knight. Instead, Nf3 kept the material level. | States the fact. Nxe6+, fxe6, Rxa6. | correct |
| rep-steady-draw:25 | Rxd7 would have won a bishop for nothing. Instead, Kf1 kept the material level. | States the fact. Rxd7, then the rooks trade on d8, extra bishop remains. The fact nets that rook trade into "for nothing"; the sentence spells the trade and still matches the line. | correct |
| rep-steady-draw:29 | Rxd7 would have won a knight and a pawn for nothing. Instead, Bd2 kept the material level. | What states the fact. Why-better takes the bishop, the knight, and the b7 pawn, and skips exd5, which takes the bishop back. | incorrect |
| prod-dd73fe8b:87 | You had mate in 1 starting with Rh8#. After Rhh7, it is gone. | States the fact. Rh8# is checkmate in chess.js. The old Re7 / exd3 narration is absent. | correct |

## Incorrect claims

**liber0-25-062.** `why_better`: "the line wins a queen and pawn for a bishop and knight." The stored line does those captures (Ndxf7 pawn, Nxe5 knight, Nxd8 queen, Nxd3 bishop) and the board is then +queen +pawn −knight −bishop. It ends on Nxd3, and the knight on d3 is undefended; Qxd3 is legal. `missedChanceFact` therefore says only "won material" (`replayMaterial` marks the line unsettled when the last move is a capture the other side can still take). The sentence names pieces the fact withholds, and it states the pre-recapture tally as the win. `probable_thought`: "the move attacks or defends nothing immediately." After Qf3 the queen has no capture, but it defends the knight on e4 and the bishop on d3.

**rep-steady-draw:29.** `why_better`: "Rxd7 takes the bishop; after the knight moves, your bishop takes that knight and your rook collects a pawn, winning a knight and a pawn for nothing." `best_line_moves` are Rxd7 (bishop), Nd5, Bxd5 (knight), exd5 (opponent takes that bishop), Rxb7 (pawn). The net in the fact is right only because exd5 gives the bishop back. The sentence never says that. Grounding that is doing its job: `best_line_outcome` is "you have lost a bishop and the opponent has lost a bishop and a knight and a pawn."

## Coverage

- This is the earlier 11 only. Not the other two Rh8 fixture copies (`prod-7342a0d3:87`, `prod-62aa9c6e:87`), and not the rest of the labelled missed-chance set.
- No `in_the_game` on any of the 11. Fixtures and these labelled candidates have no played continuation, so the in-game sentence was not tested.
- One sample each. Elo bands are `mapEloToBand` for the labelled rows and the fixture's own band.
- The fact's "for nothing" is a net. A cancelled trade inside the line (the rook trade on `rep-steady-draw:25`, the bishop trade on `rep-steady-draw:29`) is true as a net and easy to mis-tell. That is the remaining grounding gap, not a return of the refutation-line narration.
