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

export type ConceptId =
  | 'hanging_piece'
  | 'double_attack'
  | 'missed_mate_threat'
  | 'weak_back_rank'
  | 'losing_exchange';

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
    definition: 'A piece of yours that nothing is defending.',
    habit: 'Before you let go of a piece, check: what did I just leave undefended?',
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
};

export const CONCEPT_IDS: ConceptId[] = [
  'hanging_piece',
  'double_attack',
  'missed_mate_threat',
  'weak_back_rank',
  'losing_exchange',
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

function isHangingPiece(candidate: CandidateMoment, ctx: TacticalContext, player: 'w' | 'b'): boolean {
  const first = ctx.refutation_moves[0];
  if (!first || first.by !== 'opponent') return false;
  const captured = parseCaptured(first.captured);
  if (!captured || captured.color !== player) return false;
  if (captured.type !== 'n' && captured.type !== 'b' && captured.type !== 'r' && captured.type !== 'q') return false;
  let fenAfter: string;
  let playedTo = '';
  let playedCapture = false;
  try {
    const board = new Chess(candidate.fenBefore);
    const played = board.move(stripSan(candidate.san));
    if (!played) return false;
    fenAfter = board.fen();
    playedTo = played.to;
    playedCapture = !!played.captured;
  } catch {
    return false;
  }
  // The queen (or other piece) was just put on this square by a capture.
  // That loss is the exchange, classified below, not a piece left hanging.
  if (playedCapture && playedTo === captured.square) return false;
  if (defenderCount(fenAfter, captured.square, player) !== 0) return false;
  if (getAttackersOfSquare(fenAfter, captured.square, player).length === 0) return false;
  const end = endFen(candidate.fenBefore, candidate.san, candidate.refutationLineSan);
  // "Wins" — the line leaves the player down material, not a capture that is handed back.
  return !!end && netDown(candidate.fenBefore, end, player) >= 1;
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
  const sans = [stripSan(candidate.san), ...lineSans(candidate.refutationLineSan)].filter(Boolean);
  type Run = { square: string; fen: string; victim: 'w' | 'b'; captures: number; loss: number; gain: number };
  let run: Run | null = null;
  const runs: Run[] = [];
  for (const san of sans) {
    const fen = board.fen();
    let move;
    try {
      move = board.move(san);
    } catch {
      break;
    }
    if (!move) break;
    if (!move.captured) {
      if (run) runs.push(run);
      run = null;
      continue;
    }
    const capturedColor: 'w' | 'b' = move.color === 'w' ? 'b' : 'w';
    const value = PIECE_VALUE[move.captured] ?? 0;
    if (!run || run.square !== move.to) {
      if (run) runs.push(run);
      // A recapture the opponent started is not a trade the player chose.
      if (move.color !== player) {
        run = null;
        continue;
      }
      run = { square: move.to, fen, victim: capturedColor, captures: 0, loss: 0, gain: 0 };
    }
    run.captures += 1;
    if (capturedColor === player) run.loss += value;
    else run.gain += value;
  }
  if (run) runs.push(run);

  return runs.some((seq) => {
    if (seq.captures < 2) return false;
    const down = seq.loss - seq.gain;
    if (down < 2) return false;
    let defenders = 0;
    try {
      defenders = defenderCount(seq.fen, seq.square, seq.victim);
    } catch {
      return false;
    }
    if (defenders < 1) return false;
    const attackers = getAttackersOfSquare(seq.fen, seq.square, seq.victim).length;
    // Outnumbered square, or the player gave up the more valuable piece.
    return attackers > defenders || seq.loss > seq.gain;
  });
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
    if (isHangingPiece(candidate, ctx, player)) return 'hanging_piece';
    if (isDoubleAttack(candidate, ctx, player)) return 'double_attack';
    if (isLosingExchange(candidate, player)) return 'losing_exchange';
  } catch {
    return null;
  }
  return null;
}
