import { EloBand } from '../types.js';

export interface ChessComGameResult {
  pgn: string;
  eloBand: EloBand;
  rating: number;
  playerColor: 'white' | 'black';
  opponentUsername: string;
  gameUrl: string | null;
}

/** One row of a player's recent-games list, from that player's side. */
export interface ChessComGameSummary {
  url: string;
  endedAt: string;
  timeClass: string;
  playerColor: 'white' | 'black';
  outcome: 'win' | 'loss' | 'draw';
  playerRating: number | null;
  opponent: string;
  opponentRating: number | null;
}

interface ChessComStatsResponse {
  chess_rapid?: { last?: { rating?: number } };
  chess_blitz?: { last?: { rating?: number } };
  chess_bullet?: { last?: { rating?: number } };
}

interface ChessComGamePlayer {
  username: string;
  rating?: number;
  result?: string;
}

interface ChessComGameItem {
  pgn?: string;
  url?: string;
  end_time?: number;
  time_class?: string;
  rules?: string; // 'chess' for standard; 'chess960', 'bughouse', etc. for variants
  white: ChessComGamePlayer;
  black: ChessComGamePlayer;
}

interface ChessComGamesResponse {
  games?: ChessComGameItem[];
}

const RECENT_GAME_LIMIT = 10;
const DRAW_RESULTS: Record<string, true> = { agreed: true, repetition: true, stalemate: true, insufficient: true, '50move': true, timevsinsufficient: true };

export function mapEloToBand(rating: number): EloBand {
  if (rating < 1000) return 'under_1000';
  if (rating <= 1400) return '1000_1400';
  return 'above_1400';
}

/** A problem with the username itself (not found, no games); retrying cannot fix it. */
export class ChessComInputError extends Error {}

/**
 * The player's most recent standard games, newest first (at most RECENT_GAME_LIMIT),
 * walking back up to 4 monthly archives so a player returning from a break still
 * finds games.
 */
async function fetchRecentStandardGames(username: string): Promise<{ rating: number; games: ChessComGameItem[] }> {
  const cleanUsername = username.trim().toLowerCase();
  const headers = {
    'User-Agent': 'Chessplain/3.0 (contact@getchessplain.com)',
    'Accept': 'application/json',
  };

  // Rating for the explanation's level; a 404 here means the player does not exist.
  let rating = 1100; // default middle rating if not found
  const statsRes = await fetch(`https://api.chess.com/pub/player/${cleanUsername}/stats`, { headers }).catch(() => null);
  if (statsRes?.status === 404) {
    throw new ChessComInputError(`Chess.com has no player called '${username}'. Check the spelling.`);
  }
  if (statsRes?.ok) {
    const stats = (await statsRes.json().catch(() => ({}))) as ChessComStatsResponse;
    rating = stats.chess_rapid?.last?.rating || stats.chess_blitz?.last?.rating || stats.chess_bullet?.last?.rating || 1100;
  }

  const now = new Date();
  let all: ChessComGameItem[] = [];
  let standard: ChessComGameItem[] = [];
  for (let back = 0; back < 4 && standard.length < RECENT_GAME_LIMIT; back++) {
    const monthDate = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - back, 1));
    const y = monthDate.getUTCFullYear();
    const m = String(monthDate.getUTCMonth() + 1).padStart(2, '0');
    const res = await fetch(`https://api.chess.com/pub/player/${cleanUsername}/games/${y}/${m}`, { headers });
    if (res.ok) {
      // Archives are oldest-first; older months go after newer ones.
      const month = ((await res.json()) as ChessComGamesResponse).games || [];
      all = all.concat(month.reverse());
    } else if (res.status !== 404) {
      throw new Error(`Chess.com returned ${res.status} for ${cleanUsername}'s games`);
    }
    // Variants (Chess960 above all) carry a shuffled start position and
    // Shredder-FEN castling rights like "GAga", which standard chess rules reject.
    standard = all.filter((g) => g.pgn && (g.rules ?? 'chess') === 'chess' && !/^\[Variant\s/m.test(g.pgn));
  }

  if (all.length === 0) {
    throw new ChessComInputError(`'${username}' has no finished Chess.com games in the last 4 months. Paste the game's PGN instead.`);
  }
  if (standard.length === 0) {
    throw new ChessComInputError(
      `No standard chess games found for '${username}'. Chessplain reviews standard chess only — variants like Chess960 are not supported yet.`
    );
  }
  return { rating, games: standard.slice(0, RECENT_GAME_LIMIT) };
}

export async function listRecentChessComGames(username: string): Promise<ChessComGameSummary[]> {
  const cleanUsername = username.trim().toLowerCase();
  const { games } = await fetchRecentStandardGames(username);
  return games.map((g) => {
    const playerColor = g.white.username.toLowerCase() === cleanUsername ? 'white' : 'black';
    const player = playerColor === 'white' ? g.white : g.black;
    const opponent = playerColor === 'white' ? g.black : g.white;
    return {
      url: g.url ?? '',
      endedAt: new Date((g.end_time ?? 0) * 1000).toISOString(),
      timeClass: g.time_class ?? 'unknown',
      playerColor,
      outcome: player.result === 'win' ? 'win' : DRAW_RESULTS[player.result ?? ''] ? 'draw' : 'loss',
      playerRating: player.rating ?? null,
      opponent: opponent.username,
      opponentRating: opponent.rating ?? null,
    };
  });
}

/** The player's latest standard game, or the recent game at `gameUrl`. */
export async function fetchRecentChessComGame(username: string, gameUrl?: string): Promise<ChessComGameResult> {
  const cleanUsername = username.trim().toLowerCase();
  const { rating, games } = await fetchRecentStandardGames(username);
  const game = gameUrl ? games.find((g) => g.url === gameUrl) : games[0];
  if (!game) {
    throw new ChessComInputError('That game is no longer among your 10 most recent. Pick another, or paste its PGN.');
  }

  const isWhite = game.white.username.toLowerCase() === cleanUsername;
  return {
    pgn: game.pgn as string,
    eloBand: mapEloToBand(rating),
    rating,
    playerColor: isWhite ? 'white' : 'black',
    opponentUsername: isWhite ? game.black.username : game.white.username,
    gameUrl: game.url ?? null,
  };
}
