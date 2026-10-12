import { Chess, Square } from 'chess.js';
import type { CandidateMoment } from '../types.js';
import {
  buildTacticalContext,
  explainMate,
  extractMoveFacts,
  findMateThreats,
  getAttackersOfSquare,
  type TacticalContext,
} from './chess-facts.js';
import { MATE_PAWNS } from './select.js';

export type ConceptId =
  | 'hanging_piece'
  | 'double_attack'
  | 'missed_mate_threat'
  | 'weak_back_rank'
  | 'losing_exchange'
  | 'missed_chance';

export interface ConceptInfo {
  id: ConceptId;
  name: string;
  gremlin: string;
  definition: string;
  habit: string;
}

export const CONCEPTS: Record<ConceptId, ConceptInfo> = {
  hanging_piece: {
    id: 'hanging_piece',
    name: 'Hanging piece',
    gremlin: 'The Hanger',
    definition: 'A piece nothing defends, or a cheaper piece can take.',
    habit: 'Before you let go of a piece, check: can it be taken for free, or by something cheaper?',
  },
  double_attack: {
    id: 'double_attack',
    name: 'Double attack',
    gremlin: 'Double Trouble',
    definition: 'One move that hits two of your pieces at once.',
    habit: 'Before you move, ask: can one enemy piece hit two of mine?',
  },
  missed_mate_threat: {
    id: 'missed_mate_threat',
    name: 'Missed mate threat',
    gremlin: 'The Mate Misser',
    definition: 'A checkmate, or a mate threat you cannot stop.',
    habit: 'Before you move, look for a check that mates on their next move.',
  },
  weak_back_rank: {
    id: 'weak_back_rank',
    name: 'Weak back rank',
    gremlin: 'The Back-Rank Sleeper',
    definition: 'A rook or queen mates your king along the back rank.',
    habit: 'Before you move a piece off the back rank, check whether a rook or queen can mate there.',
  },
  losing_exchange: {
    id: 'losing_exchange',
    name: 'Losing exchange',
    gremlin: 'The Bad Trader',
    definition: 'A capture on a defended square that still costs material.',
    habit: 'Before you capture, count attackers and defenders, then whose piece is worth more.',
  },
  missed_chance: {
    id: 'missed_chance',
    name: 'Missed chance',
    gremlin: 'The Daydreamer',
    definition: "A winning move you had but didn't play.",
    habit: 'When they move, look at their pieces first: is one loose, or can you hit two at once?',
  },
};

export const CONCEPT_IDS: ConceptId[] = [
  'hanging_piece',
  'double_attack',
  'missed_mate_threat',
  'weak_back_rank',
  'losing_exchange',
  'missed_chance',
];

const PIECE_VALUE: Record<string, number> = { p: 1, n: 3, b: 3, r: 5, q: 9 };
const PIECE_WORD: Record<string, string> = {
  pawn: 'p',
  knight: 'n',
  bishop: 'b',
  rook: 'r',
  queen: 'q',
  king: 'k',
};

export function conceptInfo(id: ConceptId | null | undefined): ConceptInfo | null {
  if (!id) return null;
  return CONCEPTS[id] ?? null;
}

function stripSan(san: string): string {
  return san.replace(/^\d+\.+/, '').trim();
}

function lineSans(line: string): string[] {
  return line.replace(/\d+\.+/g, ' ').trim().split(/\s+/).filter(Boolean);
}

function playerOf(candidate: CandidateMoment): 'w' | 'b' | null {
  if (candidate.playerColor !== 'white' && candidate.playerColor !== 'black') return null;
  try {
    const turn = new Chess(candidate.fenBefore).turn();
    const player = candidate.playerColor === 'white' ? 'w' : 'b';
    return turn === player ? player : null;
  } catch {
    return null;
  }
}

function defenderCount(fen: string, square: string, color: 'w' | 'b'): number {
  return new Chess(fen).attackers(square as Square, color).length;
}

/** Opponent to move, so a listed mate threat can actually be played. */
function withTurn(fen: string, color: 'w' | 'b'): Chess | null {
  try {
    const chess = new Chess(fen);
    if (chess.turn() === color) return chess;
    if (chess.isCheck()) return null;
    const tokens = fen.split(' ');
    tokens[1] = color;
    tokens[3] = '-';
    return new Chess(tokens.join(' '));
  } catch {
    return null;
  }
}

function parseCaptured(captured: string | null | undefined): { color: 'w' | 'b'; type: string; square: string } | null {
  const match = captured?.match(/^(White|Black) (pawn|knight|bishop|rook|queen|king) on ([a-h][1-8])$/);
  if (!match) return null;
  const type = PIECE_WORD[match[2]];
  if (!type) return null;
  return { color: match[1] === 'White' ? 'w' : 'b', type, square: match[3] };
}

function endFen(fenBefore: string, playedSan: string, refutation: string): string | null {
  try {
    const chess = new Chess(fenBefore);
    for (const san of [stripSan(playedSan), ...lineSans(refutation)]) {
      if (!san) continue;
      if (!chess.move(san)) return null;
    }
    return chess.fen();
  } catch {
    return null;
  }
}

function netDown(startFen: string, endFen: string, player: 'w' | 'b'): number {
  const sum = (fen: string, color: 'w' | 'b') => {
    let total = 0;
    for (const cell of new Chess(fen).board().flat()) {
      if (cell && cell.color === color && cell.type !== 'k') total += PIECE_VALUE[cell.type] ?? 0;
    }
    return total;
  };
  const opp = player === 'w' ? 'b' : 'w';
  return sum(startFen, player) - sum(endFen, player) - (sum(startFen, opp) - sum(endFen, opp));
}

/** Checkmate delivered by a rook or queen along the player's own back rank. */
function isBackRankMate(fen: string, player: 'w' | 'b'): boolean {
  if (!explainMate(fen)) return false;
  const chess = new Chess(fen);
  const rank = player === 'w' ? '1' : '8';
  const king = chess.board().flat().find((cell) => cell?.type === 'k' && cell.color === player);
  if (!king || king.square[1] !== rank) return false;
  const enemy = player === 'w' ? 'b' : 'w';
  const matedAlongRank = chess.attackers(king.square, enemy).some((square) => {
    const piece = chess.get(square);
    return !!piece && (piece.type === 'r' || piece.type === 'q') && square[1] === rank;
  });
  if (!matedAlongRank) return false;
  // Both forward flight squares (the next rank, one file either side) have to
  // be filled by the king's own pieces. A covered empty square is not this pattern.
  const file = king.square.charCodeAt(0);
  const nextRank = player === 'w' ? '2' : '7';
  for (const delta of [-1, 1]) {
    const nextFile = file + delta;
    if (nextFile < 97 || nextFile > 104) continue;
    const flight = chess.get(`${String.fromCharCode(nextFile)}${nextRank}` as Square);
    if (!flight || flight.color !== player) return false;
  }
  return true;
}

function isWeakBackRank(candidate: CandidateMoment, ctx: TacticalContext, player: 'w' | 'b'): boolean {
  const enemy = player === 'w' ? 'b' : 'w';
  let board: Chess;
  try {
    board = new Chess(candidate.fenBefore);
    if (!board.move(stripSan(candidate.san))) return false;
  } catch {
    return false;
  }

  for (const step of ctx.refutation_moves) {
    const before = board.fen();
    try {
      if (!board.move(step.san)) return false;
    } catch {
      return false;
    }
    if (step.by !== 'opponent') continue;
    if (step.is_checkmate && isBackRankMate(board.fen(), player)) return true;

    const prior = new Set(findMateThreats(before, enemy));
    for (const threatSan of step.threatens_checkmate) {
      if (prior.has(threatSan)) continue;
      const flipped = withTurn(board.fen(), enemy);
      if (!flipped) continue;
      const threat = extractMoveFacts(flipped.fen(), threatSan);
      // The piece that just moved has to be the one that mates. A latent
      // mate by some other piece is not this move's back-rank threat.
      if (!threat || threat.from !== step.to) continue;
      try {
        if (!flipped.move(threat.san)) continue;
      } catch {
        continue;
      }
      if (isBackRankMate(flipped.fen(), player)) {
        // A threat the better line still allows is not this move's mistake.
        return !bestLineHasBackRankMate(candidate, player);
      }
    }
  }
  return false;
}

function bestLineHasBackRankMate(candidate: CandidateMoment, player: 'w' | 'b'): boolean {
  const enemy = player === 'w' ? 'b' : 'w';
  let board: Chess;
  try {
    board = new Chess(candidate.fenBefore);
  } catch {
    return true;
  }
  for (const san of lineSans(candidate.bestLineSan)) {
    try {
      if (!board.move(san)) break;
    } catch {
      break;
    }
    if (board.turn() !== player) continue;
    for (const threatSan of findMateThreats(board.fen(), enemy)) {
      const flipped = withTurn(board.fen(), enemy);
      if (!flipped) continue;
      try {
        if (!flipped.move(threatSan)) continue;
      } catch {
        continue;
      }
      if (isBackRankMate(flipped.fen(), player)) return true;
    }
  }
  return false;
}

/** Every reply still leaves the opponent a mate in one. */
function unstoppableMateThreat(fen: string, enemy: 'w' | 'b'): boolean {
  if (findMateThreats(fen, enemy).length === 0) return false;
  let board: Chess;
  try {
    board = new Chess(fen);
  } catch {
    return false;
  }
  const escapes = board.moves();
  if (escapes.length === 0) return true;
  for (const escape of escapes) {
    board.move(escape);
    const stopped = findMateThreats(board.fen(), enemy).length === 0;
    board.undo();
    if (stopped) return false;
  }
  return true;
}

function isMissedMateThreat(candidate: CandidateMoment, ctx: TacticalContext, player: 'w' | 'b'): boolean {
  const enemy = player === 'w' ? 'b' : 'w';
  let punished = false;
  let board: Chess;
  try {
    board = new Chess(candidate.fenBefore);
    if (!board.move(stripSan(candidate.san))) return false;
  } catch {
    return false;
  }
  for (const step of ctx.refutation_moves) {
    try {
      if (!board.move(step.san)) break;
    } catch {
      break;
    }
    if (step.by !== 'opponent') continue;
    if (step.is_checkmate || (step.threatens_checkmate.length > 0 && unstoppableMateThreat(board.fen(), enemy))) {
      punished = true;
      break;
    }
  }
  if (!punished) return false;

  // The better move has to actually take the mate away. Unknown best move → null.
  const best = stripSan(candidate.bestMoveSan);
  if (!best || best === stripSan(candidate.san)) return false;
  try {
    board = new Chess(candidate.fenBefore);
    if (!board.move(best)) return false;
  } catch {
    return false;
  }
  if (findMateThreats(board.fen(), enemy).length > 0) return false;
  if (ctx.best_line_moves.some((move) => move.by === 'opponent' && move.is_checkmate)) return false;
  return true;
}

interface LooseCapture {
  type: string;
  square: string;
  defenders: number;
  attackers: number;
  taker: string | null;
}

/** The piece the opponent's first reply wins because it was loose, or null. */
function looseCapture(candidate: CandidateMoment, ctx: TacticalContext, player: 'w' | 'b'): LooseCapture | null {
  const first = ctx.refutation_moves[0];
  if (!first || first.by !== 'opponent') return null;
  const captured = parseCaptured(first.captured);
  if (!captured || captured.color !== player) return null;
  if (captured.type !== 'n' && captured.type !== 'b' && captured.type !== 'r' && captured.type !== 'q') return null;
  let fenAfter: string;
  let playedTo = '';
  let playedCapture = false;
  try {
    const board = new Chess(candidate.fenBefore);
    const played = board.move(stripSan(candidate.san));
    if (!played) return null;
    fenAfter = board.fen();
    playedTo = played.to;
    playedCapture = !!played.captured;
  } catch {
    return null;
  }
  // The queen (or other piece) was just put on this square by a capture.
  // That loss is the exchange, classified below, not a piece left hanging.
  if (playedCapture && playedTo === captured.square) return null;
  const defenders = defenderCount(fenAfter, captured.square, player);
  const attackers = getAttackersOfSquare(fenAfter, captured.square, player).length;
  if (attackers === 0) return null;
  // Loose: nothing defends it, a cheaper piece takes it, or it is outnumbered.
  const takerPiece = new Chess(fenAfter).get(first.from as Square);
  const taker = takerPiece && takerPiece.type !== 'k' && PIECE_VALUE[takerPiece.type] < PIECE_VALUE[captured.type] ? takerPiece.type : null;
  if (defenders > 0 && !taker && attackers <= defenders) return null;
  const end = endFen(candidate.fenBefore, candidate.san, candidate.refutationLineSan);
  // "Wins": the line leaves the player down material, not a capture that is
  // handed back. A defended piece has to cost at least two points net.
  if (!end || netDown(candidate.fenBefore, end, player) < (defenders === 0 ? 1 : 2)) return null;
  return { type: captured.type, square: captured.square, defenders, attackers, taker };
}

const PIECE_NAME: Record<string, string> = { p: 'pawn', n: 'knight', b: 'bishop', r: 'rook', q: 'queen' };

/**
 * The code-checked reason a hanging-piece tag applies, in words for the
 * prompt. The tactical context does not say whether the piece was defended,
 * and without this the model calls every loose piece "undefended".
 */
export function hangingPieceFact(candidate: CandidateMoment): string | null {
  const player = playerOf(candidate);
  if (!player) return null;
  try {
    const ctx = buildTacticalContext(candidate.fenBefore, candidate.san, candidate.bestMoveSan, candidate.refutationLineSan, candidate.bestLineSan);
    const loose = looseCapture(candidate, ctx, player);
    if (!loose) return null;
    const piece = `Your ${PIECE_NAME[loose.type]} on ${loose.square}`;
    if (loose.defenders === 0) return `${piece} had no defender.`;
    const guards = `${loose.defenders} defender${loose.defenders === 1 ? '' : 's'}`;
    if (loose.taker) return `${piece} had ${guards}, but a cheaper piece (their ${PIECE_NAME[loose.taker]}) could take it.`;
    return `${piece} had ${loose.attackers} attackers and only ${guards}.`;
  } catch {
    return null;
  }
}

function isDoubleAttack(candidate: CandidateMoment, ctx: TacticalContext, player: 'w' | 'b'): boolean {
  const first = ctx.refutation_moves[0];
  if (!first || first.by !== 'opponent') return false;
  const playerName = player === 'w' ? 'White' : 'Black';
  const targets: string[] = [];
  for (const attack of first.attacks_after_move) {
    const match = attack.match(/^(White|Black) (knight|bishop|rook|queen) on ([a-h][1-8])$/);
    if (!match || match[1] !== playerName) continue;
    targets.push(match[3]);
  }
  const fork = targets.length >= 2 || (first.is_check && targets.length >= 1);
  if (!fork) return false;
  const won = ctx.refutation_moves.some((move) => targets.some((square) => move.captured?.endsWith(`on ${square}`)));
  if (!won) return false;
  const end = endFen(candidate.fenBefore, candidate.san, candidate.refutationLineSan);
  return !!end && netDown(candidate.fenBefore, end, player) >= 1;
}

function isLosingExchange(candidate: CandidateMoment, player: 'w' | 'b'): boolean {
  let board: Chess;
  try {
    board = new Chess(candidate.fenBefore);
  } catch {
    return false;
  }
  // The concept (and its habit, "before you capture, count…") is about the
  // player's own capture. Only the capture sequence the played move starts
  // counts; recaptures in a sequence the opponent began, or a forced trade
  // later in the line, are not a trade the player chose.
  const sans = [stripSan(candidate.san), ...lineSans(candidate.refutationLineSan)].filter(Boolean);
  const fen = board.fen();
  let square: string | null = null;
  let victim: 'w' | 'b' = player;
  let captures = 0;
  let loss = 0;
  let gain = 0;
  for (const [index, san] of sans.entries()) {
    let move;
    try {
      move = board.move(san);
    } catch {
      break;
    }
    if (!move || !move.captured) break;
    if (index === 0) {
      if (move.color !== player) return false;
      square = move.to;
      victim = move.color === 'w' ? 'b' : 'w';
    } else if (move.to !== square) {
      break;
    }
    captures += 1;
    const value = PIECE_VALUE[move.captured] ?? 0;
    if ((move.color === 'w' ? 'b' : 'w') === player) loss += value;
    else gain += value;
  }
  if (!square || captures < 2 || loss - gain < 2) return false;
  let defenders = 0;
  try {
    defenders = defenderCount(fen, square, victim);
  } catch {
    return false;
  }
  if (defenders < 1) return false;
  const attackers = getAttackersOfSquare(fen, square, victim).length;
  // Outnumbered square, or the player gave up the more valuable piece.
  return attackers > defenders || loss > gain;
}

/** The player had a forced mate and the played move gave it up. */
function gaveUpMate(candidate: CandidateMoment): boolean {
  const best = stripSan(candidate.bestMoveSan);
  return !!best && best !== stripSan(candidate.san) && candidate.evalBefore >= MATE_PAWNS && candidate.evalAfter < MATE_PAWNS;
}

/**
 * The player's own win, not taken: the better line wins at least a piece's
 * worth (3) and the played move gave that up without losing material itself
 * (a move that loses material is the opponent's tactic, tagged above or not at
 * all). Two-point wins stay null: at the stored line's length they are as
 * often a line cut short as a win.
 */
function isMissedChance(candidate: CandidateMoment, player: 'w' | 'b'): boolean {
  const best = stripSan(candidate.bestMoveSan);
  if (!best || best === stripSan(candidate.san)) return false;
  const bestEnd = endFen(candidate.fenBefore, '', candidate.bestLineSan);
  const playedEnd = endFen(candidate.fenBefore, candidate.san, candidate.refutationLineSan);
  if (!bestEnd || !playedEnd) return false;
  const gainPlayed = -netDown(candidate.fenBefore, playedEnd, player);
  if (gainPlayed <= -2) return false;
  const gainBest = -netDown(candidate.fenBefore, bestEnd, player);
  return gainBest >= 3 && gainBest - gainPlayed >= 2;
}

/**
 * Deterministic tag for one verified moment. Precedence is fixed; null means
 * the position did not clearly match — a wrong tag is worse than none.
 */
export function classifyMoment(candidate: CandidateMoment): ConceptId | null {
  const player = playerOf(candidate);
  if (!player || !candidate.san) return null;
  let ctx: TacticalContext;
  try {
    ctx = buildTacticalContext(
      candidate.fenBefore,
      candidate.san,
      candidate.bestMoveSan,
      candidate.refutationLineSan,
      candidate.bestLineSan
    );
  } catch {
    return null;
  }
  try {
    if (isWeakBackRank(candidate, ctx, player)) return 'weak_back_rank';
    if (isMissedMateThreat(candidate, ctx, player)) return 'missed_mate_threat';
    // A forced mate against the player outweighs any material a line shows;
    // only the mate concepts above may name it.
    if (candidate.evalAfter <= -MATE_PAWNS) return null;
    // So does a forced mate the player had and gave up, even if the move also dropped material.
    if (gaveUpMate(candidate)) return 'missed_chance';
    if (looseCapture(candidate, ctx, player)) return 'hanging_piece';
    if (isDoubleAttack(candidate, ctx, player)) return 'double_attack';
    if (isLosingExchange(candidate, player)) return 'losing_exchange';
    if (isMissedChance(candidate, player)) return 'missed_chance';
  } catch {
    return null;
  }
  return null;
}

const PIECE_ORDER = ['q', 'r', 'b', 'n', 'p'] as const;

/** Mate distance when evalBefore is the engine's mate encoding (100 - N). */
function mateDistance(evalPawns: number): number | null {
  if (!Number.isFinite(evalPawns)) return null;
  const rounded = Math.round(evalPawns);
  if (Math.abs(evalPawns - rounded) > 1e-6) return null;
  const n = 100 - rounded;
  if (n < 1 || n > 50 || rounded < MATE_PAWNS) return null;
  return n;
}

interface LineMaterial {
  gained: Record<string, number>;
  lost: Record<string, number>;
  /** The line stops on a capture the other side can still take back. */
  unsettled: boolean;
  promoted: boolean;
}

/** Captures along a line, from the player's side. Null when a move will not play. */
function replayMaterial(fen: string, sans: string[], player: 'w' | 'b'): LineMaterial | null {
  if (sans.length === 0) return null;
  try {
    const chess = new Chess(fen);
    const gained: Record<string, number> = {};
    const lost: Record<string, number> = {};
    let promoted = false;
    let lastCapturedOn: string | null = null;
    for (const san of sans) {
      const move = chess.move(san);
      if (!move) return null;
      if (move.promotion) promoted = true;
      if (move.captured) {
        const bucket = move.color === player ? gained : lost;
        bucket[move.captured] = (bucket[move.captured] ?? 0) + 1;
        lastCapturedOn = move.to;
      } else {
        lastCapturedOn = null;
      }
    }
    const unsettled =
      !!lastCapturedOn && chess.moves({ verbose: true }).some((reply) => reply.to === lastCapturedOn && !!reply.captured);
    return { gained, lost, unsettled, promoted };
  } catch {
    return null;
  }
}

function tallyValue(counts: Record<string, number>): number {
  let total = 0;
  for (const [type, n] of Object.entries(counts)) {
    const value = PIECE_VALUE[type];
    if (value === undefined) return Number.NaN;
    total += value * n;
  }
  return total;
}

function nettedCounts(gained: Record<string, number>, lost: Record<string, number>): { up: Record<string, number>; down: Record<string, number> } {
  const up: Record<string, number> = {};
  const down: Record<string, number> = {};
  for (const type of new Set([...Object.keys(gained), ...Object.keys(lost)])) {
    const delta = (gained[type] ?? 0) - (lost[type] ?? 0);
    if (delta > 0) up[type] = delta;
    else if (delta < 0) down[type] = -delta;
  }
  return { up, down };
}

/** "a knight and a pawn", or null when a type has no name. */
function listPieces(counts: Record<string, number>): string | null {
  const parts: string[] = [];
  for (const type of PIECE_ORDER) {
    const n = counts[type] ?? 0;
    if (n <= 0) continue;
    const name = PIECE_NAME[type];
    if (!name) return null;
    parts.push(n === 1 ? `a ${name}` : `${n} ${name}s`);
  }
  if (Object.keys(counts).some((type) => (counts[type] ?? 0) > 0 && !PIECE_NAME[type])) return null;
  if (parts.length === 0) return null;
  if (parts.length === 1) return parts[0];
  if (parts.length === 2) return `${parts[0]} and ${parts[1]}`;
  return `${parts.slice(0, -1).join(', ')}, and ${parts[parts.length - 1]}`;
}

/**
 * What the line did to the player's material, as a verb phrase. A line that
 * ends mid-exchange, or whose captures do not add up to the board, is only
 * "won material" or "lost material": a named piece would be a guess.
 */
function materialClause(line: LineMaterial, net: number): string | null {
  if (!Number.isFinite(net)) return null;
  if (net === 0) return 'kept the material level';
  const capturesAddUp = tallyValue(line.gained) - tallyValue(line.lost) === net;
  const named = capturesAddUp && !line.unsettled && !line.promoted;
  if (!named) return net > 0 ? 'won material' : 'lost material';
  const { up, down } = nettedCounts(line.gained, line.lost);
  const won = listPieces(up);
  const gave = listPieces(down);
  if (net > 0) {
    // A clean +3 whose piece type did not come through is a minor piece, not a guess at knight or bishop.
    if (!won) return net === 3 && !gave ? 'won a piece for nothing' : 'won material';
    return gave ? `won ${won} for ${gave}` : `won ${won} for nothing`;
  }
  if (!gave) return 'lost material';
  return won ? `lost ${gave} for ${won}` : `lost ${gave}`;
}

function mateSentence(candidate: CandidateMoment): string | null {
  const best = stripSan(candidate.bestMoveSan);
  const played = stripSan(candidate.san);
  if (!best || !played) return null;
  const n = mateDistance(candidate.evalBefore);
  const kind = n === null ? 'a forced mate' : `mate in ${n}`;
  return `You had ${kind} starting with ${best}. After ${played}, it is gone.`;
}

function materialSentence(candidate: CandidateMoment, player: 'w' | 'b'): string | null {
  const best = stripSan(candidate.bestMoveSan);
  const played = stripSan(candidate.san);
  if (!best || !played) return null;
  const bestEnd = endFen(candidate.fenBefore, '', candidate.bestLineSan);
  const playedEnd = endFen(candidate.fenBefore, candidate.san, candidate.refutationLineSan);
  if (!bestEnd || !playedEnd) return null;
  const gainBest = -netDown(candidate.fenBefore, bestEnd, player);
  const gainPlayed = -netDown(candidate.fenBefore, playedEnd, player);
  const bestLine = replayMaterial(candidate.fenBefore, lineSans(candidate.bestLineSan), player);
  const playedLine = replayMaterial(candidate.fenBefore, [played, ...lineSans(candidate.refutationLineSan)], player);
  if (!bestLine || !playedLine) return null;
  const bestClause = materialClause(bestLine, gainBest);
  const playedClause = materialClause(playedLine, gainPlayed);
  if (!bestClause?.startsWith('won ') || !playedClause) return null;
  return `${best} would have ${bestClause}. Instead, ${played} ${playedClause}.`;
}

/**
 * The code-checked account of a win the player did not take, for the prompt.
 * Null when this moment is not a missed chance, or the line cannot be read:
 * a wrong fact is worse than none.
 */
export function missedChanceFact(candidate: CandidateMoment): string | null {
  const player = playerOf(candidate);
  if (!player || classifyMoment(candidate) !== 'missed_chance') return null;
  try {
    if (gaveUpMate(candidate)) return mateSentence(candidate);
    return materialSentence(candidate, player);
  } catch {
    return null;
  }
}

/** Grounded text for the "why better" field; never expands a withheld net. */
export function missedChanceWhyBetter(candidate: CandidateMoment): string | null {
  const fact = missedChanceFact(candidate);
  if (!fact) return null;
  const material = fact.indexOf(' Instead,');
  if (material >= 0) return fact.slice(0, material).trimEnd();
  const mate = fact.indexOf(' After ');
  return mate >= 0 ? fact.slice(0, mate).trimEnd() : fact;
}

/** A deliberately neutral intention; the code cannot know what the player thought. */
export function missedChanceProbableThought(candidate: CandidateMoment): string | null {
  return missedChanceFact(candidate) ? 'You may have been looking for a useful move.' : null;
}
