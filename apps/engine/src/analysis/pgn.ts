import { Chess } from 'chess.js';
import type { CandidateMoment, GameEnding, GamePhase, InGameFacts, PositionInfo } from '../types.js';

export interface ParsedGame {
  headers: Record<string, string | undefined>;
  positions: PositionInfo[];
  playerName?: string;
  opponentName?: string;
  playerColor: 'white' | 'black';
  result?: string;
  timeControl?: string;
  moveCount: number;
  ending: GameEnding;
}

// PGN headers are user-controlled and flow into prompts, storage and reports.
const MAX_PLAYER_NAME_LENGTH = 80;

function sanitizePlayerName(value: string | undefined, fallback: string): string {
  const sanitized = (value || '')
    .replace(/[\u0000-\u001f\u007f]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, MAX_PLAYER_NAME_LENGTH);
  return sanitized || fallback;
}

/**
 * The board decides mate and stalemate. Otherwise the Termination header picks
 * one word from a closed list: on a pasted PGN it is user-controlled, so its
 * text never reaches a prompt.
 */
function gameEnding(finalPosition: Chess, termination: string | undefined): GameEnding {
  if (finalPosition.isCheckmate()) return 'checkmate';
  if (finalPosition.isStalemate()) return 'stalemate';
  const text = termination ?? '';
  if (/resign/i.test(text)) return 'resignation';
  if (/abandon/i.test(text)) return 'abandoned';
  if (/time/i.test(text)) return 'time';
  if (/agreement/i.test(text)) return 'agreement';
  if (/repetition/i.test(text)) return 'repetition';
  if (/insufficient/i.test(text)) return 'insufficient material';
  return 'unknown';
}

const bareSan = (san: string) => san.replace(/^\d+\.(\.\.)?/, '').replace(/[+#]$/, '');

/**
 * What really happened after a reviewed move, read from the game record. The
 * engine's refutation is what the move allowed; the opponent may have played
 * something else, or the game may have ended first.
 */
export function inGameFacts(positions: PositionInfo[], candidate: Pick<CandidateMoment, 'ply' | 'refutationLineSan'>): InGameFacts {
  const line = candidate.refutationLineSan.split(/\s+/).filter(Boolean);
  const window = Math.min(4, Math.max(2, line.length));
  // positions[i] is ply i + 1, so slicing at the moment's ply starts with the reply.
  const next = positions.slice(candidate.ply, candidate.ply + window);
  let played = 0;
  while (played < Math.min(line.length, next.length) && bareSan(next[played].san) === bareSan(line[played])) played++;
  return {
    next_moves: next.map((p) => ({ move: p.san, by: p.isPlayerMove ? 'you' : 'opponent' })),
    refutation_moves_played: played,
    game_over: positions.length <= candidate.ply + window,
  };
}

export function parsePgn(pgn: string, targetPlayer?: string): ParsedGame {
  const chess = new Chess();
  chess.loadPgn(pgn);

  const rawHeaders = chess.header();
  const headers: Record<string, string | undefined> = {};
  for (const [k, v] of Object.entries(rawHeaders)) {
    headers[k] = v ?? undefined;
  }

  const whiteName = sanitizePlayerName(headers['White'], 'White');
  const blackName = sanitizePlayerName(headers['Black'], 'Black');
  headers['White'] = whiteName;
  headers['Black'] = blackName;

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
  const replayChess = new Chess(headers['FEN']);
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
    const moveNumber = Number(fenBefore.split(' ')[5]);
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
    ending: gameEnding(replayChess, headers['Termination']),
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
