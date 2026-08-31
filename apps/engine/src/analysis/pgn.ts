import { Chess } from 'chess.js';
import { GamePhase, PositionInfo } from '../types.js';

export interface ParsedGame {
  headers: Record<string, string | undefined>;
  positions: PositionInfo[];
  playerName?: string;
  opponentName?: string;
  playerColor: 'white' | 'black';
  result?: string;
  timeControl?: string;
  moveCount: number;
}

export function parsePgn(pgn: string, targetPlayer?: string): ParsedGame {
  const chess = new Chess();
  chess.loadPgn(pgn);

  const rawHeaders = chess.header();
  const headers: Record<string, string | undefined> = {};
  for (const [k, v] of Object.entries(rawHeaders)) {
    headers[k] = v ?? undefined;
  }

  const whiteName = headers['White'] || 'White';
  const blackName = headers['Black'] || 'Black';

  let playerColor: 'white' | 'black' = 'white';
  let playerName = whiteName;
  let opponentName = blackName;

  if (targetPlayer) {
    const targetLower = targetPlayer.toLowerCase();
    if (blackName.toLowerCase() === targetLower) {
      playerColor = 'black';
      playerName = blackName;
      opponentName = whiteName;
    } else {
      playerColor = 'white';
      playerName = whiteName;
      opponentName = blackName;
    }
  }

  // Replay moves to extract FENs and positions
  const replayChess = new Chess();
  const history = chess.history({ verbose: true });
  const positions: PositionInfo[] = [];

  for (let i = 0; i < history.length; i++) {
    const move = history[i];
    const fenBefore = replayChess.fen();
    const isPlayer = (move.color === 'w' && playerColor === 'white') || (move.color === 'b' && playerColor === 'black');

    replayChess.move({
      from: move.from,
      to: move.to,
      promotion: move.promotion,
    });

    const fenAfter = replayChess.fen();
    const moveNumber = Math.floor(i / 2) + 1;
    const sanWithNumber = move.color === 'w' ? `${moveNumber}.${move.san}` : `${moveNumber}...${move.san}`;

    positions.push({
      ply: i + 1,
      moveNumber,
      san: sanWithNumber,
      uci: `${move.from}${move.to}${move.promotion || ''}`,
      fenBefore,
      fenAfter,
      playerColor: move.color === 'w' ? 'white' : 'black',
      isPlayerMove: isPlayer,
    });
  }

  return {
    headers,
    positions,
    playerName,
    opponentName,
    playerColor,
    result: headers['Result'],
    timeControl: headers['TimeControl'],
    moveCount: Math.ceil(history.length / 2),
  };
}

export function computeGamePhase(fen: string): GamePhase {
  const [placement] = fen.split(' ');
  const pieces = placement.replace(/[\d/]/g, '');

  const majorMinorCount = (pieces.match(/[rnbqRNBQ]/g) || []).length;
  const queenCount = (pieces.match(/[qQ]/g) || []).length;

  if (majorMinorCount >= 14) {
    return 'opening';
  } else if (queenCount === 0 || majorMinorCount <= 6) {
    return 'endgame';
  } else {
    return 'middlegame';
  }
}

export function computeMaterialNote(fenBefore: string, fenAfter: string, playerColor: 'white' | 'black'): string {
  const values: Record<string, number> = { p: 1, n: 3, b: 3, r: 5, q: 9, k: 0 };
  const getMaterial = (fen: string) => {
    const pieces = fen.split(' ')[0].replace(/[\d/]/g, '');
    let white = 0;
    let black = 0;
    for (const ch of pieces) {
      const lower = ch.toLowerCase();
      const val = values[lower] || 0;
      if (ch >= 'A' && ch <= 'Z') white += val;
      else black += val;
    }
    return { white, black, diff: playerColor === 'white' ? white - black : black - white };
  };

  const before = getMaterial(fenBefore);
  const after = getMaterial(fenAfter);

  if (before.diff === 0 && after.diff === 0) {
    return 'Material was even.';
  } else if (after.diff > 0) {
    return `You were up ${after.diff} pawns of material.`;
  } else if (after.diff < 0) {
    return `You were down ${Math.abs(after.diff)} pawns of material.`;
  }
  return 'Material was approximately equal.';
}
