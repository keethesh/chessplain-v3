import { Chess, Square } from 'chess.js';

const PIECE_NAMES: Record<string, string> = {
  p: 'pawn',
  n: 'knight',
  b: 'bishop',
  r: 'rook',
  q: 'queen',
  k: 'king',
};

function getPieceDescription(pieceType: string, color: 'w' | 'b'): string {
  const colorName = color === 'w' ? 'White' : 'Black';
  const name = PIECE_NAMES[pieceType.toLowerCase()] || 'piece';
  return `${colorName} ${name}`;
}

/**
 * Finds all opponent pieces attacked by the piece on targetSquare in the given FEN position.
 */
export function getAttacksFromSquare(fen: string, square: string): string[] {
  try {
    const chess = new Chess(fen);
    const sq = square as Square;
    const piece = chess.get(sq);
    if (!piece) return [];

    const pieceColor = piece.color;
    let testFen = fen;
    const tokens = fen.split(' ');
    if (tokens[1] !== pieceColor) {
      tokens[1] = pieceColor;
      tokens[3] = '-'; // Reset en passant
      testFen = tokens.join(' ');
    }

    const testChess = new Chess(testFen);
    const moves = testChess.moves({ square: sq, verbose: true });
    const attacks: string[] = [];

    for (const m of moves) {
      if (m.captured) {
        if (m.captured === 'k') continue; // F2: King captures are illegal in chess; artifact of flipped active color
        const targetPiece = testChess.get(m.to as Square);
        const targetDesc = targetPiece
          ? getPieceDescription(targetPiece.type, targetPiece.color)
          : 'piece';
        attacks.push(`${targetDesc} on ${m.to}`);
      }
    }
    return Array.from(new Set(attacks)); // F3: Deduplicate (e.g. multiple promotion choices attacking same target)
  } catch {
    return [];
  }
}

/**
 * Finds which opponent pieces were attacking targetSquare in the given FEN position before moving.
 */
export function getAttackersOfSquare(
  fen: string,
  targetSquare: string,
  defendingColor: 'w' | 'b'
): string[] {
  try {
    const opponentColor = defendingColor === 'w' ? 'b' : 'w';
    const tokens = fen.split(' ');
    tokens[1] = opponentColor;
    tokens[3] = '-'; // reset en passant
    const chess = new Chess(tokens.join(' '));
    const moves = chess.moves({ verbose: true });
    const attackers: string[] = [];

    for (const m of moves) {
      if (m.to === targetSquare) {
        const attackerPiece = chess.get(m.from as Square);
        if (attackerPiece) {
          attackers.push(`${getPieceDescription(attackerPiece.type, attackerPiece.color)} on ${m.from}`);
        }
      }
    }
    // Deduplicate
    return Array.from(new Set(attackers));
  } catch {
    return [];
  }
}

export interface MoveFacts {
  san: string;
  piece: string;
  from: string;
  to: string;
  captured?: string | null;
  is_check: boolean;
  is_checkmate: boolean;
  attacked_before_move: string[];
  attacks_after_move: string[];
  description: string;
}

export function extractMoveFacts(fenBefore: string, moveSan: string): MoveFacts | null {
  if (!moveSan) return null;
  try {
    const chess = new Chess(fenBefore);
    const cleanSan = moveSan.replace(/^\d+\.+/, '').trim();
    const move = chess.move(cleanSan);
    if (!move) return null;

    const pieceName = getPieceDescription(move.piece, move.color);
    // F1: For en passant captures, the captured pawn is on move.to[0] + move.from[1], not move.to
    const capturedSquare = move.flags.includes('e')
      ? `${move.to[0]}${move.from[1]}`
      : move.to;
    const capturedName = move.captured
      ? getPieceDescription(move.captured, move.color === 'w' ? 'b' : 'w') + ` on ${capturedSquare}`
      : null;
    const isCheck = chess.isCheck();
    const isCheckmate = chess.isCheckmate();

    const attackersBefore = getAttackersOfSquare(fenBefore, move.from, move.color);
    const attacksAfter = getAttacksFromSquare(chess.fen(), move.to);

    let desc = `${pieceName} from ${move.from} to ${move.to}`;
    if (move.flags.includes('k')) desc = `${move.color === 'w' ? 'White' : 'Black'} castles kingside`;
    if (move.flags.includes('q')) desc = `${move.color === 'w' ? 'White' : 'Black'} castles queenside`;
    // F4: Accurately describe promotions and what piece now occupies the square
    if (move.promotion) {
      const promoPiece = PIECE_NAMES[move.promotion.toLowerCase()] || 'queen';
      desc += `, promoting to ${promoPiece}`;
    }
    if (capturedName) desc += `, capturing ${capturedName}`;
    if (isCheckmate) desc += ' (checkmate)';
    else if (isCheck) desc += ' (check)';

    const landedPieceName = move.promotion
      ? getPieceDescription(move.promotion, move.color)
      : pieceName;

    return {
      san: move.san,
      piece: landedPieceName,
      from: move.from,
      to: move.to,
      captured: capturedName,
      is_check: isCheck,
      is_checkmate: isCheckmate,
      attacked_before_move: attackersBefore,
      attacks_after_move: attacksAfter,
      description: desc,
    };
  } catch {
    return null;
  }
}

export interface LineMoveFacts extends MoveFacts {
  /** Who plays it, relative to the player the report is for. */
  by: 'you' | 'opponent';
  /** Moves that would deliver checkmate if the mover got a second move in a row. */
  threatens_checkmate: string[];
  /** For a checkmating move: why the king has no way out. */
  mate_reason?: string;
}

export interface TacticalContext {
  played_move: MoveFacts | null;
  best_move: MoveFacts | null;
  opponent_refutation: MoveFacts | null;
  /** Every move of the refutation line, in order, annotated from its own position. */
  refutation_moves: LineMoveFacts[];
  /** Why the obvious defence at the end of the line fails, when a mate threat forces it. */
  after_refutation: string | null;
  /** Pieces each side loses from the played move through the end of the refutation line. */
  refutation_outcome: string;
  /** The engine's line starting with the better move, each move annotated. */
  best_line_moves: LineMoveFacts[];
  /** Pieces each side loses over the better line. */
  best_line_outcome: string;
  refutation_sequence: string;
  threat_summary: string;
}

const SIDE = { w: 'White', b: 'Black' } as const;

/** The same position with `color` to move — the question "what if they passed?". */
function withSideToMove(fen: string, color: 'w' | 'b'): Chess | null {
  try {
    const chess = new Chess(fen);
    if (chess.turn() === color) return chess;
    // The side to move cannot pass while in check: the flipped position would
    // let the other side "capture the king".
    if (chess.isCheck()) return null;
    const tokens = fen.split(' ');
    tokens[1] = color;
    tokens[3] = '-';
    return new Chess(tokens.join(' '));
  } catch {
    return null;
  }
}

/** SAN of every move that would checkmate at once if `color` were to move in `fen`. */
export function findMateThreats(fen: string, color: 'w' | 'b'): string[] {
  const chess = withSideToMove(fen, color);
  if (!chess) return [];
  const mates: string[] = [];
  for (const move of chess.moves({ verbose: true })) {
    chess.move(move);
    if (chess.isCheckmate()) mates.push(move.san);
    chess.undo();
  }
  return mates;
}

/**
 * At the end of the refutation line: if the side not to move threatens mate,
 * the side to move cannot simply rescue an attacked piece. Players otherwise
 * ask "why can't I just move it away?" — this states the concrete answer,
 * checked by playing an escape and finding the mate.
 */
function explainForcedDefence(fen: string): string | null {
  const chess = new Chess(fen);
  if (chess.isGameOver()) return null;
  const defender = chess.turn();
  const attacker = defender === 'w' ? 'b' : 'w';
  const mates = findMateThreats(fen, attacker);
  if (mates.length === 0) return null;

  const threat = `${SIDE[attacker]} threatens ${mates[0]}, which would be checkmate, so ${SIDE[defender]} must stop that first.`;
  for (const row of chess.board()) {
    for (const cell of row) {
      if (!cell || cell.color !== defender || cell.type === 'k' || cell.type === 'p') continue;
      const attackers = getAttackersOfSquare(fen, cell.square, defender);
      if (attackers.length === 0) continue;
      for (const escape of chess.moves({ square: cell.square, verbose: true })) {
        chess.move(escape);
        const mate = chess.moves({ verbose: true }).find((reply) => {
          chess.move(reply);
          const isMate = chess.isCheckmate();
          chess.undo();
          return isMate;
        });
        chess.undo();
        if (mate) {
          const piece = getPieceDescription(cell.type, defender);
          return `${threat} The ${piece} on ${cell.square} is attacked by ${attackers.join(' and ')}, but it cannot simply move away: after ${escape.san}, ${mate.san} is checkmate.`;
        }
      }
    }
  }
  return threat;
}

const KING_STEPS = [-1, 0, 1].flatMap((df) => [-1, 0, 1].map((dr) => [df, dr])).filter(([df, dr]) => df || dr);

/** Why a checkmated king has no way out: each flight square and what takes it away. */
export function explainMate(fen: string): string | null {
  const chess = new Chess(fen);
  if (!chess.isCheckmate()) return null;
  const defender = chess.turn();
  const attacker = defender === 'w' ? 'b' : 'w';
  const kingSquare = chess.board().flat().find((c) => c?.type === 'k' && c.color === defender)!.square;
  const name = (sq: Square) => {
    const p = chess.get(sq)!;
    return `${getPieceDescription(p.type, p.color)} on ${sq}`;
  };
  const checkers = chess.attackers(kingSquare, attacker).map(name);

  // Lift the king off the board so squares behind it along a checking line
  // count as covered, as they are in the real position.
  chess.remove(kingSquare);
  const blocked: string[] = [];
  const covered: string[] = [];
  for (const [df, dr] of KING_STEPS) {
    const file = kingSquare.charCodeAt(0) + df;
    const rank = Number(kingSquare[1]) + dr;
    if (file < 97 || file > 104 || rank < 1 || rank > 8) continue;
    const sq = `${String.fromCharCode(file)}${rank}` as Square;
    const occupant = chess.get(sq);
    if (occupant?.color === defender) {
      blocked.push(`${sq} (its own ${PIECE_NAMES[occupant.type]})`);
      continue;
    }
    const guards = chess.attackers(sq, attacker).map(name);
    if (guards.length) covered.push(`${sq} by the ${guards.join(' and the ')}`);
  }

  const parts = [`The ${getPieceDescription('k', defender)} on ${kingSquare} is in check from the ${checkers.join(' and the ')}.`];
  if (blocked.length) parts.push(`Its own pieces block ${blocked.join(', ')}.`);
  if (covered.length) parts.push(`${covered.join('; ')} ${covered.length === 1 ? 'is' : 'are'} covered.`);
  parts.push('Nothing can capture the checking piece or block the check.');
  return parts.join(' ');
}

const SIDE_VALUE_ORDER = ['q', 'r', 'b', 'n', 'p'] as const;

function countPieces(fen: string): Record<string, number> {
  const counts: Record<string, number> = {};
  for (const c of new Chess(fen).board().flat()) if (c) counts[`${c.color}${c.type}`] = (counts[`${c.color}${c.type}`] ?? 0) + 1;
  return counts;
}

/** "You lose a knight; the opponent loses a pawn." — pieces only, never point values. */
function describeMaterialChange(startFen: string, endFen: string, player: 'w' | 'b'): string {
  const start = countPieces(startFen);
  const end = countPieces(endFen);
  const lost = (color: 'w' | 'b') =>
    SIDE_VALUE_ORDER.flatMap((t) => {
      const n = (start[`${color}${t}`] ?? 0) - (end[`${color}${t}`] ?? 0);
      return n > 0 ? [n === 1 ? `a ${PIECE_NAMES[t]}` : `${n} ${PIECE_NAMES[t]}s`] : [];
    }).join(' and ');
  const opponent = player === 'w' ? 'b' : 'w';
  const mine = lost(player);
  const theirs = lost(opponent);
  if (!mine && !theirs) return 'By the end of this line, no material has changed hands.';
  return `By the end of this line, ${mine ? `you have lost ${mine}` : 'you have lost nothing'} and ${theirs ? `the opponent has lost ${theirs}` : 'the opponent has lost nothing'}.`;
}

/**
 * Annotates every move of a line from its own position. Quiet moves otherwise
 * reach the model as bare notation and it guesses their purpose; without `by`
 * it credits the player's own moves to the opponent.
 */
function annotateLine(line: Chess, sans: string[], player: 'w' | 'b'): LineMoveFacts[] {
  const out: LineMoveFacts[] = [];
  for (const san of sans) {
    const before = line.fen();
    const facts = extractMoveFacts(before, san);
    if (!facts) break;
    const mover = line.turn();
    line.move(facts.san);
    const annotated: LineMoveFacts = {
      ...facts,
      by: mover === player ? 'you' : 'opponent',
      threatens_checkmate: facts.is_checkmate ? [] : findMateThreats(line.fen(), mover),
    };
    if (facts.is_checkmate) annotated.mate_reason = explainMate(line.fen()) ?? undefined;
    out.push(annotated);
  }
  return out;
}

const splitLine = (san: string) => (san ? san.trim().split(/\s+/).filter(Boolean) : []);

export function buildTacticalContext(
  fenBefore: string,
  playedMoveSan: string,
  bestMoveSan: string,
  refutationLineSan: string,
  /** Engine line from fenBefore starting with the best move; empty when the engine gave none. */
  bestLineSan = ''
): TacticalContext {
  const player = new Chess(fenBefore).turn();
  const playedFacts = extractMoveFacts(fenBefore, playedMoveSan);

  const refutationBoard = new Chess(fenBefore);
  try {
    refutationBoard.move(playedMoveSan.replace(/^\d+\.+/, '').trim());
  } catch {}
  const refutationMoves = annotateLine(refutationBoard, splitLine(refutationLineSan), player);
  const refutationFacts = refutationMoves[0] ?? null;
  const afterRefutation = refutationMoves.length > 0 ? explainForcedDefence(refutationBoard.fen()) : null;

  const bestBoard = new Chess(fenBefore);
  const bestSans = splitLine(bestLineSan);
  const bestLineMoves = annotateLine(bestBoard, bestSans.length ? bestSans : [bestMoveSan], player);

  // Build threat summary
  const threats: string[] = [];
  if (playedFacts?.attacked_before_move && playedFacts.attacked_before_move.length > 0) {
    threats.push(`Before this move, ${playedFacts.piece} on ${playedFacts.from} was under attack by ${playedFacts.attacked_before_move.join(' and ')}.`);
  }
  if (refutationFacts) {
    if (refutationFacts.is_checkmate) {
      threats.push(`Opponent responds with ${refutationFacts.san}, which is immediate checkmate.`);
    } else if (refutationFacts.captured) {
      threats.push(`Opponent responds with ${refutationFacts.san}, winning ${refutationFacts.captured}.`);
    } else if (refutationFacts.attacks_after_move.length > 0) {
      threats.push(`Opponent responds with ${refutationFacts.san}, attacking ${refutationFacts.attacks_after_move.join(', ')}.`);
    }
  }
  for (const move of refutationMoves) {
    if (move.threatens_checkmate.length > 0) {
      threats.push(`${move.san} threatens ${move.threatens_checkmate[0]}, which would be checkmate.`);
    }
  }
  if (afterRefutation) threats.push(afterRefutation);

  return {
    played_move: playedFacts,
    best_move: bestLineMoves[0] ?? null,
    opponent_refutation: refutationFacts,
    refutation_moves: refutationMoves,
    after_refutation: afterRefutation,
    refutation_outcome: describeMaterialChange(fenBefore, refutationBoard.fen(), player),
    best_line_moves: bestLineMoves,
    best_line_outcome: describeMaterialChange(fenBefore, bestBoard.fen(), player),
    refutation_sequence: refutationLineSan,
    threat_summary: threats.join(' ') || 'No immediate tactical threat captured.',
  };
}
