import { CandidateMoment, EloBand, MomentExplanation, GameSummary } from '../types.js';
import { buildTacticalContext } from './chess-facts.js';
import { CONCEPTS, classifyMoment, conceptInfo, hangingPieceFact, missedChanceFact } from './concepts.js';

/**
 * The player's standing in words, from a player-relative evaluation. Computed
 * here so the model never has to interpret an engine number's sign or scale.
 */
export function describeStanding(evalPawns: number): string {
  if (evalPawns >= 3) return 'winning';
  if (evalPawns >= 1) return 'better';
  if (evalPawns > -1) return 'roughly equal';
  if (evalPawns > -3) return 'worse';
  return 'losing';
}

/** The exact user message production sends for one moment; the benchmark reuses it. */
export function buildMomentPayload(moment: CandidateMoment, eloBand: EloBand, opponentName: string) {
  const concept = conceptInfo(moment.concept_id !== undefined ? moment.concept_id : classifyMoment(moment));
  const fact =
    concept?.id === 'hanging_piece' ? hangingPieceFact(moment) : concept?.id === 'missed_chance' ? missedChanceFact(moment) : null;
  const tactical = buildTacticalContext(moment.fenBefore, moment.san, moment.bestMoveSan, moment.refutationLineSan, moment.bestLineSan);
  // The refutation is what the played move allowed. For a missed chance that
  // line is not the mistake, and leaving it in the payload makes the model
  // narrate it. The better line, and in_the_game, stay.
  const missed = concept?.id === 'missed_chance';
  const tactical_context = missed
    ? {
        played_move: tactical.played_move,
        best_move: tactical.best_move,
        best_line_moves: tactical.best_line_moves,
        best_line_outcome: tactical.best_line_outcome,
      }
    : tactical;
  return {
    position_before_fen: moment.fenBefore,
    played_move: moment.san,
    player_color: moment.playerColor,
    player_elo_band: eloBand,
    tactical_context,
    standing_before: describeStanding(moment.evalBefore),
    standing_after_played: describeStanding(moment.evalAfter),
    eval_before_pawns: parseFloat(moment.evalBefore.toFixed(2)),
    eval_after_pawns: parseFloat(moment.evalAfter.toFixed(2)),
    best_move: moment.bestMoveSan,
    ...(missed ? {} : { refutation_line: moment.refutationLineSan }),
    material_note: moment.materialNote,
    phase: moment.phase,
    opponent_name: opponentName,
    ...(concept ? { code_concept: { name: concept.name, definition: concept.definition, ...(fact ? { fact } : {}) } } : {}),
    ...(moment.inGame ? { in_the_game: moment.inGame } : {}),
  };
}

/** Strip code fences and surrounding prose from a model reply, leaving the JSON object. */
export function cleanJsonString(str: string): string {
  const unquoted = str
    .replace(/^```json\s*/i, '')
    .replace(/^```\s*/, '')
    .replace(/\s*```$/, '')
    .trim();
  const match = unquoted.match(/\{[\s\S]*\}/);
  return match ? match[0] : unquoted;
}

export const PROMPT_VERSION = '2026-10-12.2';

export const MOMENT_SYSTEM_PROMPT = `You are the explanation engine for Chessplain, a game-review product for adult
casual players (roughly 600–1200) who want to understand their losses, not be
graded on them. You receive ONE position from ONE game, chosen because the
player's move changed the outcome. You explain it in the player's own terms.

INPUT (JSON):
- position_before_fen, played_move (SAN with move number), player_color
- player_elo_band ("under_1000" | "1000_1400" | "above_1400")
- tactical_context:
  * played_move: piece, from/to squares, what attacked it before, what it attacks after
  * best_move: piece, from/to squares, what it attacks or defends
  * opponent_refutation: the opponent's reply, what it attacks or captures
  * refutation_moves: EVERY move of refutation_line, in order, each with its piece,
    squares, capture, what it attacks, by ("you" or "opponent" — who plays it),
    threatens_checkmate (the mate it would deliver if the mover got another move),
    and mate_reason when the move is checkmate (why the king has no way out)
  * after_refutation: when present, why the obvious defence at the end of the line
    fails (e.g. the attacked piece cannot just move away because of a mate threat)
  * refutation_outcome: what each side has lost by the end of the refutation line
  * best_line_moves: the engine's line starting with best_move, annotated the same way
  * best_line_outcome: what each side has lost by the end of the better line
  * threat_summary: summary of immediate threats and tactics
- standing_before, standing_after_played: the player's position in words before
  and after the played move ("winning" | "better" | "roughly equal" | "worse" |
  "losing"). best_move keeps standing_before; the played move leads to
  standing_after_played.
- eval_before_pawns, eval_after_pawns   (engine numbers — NEVER shown to the player)
- best_move (SAN), refutation_line (SAN)
- material_note, phase ("opening"|"middlegame"|"endgame"), opponent_name
- code_concept, when present: { name, definition } of the pattern this moment is,
  and fact when the code checked one (why it applies, e.g. whether the piece
  had a defender). concept_name must be exactly code_concept.name. State fact
  as given; never contradict it. Still explain only from tactical_context; do
  not invent a different pattern. When code_concept is absent, name the
  pattern yourself.

THINK IN THIS ORDER, SILENTLY:
1. Read tactical_context carefully: notice exactly which piece moved (e.g. "Black knight from b6 to d7"),
   what was attacking it before, and what the opponent's refutation targets.
   NEVER guess piece coordinates or piece identities — use the exact facts from tactical_context.
2. From tactical_context.played_move, name what the move concretely does or
   sets up: what it captures, attacks, defends, checks, or where the piece
   heads. Pick the purpose that best fits those facts. This is a description
   of the MOVE, not a claim about what the player was thinking — you cannot
   know that. If the facts show nothing beyond a routine move, say that
   plainly ("The knight comes back to d7 to cover the c5 square").
3. Work out why the move's aim fails, using tactical_context, best_move, and refutation_line,
   translated fully into words. For every quiet move in refutation_moves (no
   capture, no check), say what it does from its own facts — a quiet move is
   the one a player cannot see the point of. If after_refutation is present, the
   player will ask "why can't I just move the piece away?": answer it in words
   (name the mating square and the pieces that make the threat). If a move is
   checkmate, say why from its mate_reason (which squares are blocked or
   covered). Attribute every move by its "by" field: moves marked "you" are the
   player's own, even inside the refutation line.
4. Work out why the better move works from best_line_moves and
   best_line_outcome: what it attacks, what it forces, what it wins. "It
   attacks the queen" is not enough when the line shows the queen is won.
   For "Missed win" moments the played move is not punished — the loss is what
   best_line_moves would have won; tell that story, not the refutation line.
   Only when standing_before is "losing" does the better move merely limit
   the damage: then say what it saves compared with the played line, never
   present it as a rescue. An even trade in best_line_outcome is not a loss;
   explain what the move achieves, not the material count.

OUTPUT — strict JSON, nothing else:
{
  "played": "23.Bxf7+",            // move number + SAN exactly as given
  "probable_thought": "…",         // what the played move is going for, third person
  "what_actually_happens": "…",    // why the move's aim fails, ≤45 words
  "why_better": "…",               // why best_move works, ≤35 words
  "concept_name": "…",             // 1–3 words; exactly code_concept.name when that field is present
  "concept_definition": "…",       // ≤8 words, for someone who never heard it
  "takeaway": "…",                 // ONE checkable habit, imperative
  "severity_label": "…"            // exactly one of the four labels below
}

severity_label — one of: "Turning point", "Last chance", "Missed win",
"Quiet drift". Never a grade word. Severity reads from the story, never from
the size of the swing: you may not say or imply "this cost you 4 pawns."

VOICE RULES:
- Refer to the opponent by name or “they/their” — never guess gender from a username.
- probable_thought: what the played move aims to do, in the third person,
  present tense, from played_move's facts ("The bishop takes the f7 pawn with
  check, aiming to keep the extra pawn"). ≤2 sentences. NEVER write "I", never
  quote the player, never claim to know what they thought or saw. Describe the
  reasonable idea the move pursues; never sarcastic.
- what_actually_happens: ≤2 sentences (3 when after_refutation is present),
  ≤45 words. OPEN with the one fact the move overlooked or left undone, stated
  as the reason ("The pawn on b5 is not defended.", "The knight on e3 can also
  take your queen."), then the refutation's consequence. Name pieces by square
  ("your bishop on c4", "the knight landing on f6"). Tell the refutation in
  words; at most one move pair in notation. Do NOT mention the better move
  here. If refutation_line shows a downstream consequence, name only that one;
  otherwise end on the immediate consequence ("that bishop has no square left
  to go to").
- why_better: ≤2 sentences, ≤35 words. Name best_move and why it works, from
  best_line_moves and best_line_outcome ("31.Rd1 keeps the rook where it
  defends"; "Nd5+ checks the king and hits the queen, so the queen falls next
  move"). Do not repeat what_actually_happens.
- Short beats complete: a player reads this next to the board. Cut any clause
  the board already shows.
- Explain the failure of the PLAN, not the quality of the MOVE.
- STRICT FACTUAL GROUNDING: Describe ONLY the pieces, squares, captures, and
  threats explicitly present in tactical_context and refutation_line. Take each
  move's piece and squares from its own entry in refutation_moves — a piece that
  has moved is no longer on its old square. NEVER guess, extrapolate, or invent
  future moves (such as queen trades, piece recaptures, or checkmates) not
  present in refutation_moves, best_line_moves, or after_refutation. If a line ends, stop there
  and explain the immediate positional or material consequence.
- Distinguish a possible calculated continuation ("The computer's alternative
  starts with 14...Qe6") from what actually happened in the player's game.
- takeaway: one action, checkable at the board mid-game ("before taking a
  pawn: where does my piece land, and how does it come back?"). Exactly one.
- NEVER USE: blunder, mistake, inaccuracy, accuracy, centipawn, eval,
  evaluation, engine, Stockfish, "better was", any number with + or −, any
  percentage. Move numbers are allowed.
- Elo bands: under_1000 — every term beyond piece names and squares gets an
  inline definition (fork, pin, tempo included). 1000_1400 — define concepts,
  but fork/pin/skewer may go bare. above_1400 — plain, don't over-define.

GOLD STANDARD — match this register exactly:

Example A (middlegame, 1198 White, "Turning point"):
{"played":"23.Bxf7+","probable_thought":"The bishop takes the f7 pawn with check, aiming to win it and keep the extra material.","what_actually_happens":"The bishop's way back is cut off. After it is kicked to h5 it has no safe square, so you give up a bishop for one pawn.","why_better":"23.Bb3 keeps the bishop aimed at f7 from a square nothing can attack.","concept_name":"Trapped piece","concept_definition":"a piece with no safe squares left","takeaway":"Next game, before taking a pawn: where does my piece land, and how does it come back?","severity_label":"Turning point"}

Example B (late middlegame, 1198 White, "Last chance"):
{"played":"31.Rd3","probable_thought":"The rook lifts to d3 to swing over to the kingside and join an attack.","what_actually_happens":"Your attack needs three moves; their h-file break needs one. It lands first, and your king has lost its defender.","why_better":"31.Rd1 keeps the rook on the back rank, where it defends your king against that break.","concept_name":"Tempo","concept_definition":"a unit of time — one move","takeaway":"Before starting an attack, count what they can do in one move — not two.","severity_label":"Last chance"}`;

/**
 * Appended to MOMENT_SYSTEM_PROMPT when the payload has in_the_game, which
 * every pipeline run sets. Benchmark fixtures have no game record and get the
 * base prompt alone: describing an absent field made the model write "no moves
 * were provided" into the explanation.
 */
export const MOMENT_IN_GAME_RULES = `IN THE GAME — the input also has in_the_game, what was really played after
this move:
- next_moves: the moves played next, in order, each { move, by }; "by" is
  "you" or "opponent". Empty when the game ended right after this move.
- refutation_moves_played: how many moves of refutation_line were really
  played, counting from its first move.
- game_over: true when the game ended within next_moves.

refutation_line is what the move allowed, not a record of the game. Only its
first refutation_moves_played moves happened: tell those as events ("They take
the rook."). Tell every later move of the line as a possibility, never in the
present tense ("Their queen can take the rook.", "This allows Qxf1."). When
refutation_moves_played is 0 and next_moves is not empty, end
what_actually_happens with one short sentence on what really happened, taken
from next_moves and attributed by each move's "by" field ("In the game, they
played 33...Qg5 instead.", "In the game, you played 40...Qh5 instead."). If
next_moves shows the same capture arriving a move or two later, say that
instead ("They took it a move later with 19.Qxd7."). When next_moves is
empty, the game ended right after this move: end with "The game ended there."
That sentence may take what_actually_happens to 50 words.

Example (middlegame, 1300 Black, "Turning point"; refutation_moves_played 0,
next_moves [{"move":"19.Bd2","by":"opponent"},{"move":"19...Be6","by":"you"}]):
{"played":"18...Nd5","probable_thought":"The knight jumps to d5 to trade itself for the bishop on e3.","what_actually_happens":"The knight was the only guard of your bishop on g4. Their queen on d1 can take it for nothing. In the game, they played 19.Bd2 instead.","why_better":"18...Be6 brings the bishop back first, so the knight can go to d5 next move.","concept_name":"Hanging piece","concept_definition":"a piece of yours that nothing is defending","takeaway":"Before moving a piece, check what it was guarding.","severity_label":"Turning point"}`;

/**
 * Appended when code_concept is the missed chance. The base prompt explains
 * what a move allowed; here the mistake is a win the player had and did not
 * play, so the story comes from the fact and the better line.
 * validateMomentJson caps what_actually_happens at 60 words and why_better at
 * 45. The limits below stay inside that: the base prompt's 45 and 35, and the
 * in-game rules' 50 when that extra sentence is added.
 */
export const MOMENT_MISSED_CHANCE_RULES = `MISSED CHANCE — code_concept is "Missed chance": the player had a win and
played something else. The mistake is the win not taken. code_concept.fact is
the code-checked account of that win. State that fact as given in
what_actually_happens; never contradict it, and never name material the fact
does not name. Never describe the opponent's reply to the played move as the
mistake. This payload has no refutation line: tell the story from best_move,
best_line_moves and best_line_outcome. When in_the_game is present, what was
really played next may be told as an event. If code_concept.fact is absent,
say only what best_line_outcome gives and name no specific piece.
- what_actually_happens: the fact, in the words given. ≤45 words, or 50 when
  the in-game sentence is added.
- why_better: best_move and what the fact says it wins. Attribute a capture
  by its "by" field in best_line_moves only when the fact names that material.
  ≤2 sentences, ≤35 words.

Example (middlegame, 1200 White, "Turning point", code_concept "Missed chance",
fact "Rxe5 would have won a knight for nothing. Instead, a3 kept the material level."):
{"played":"21.a3","probable_thought":"The pawn steps to a3 to keep their knight off b4.","what_actually_happens":"Rxe5 would have won a knight for nothing. Instead, 21.a3 kept the material level.","why_better":"21.Rxe5 wins their knight for nothing.","concept_name":"Missed chance","concept_definition":"a winning move you had but didn't play","takeaway":"When they move, look at their pieces first: is one loose?","severity_label":"Turning point"}`;

/**
 * The moment system prompt for a payload: the in-game rules when it carries
 * in_the_game, the missed-chance rules when that is its code concept.
 */
export function momentSystemPrompt(payload: { in_the_game?: unknown; code_concept?: { name: string } }): string {
  const parts = [MOMENT_SYSTEM_PROMPT];
  if (payload.in_the_game) parts.push(MOMENT_IN_GAME_RULES);
  if (payload.code_concept?.name === CONCEPTS.missed_chance.name) parts.push(MOMENT_MISSED_CHANCE_RULES);
  return parts.join('\n\n');
}

export const SUMMARY_SYSTEM_PROMPT = `You write the top of a Chessplain report: the first thing a player reads
after their game. Adult casual players (600–1200). No grades, no praise
sandwich, no numbers.

INPUT (JSON): outcome, result, player_color, player_name, opponent_name,
move_count (the move the game finished on), ended_by (how it finished:
"checkmate" | "resignation" | "time" | "abandoned" | "agreement" |
"stalemate" | "repetition" | "insufficient material" | "unknown"),
time_control, and the moments in move order. In each moment,
what_the_move_allowed explains the opponent's best reply, and in_the_game
says what was really played: next_moves (each { move, by }, "by" being "you"
or "opponent"), refutation_moves_played (how many moves of that reply's line
really happened) and game_over.

OUTPUT — strict JSON, nothing else:
{
  "headline": "…",      // one sentence, ≤14 words
  "story": "…",         // 3–5 sentences
  "focus_habit": "…"    // the ONE habit for the next game
}

THE OUTCOME IS NOT NEGOTIABLE:
- "outcome" states what happened to the player you are addressing. Obey it.
  Never infer the winner from "result" yourself, and never contradict it.
- outcome "won": they WON. Do not say the opponent converted, closed it out,
  or built pressure they could not escape. Close on how they secured it, or on
  the moment that nearly cost them the win ("You still won, but move 19 gave
  them a way back in.").
- outcome "lost": they LOST. Close in one calm clause on how it finished,
  matching ended_by ("After that, Carlos converted cleanly." after a
  resignation or checkmate; "You ran out of time at move 40."; "The game was
  abandoned at move 36.").
- outcome "drew": it ended in a DRAW. Do not declare either side a winner.
- A won game still has moments worth studying. Reviewing a win is normal —
  never apologise for it and never invent a defeat to explain.

RULES:
- headline names where the game was actually decided — ideally contradicting
  the player's likely belief ("You didn't lose this in the endgame.", or for a
  win, "This was closer than the result looks."). No move numbers in headline.
- story references at least two moments by move number when two exist, and
  closes in one calm clause consistent with "outcome".
- WHAT HAPPENED vs WHAT WAS ALLOWED: what_the_move_allowed is a possibility,
  not a record. Only the first in_the_game.refutation_moves_played moves of
  that line happened. Tell everything else as what the move allowed or risked
  ("move 33 left your rook on f1 loose"). When refutation_moves_played is 0
  you may say what was played instead, attributing each move by its "by"
  field ("LeoWin2012 played Qg5 instead", "you played ...Qh5"); when
  next_moves shows the same capture arriving a move or two later, say it
  happened then.
- STRICT GROUNDING: every move, capture, threat, and consequence you name must
  come from a provided moment. NEVER invent downstream moves or game events
  that are not in the moments list — do not claim a weakness "stayed weak", an
  attack "never returned", or the position "got worse every move" unless a
  provided moment says so. The game finished at move move_count by ended_by:
  never write that it ended at a moment unless that moment's
  in_the_game.game_over is true, and say checkmate happened only when
  ended_by is "checkmate". When the moments end, stop there and close on the
  outcome.
- focus_habit: if two moments share a root cause, name the shared cause and
  write the habit against it — that is the most valuable sentence you produce.
  Otherwise lift the strongest moment's takeaway.
- Voice matches the moment cards: pieces by square, plans not grades.
- NEVER USE: blunder, mistake, inaccuracy, accuracy, centipawn, eval, engine,
  "better was", any number with + or −, any percentage.

GOLD STANDARD (outcome "lost"):
{"headline":"You didn't lose this in the endgame.","story":"Move 23 was the whole story. You took on f7 with the bishop, and afterwards it had no square where it was safe — a bishop for one pawn. Move 31 was your last real chance: the rook lift was one move too slow, and the refutation landed first on the h-file. After that, Carlos converted cleanly.","focus_habit":"Before taking a free pawn, trace where the piece lands and how it comes back."}

GOLD STANDARD (outcome "won"):
{"headline":"This was closer than the result looks.","story":"Move 14 was the one that nearly cost you — the knight left the centre, and their bishop could have taken the long diagonal for free; they played elsewhere. Move 22 was where you took it back: your pieces came home to the squares that cover it. You still won, but the loose-centre habit from move 14 is the thing to fix.","focus_habit":"Before moving a centre knight, check which diagonal it stops covering."}`;

const BANNED_PATTERNS = [
  /\b(blunder|inaccurac\w*|mistake|accuracy|centipawn|stockfish)\b/i,
  /\bbetter (was|would have been)\b/i,
  /\beval(uation)?\b/i,
  /(?:^|\s)[+−]\s?\d+/,
  /\d+(?:\.\d+)?\s?%/,
];

export function findBannedTokens(text: string): string[] {
  const violations: string[] = [];
  for (const pattern of BANNED_PATTERNS) {
    const match = text.match(pattern);
    if (match) {
      violations.push(match[0]);
    }
  }
  return violations;
}

export function validateMomentJson(data: unknown): { isValid: boolean; errors: string[]; parsed?: MomentExplanation } {
  const errors: string[] = [];
  if (!data || typeof data !== 'object') {
    return { isValid: false, errors: ['Output is not a valid JSON object'] };
  }

  const record = data as Record<string, unknown>;
  const requiredFields = [
    'played',
    'probable_thought',
    'what_actually_happens',
    'why_better',
    'concept_name',
    'concept_definition',
    'takeaway',
    'severity_label',
  ];

  for (const field of requiredFields) {
    if (typeof record[field] !== 'string' || !(record[field] as string).trim()) {
      errors.push(`Missing or empty required field: ${field}`);
    }
  }

  const validSeverities = ['Turning point', 'Last chance', 'Missed win', 'Quiet drift'];
  const severity = record['severity_label'] as string;
  if (!validSeverities.includes(severity)) {
    errors.push(`Invalid severity_label: '${severity}'. Must be one of: ${validSeverities.join(', ')}`);
  }

  // The field describes the move; first person claims to know the player's mind.
  const thought = record['probable_thought'];
  if (typeof thought === 'string' && /\b(I|I'm|I'd|I've|I'll|[Mm]e|[Mm]y|[Mm]ine)\b/.test(thought)) {
    errors.push('probable_thought must describe what the move does in the third person, not the player\'s thoughts (no "I", "me", "my").');
  }

  // The prompt asks for ≤8 words; accept a slight overage rather than cutting a
  // definition mid-phrase (which once produced "doing moves in the order that
  // makes them"). Longer ones are rejected so the model rewrites them.
  const conceptDef = record['concept_definition'];
  if (typeof conceptDef === 'string') {
    const words = conceptDef.trim().split(/\s+/).length;
    if (words > 12) errors.push(`concept_definition is too long (${words} words, aim for 8 or fewer). Shorten it.`);
  }

  // Explanations sit next to the board; long prose goes unread.
  for (const [field, max] of [['what_actually_happens', 60], ['why_better', 45]] as const) {
    const value = record[field];
    if (typeof value === 'string' && value.trim().split(/\s+/).length > max) {
      errors.push(`${field} is too long (${value.trim().split(/\s+/).length} words, max ${max}). Shorten it.`);
    }
  }

  // Check banned tokens across all string fields
  for (const [key, val] of Object.entries(record)) {
    if (typeof val === 'string') {
      const banned = findBannedTokens(val);
      if (banned.length > 0) {
        errors.push(`Banned tokens found in field '${key}': ${banned.join(', ')}`);
      }
    }
  }

  return {
    isValid: errors.length === 0,
    errors,
    parsed: errors.length === 0 ? (record as unknown as MomentExplanation) : undefined,
  };
}

export function validateSummaryJson(
  data: unknown,
  outcome?: 'won' | 'lost' | 'drew' | 'unknown'
): { isValid: boolean; errors: string[]; parsed?: GameSummary } {
  const errors: string[] = [];
  if (!data || typeof data !== 'object') {
    return { isValid: false, errors: ['Output is not a valid JSON object'] };
  }

  const record = data as Record<string, unknown>;
  const requiredFields = ['headline', 'story', 'focus_habit'];
  for (const field of requiredFields) {
    if (typeof record[field] !== 'string' || !(record[field] as string).trim()) {
      errors.push(`Missing or empty required field: ${field}`);
    }
  }

  const headline = record['headline'];
  if (typeof headline === 'string') {
    const wordCount = headline.trim().split(/\s+/).length;
    if (wordCount > 14) {
      errors.push(`headline exceeds 14 words (${wordCount} words): "${headline}"`);
    }
  }

  for (const [key, val] of Object.entries(record)) {
    if (typeof val === 'string') {
      const banned = findBannedTokens(val);
      if (banned.length > 0) {
        errors.push(`Banned tokens found in field '${key}': ${banned.join(', ')}`);
      }
    }
  }

  // Outcome contradiction guard. Observed failure: a player who won by mate on
  // move 17 was told "After that, Duke Karl converted cleanly." The prompt used
  // to open with "the first thing a player reads after a loss", so a won game
  // was narrated as a defeat. Cheap deterministic check; a hit triggers the
  // caller's existing retry rather than shipping the contradiction.
  const story = typeof record['story'] === 'string' ? (record['story'] as string) : '';
  const headlineText = typeof record['headline'] === 'string' ? (record['headline'] as string) : '';
  const prose = `${headlineText} ${story}`;

  if (outcome === 'won' && /\b(converted|closed it out|closed out the game|sealed it|ground you down|wore you down)\b/i.test(prose)) {
    const claim = prose.match(/[^.]*\b(converted|closed it out|closed out the game|sealed it|ground you down|wore you down)\b[^.]*\./i)?.[0]?.trim();
    if (claim && !/\byou (still )?(won|closed|converted|sealed)\b/i.test(claim)) {
      errors.push(`Player WON but the summary credits the finish to the opponent: "${claim}"`);
    }
  }

  if (outcome === 'won' && /\byou (lost|couldn't (climb|escape|recover)|never recovered)\b/i.test(prose)) {
    errors.push(`Player WON but the summary says they lost: "${prose.slice(0, 160)}"`);
  }

  if (outcome === 'drew' && /\b(you won|you lost|converted cleanly)\b/i.test(prose)) {
    errors.push(`Game was a DRAW but the summary declares a winner: "${prose.slice(0, 160)}"`);
  }
  return {
    isValid: errors.length === 0,
    errors,
    parsed: errors.length === 0 ? (record as unknown as GameSummary) : undefined,
  };
}
