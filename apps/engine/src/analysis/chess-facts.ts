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

export interface TacticalContext {
  played_move: MoveFacts | null;
  best_move: MoveFacts | null;
  opponent_refutation: MoveFacts | null;
  refutation_sequence: string;
  threat_summary: string;
}

export function buildTacticalContext(
  fenBefore: string,
  playedMoveSan: string,
  bestMoveSan: string,
  refutationLineSan: string
): TacticalContext {
  const playedFacts = extractMoveFacts(fenBefore, playedMoveSan);

  let fenAfterPlayed = fenBefore;
  try {
    const c = new Chess(fenBefore);
    c.move(playedMoveSan.replace(/^\d+\.+/, '').trim());
    fenAfterPlayed = c.fen();
  } catch {}

  const bestFacts = extractMoveFacts(fenBefore, bestMoveSan);

  // Extract first move of refutation from fenAfterPlayed
  let refutationFacts: MoveFacts | null = null;
  const refMoves = refutationLineSan ? refutationLineSan.trim().split(/\s+/) : [];
  if (refMoves.length > 0 && refMoves[0]) {
    refutationFacts = extractMoveFacts(fenAfterPlayed, refMoves[0]);
  }

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

  return {
    played_move: playedFacts,
    best_move: bestFacts,
    opponent_refutation: refutationFacts,
    refutation_sequence: refutationLineSan,
    threat_summary: threats.join(' ') || 'No immediate tactical threat captured.',
  };
}
