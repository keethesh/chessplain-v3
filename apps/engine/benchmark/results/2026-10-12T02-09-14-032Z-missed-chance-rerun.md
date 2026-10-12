# Missed-chance rerun — prompt 2026-10-12.3

The same 11 moments as `2026-10-12T01-51-45-336Z-missed-chance-rerun`, regenerated with current `buildMomentPayload` / `momentSystemPrompt`, `openai/gpt-6-luna`, `reasoning: none`, temperature 0.2, opponent name Sam. Every call validated on attempt 1 (production retry was armed and not used). Served by OpenAI. Cost $0.00245775. Raw rows: `2026-10-12T02-09-14-032Z-missed-chance-rerun.json`.

Hand check is against chess.js replays of `bestLineSan` and the played move plus `refutationLineSan`, and against `code_concept.fact` and the payload's move facts. No LLM judge. 11/11 valid. 7/11 correct. The two earlier failures are not fixed.

| Position | Code fact | Explanation | Correct |
|---|---|---|---|
| carlinoravioli-55-013 | Qb4+ would have won a bishop for nothing. Instead, Rb1 kept the material level. | States the fact. Qb4+ checks, Kg8, Qxb6 takes the bishop. Bf5 does not recapture. The rook on b1 attacks the bishop on b6, which the input lists. | correct |
| funfunpieces-9-030 | d4 would have won a bishop for nothing. Instead, d3 kept the material level. | States the fact. d4 attacks the bishop on c5 and the pawn on e5; after Qg6, dxc5 takes the bishop. d3 defends the e4 pawn. | correct |
| nerdquestadventures-47-032 | Bxh8 would have won a rook for nothing. Instead, Qxf7+ won 2 pawns for nothing. | States the fact. Bxh8 takes the rook; Bf6 then attacks the rook on d8. Played line is Qxf7+ and Qxf5, two pawns. | correct |
| takuc2-23-036 | Nxc6 would have won a knight for nothing. Instead, a3 kept the material level. | States the fact. Nxc6 takes the knight and the stored line does not recapture it. Neutral thought; a3 attacks and defends nothing. c6 still captures nothing. | correct |
| plomo24-49-055 | Nxc4 would have won a rook and a pawn for a knight. Instead, Rac1 lost a pawn. | States the fact. Nxc4, bxc4, Qxc4+. The recapture is in the sentence. Rac1 attacks the rook on c4, which the input lists. | correct |
| liber0-25-062 | Nd6+ would have won material. Instead, Qf3 kept the material level. | What states the fact. Thought is the neutral line and no longer says the queen defends nothing. Why-better still names a queen and pawn for a knight and bishop. | incorrect |
| rep-knight-fork-c7:27 | Bxe6 would have won a queen for a bishop. Instead, Re1 kept the material level. | What and why match: Bxe6, bishop recaptures. Thought says the rook attacks or defends nothing. After Re1 it defends the pawn on e4, the queen on d1, and the king on g1. | incorrect |
| rep-knight-fork-c7:37 | Nxe6+ would have won a queen and a pawn for a knight. Instead, Nf3 kept the material level. | States the fact. Nxe6+, fxe6, Rxa6. The f-pawn recapture is in the sentence. Nf3 attacks the pawn on e5, which the input lists. | correct |
| rep-steady-draw:25 | Rxd7 would have won a bishop for nothing. Instead, Kf1 kept the material level. | What and why match, including the rook trade on d8. Thought says the king moves away from the back rank. Kf1 stays on f1. | incorrect |
| rep-steady-draw:29 | Rxd7 would have won a knight and a pawn for nothing. Instead, Bd2 kept the material level. | What states the fact. Thought is neutral. Why-better takes the bishop, the knight, and the b7 pawn, skips exd5, and says the line finishes a bishop ahead. | incorrect |
| prod-dd73fe8b:87 | You had mate in 1 starting with Rh8#. After Rhh7, it is gone. | States the fact. Rh8# is checkmate. Mate reason: own rook blocks e8, a7 covers e7/f7/g7, the rook on h8 covers g8, and nothing captures the rook or blocks the check. The played Re7 / exd3 line is not told as the mistake. | correct |

## Incorrect claims

**liber0-25-062.** `why_better`: "13.Nd6+ checks the king and starts a line that wins the queen for a knight and bishop, while also taking a pawn." The stored line does those captures (Ndxf7 pawn, Nxe5 knight, Nxd8 queen, Nxd3 bishop). It ends on Nxd3, and Qxd3 is legal, so `missedChanceFact` says only "won material". The sentence names the pieces the fact withholds and states the pre-recapture tally as the win. `what_actually_happens` quotes the fact. `probable_thought` is now "You may have been looking for a useful move." After Qf3 the queen still defends the knight on e4 and the bishop on d3; this run does not deny that. The material sentence is the same error as the 2026-10-12.2 rerun.

**rep-steady-draw:29.** `why_better`: "15.Rxd7 takes the bishop; after the knight moves to d5, your bishop takes it, then your rook takes the b7 pawn. You finish a bishop ahead in the exchanges." `best_line_moves` are Rxd7 (bishop), Nd5, Bxd5 (knight), exd5 (opponent takes that bishop), Rxb7 (pawn). The fact's knight-and-pawn net is right only because exd5 gives the bishop back. The sentence never says that, and "a bishop ahead" contradicts both the fact and `best_line_outcome` ("you have lost a bishop and the opponent has lost a bishop and a knight and a pawn"). Not fixed.

**rep-knight-fork-c7:27.** `probable_thought`: "The move does not attack or defend anything immediately." The input's `attacks_after_move` is empty, so the attack half matches. After Re1, chess.js `attackers` includes e1 for the pawn on e4, the queen on d1, and the king on g1. The 2026-10-12.2 thought only said there was no attack or capture in the given facts.

**rep-steady-draw:25.** `probable_thought`: "The king steps from g1 to f1 to move away from the back rank." The king moves from g1 to f1 and is still on the back rank. What and why still match the fact, including the rook trade. The 2026-10-12.2 thought only said the king left g1.

## Coverage

- This is the earlier 11 only. Not the other two Rh8 fixture copies, and not the rest of the labelled missed-chance set.
- No `in_the_game` on any of the 11.
- One sample each. Elo bands are `mapEloToBand` for the labelled rows and the fixture's own band.
- Prompt 2026-10-12.3 did not remove the two named material errors. It replaced both of those probable thoughts with the neutral line. Two other thoughts are new false claims, so this sample is 7/11 rather than the previous 9/11.
