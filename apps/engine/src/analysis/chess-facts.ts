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
  /** Moves that would deliver checkmate if the mover got a second move in a row. */
  threatens_checkmate: string[];
}

export interface TacticalContext {
  played_move: MoveFacts | null;
  best_move: MoveFacts | null;
  opponent_refutation: MoveFacts | null;
  /** Every move of the refutation line, in order, annotated from its own position. */
  refutation_moves: LineMoveFacts[];
  /** Why the obvious defence at the end of the line fails, when a mate threat forces it. */
  after_refutation: string | null;
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

export function buildTacticalContext(
  fenBefore: string,
  playedMoveSan: string,
  bestMoveSan: string,
  refutationLineSan: string
): TacticalContext {
  const playedFacts = extractMoveFacts(fenBefore, playedMoveSan);
  const bestFacts = extractMoveFacts(fenBefore, bestMoveSan);

  const line = new Chess(fenBefore);
  try {
    line.move(playedMoveSan.replace(/^\d+\.+/, '').trim());
  } catch {}

  // Annotate every move of the line from its own position. Only the first move
  // used to be described, so quiet follow-ups (a queen stepping onto a mating
  // diagonal) reached the model as bare notation and it guessed their purpose.
  const refutationMoves: LineMoveFacts[] = [];
  for (const san of refutationLineSan ? refutationLineSan.trim().split(/\s+/) : []) {
    const before = line.fen();
    const facts = extractMoveFacts(before, san);
    if (!facts) break;
    line.move(facts.san);
    refutationMoves.push({
      ...facts,
      threatens_checkmate: facts.is_checkmate ? [] : findMateThreats(line.fen(), before.split(' ')[1] as 'w' | 'b'),
    });
  }
  const refutationFacts = refutationMoves[0] ?? null;
  const afterRefutation = refutationMoves.length > 0 ? explainForcedDefence(line.fen()) : null;

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
    best_move: bestFacts,
    opponent_refutation: refutationFacts,
    refutation_moves: refutationMoves,
    after_refutation: afterRefutation,
    refutation_sequence: refutationLineSan,
    threat_summary: threats.join(' ') || 'No immediate tactical threat captured.',
  };
}
