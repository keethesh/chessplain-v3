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
const SCAN_TIME_CLASSES = ['rapid', 'blitz', 'daily'] as const;
const DRAW_RESULTS: Record<string, true> = { agreed: true, repetition: true, stalemate: true, insufficient: true, '50move': true, timevsinsufficient: true };

function isStandardGame(game: ChessComGameItem): boolean {
  return Boolean(game.pgn) && (game.rules ?? 'chess') === 'chess' && !/^\[Variant\s/m.test(game.pgn!);
}

export function mapEloToBand(rating: number): EloBand {
  if (rating < 1000) return 'under_1000';
  if (rating <= 1400) return '1000_1400';
  return 'above_1400';
}

/** A problem with the username itself (not found, no games); retrying cannot fix it. */
export class ChessComInputError extends Error {
  constructor(message: string, readonly kind: 'unknown_username' | 'no_games' | 'input' = 'input') {
    super(message);
    this.name = 'ChessComInputError';
  }
}

/**
 * The player's most recent standard games, newest first (at most RECENT_GAME_LIMIT),
 * walking back up to 4 monthly archives so a player returning from a break still
 * finds games. `timeClasses` keeps walking until that many games match, so a
 * month of bullet does not hide an older rapid game.
 */
async function fetchRecentStandardGames(
  username: string,
  opts?: { timeClasses?: readonly string[] },
): Promise<{ rating: number; games: ChessComGameItem[] }> {
  const cleanUsername = username.trim().toLowerCase();
  const headers = {
    'User-Agent': 'Chessplain/3.0 (contact@getchessplain.com)',
    'Accept': 'application/json',
  };

  // Rating for the explanation's level; a 404 here means the player does not exist.
  let rating = 1100; // default middle rating if not found
  const statsRes = await fetch(`https://api.chess.com/pub/player/${cleanUsername}/stats`, { headers }).catch(() => null);
  if (statsRes?.status === 404) {
    throw new ChessComInputError(`Chess.com has no player called '${username}'. Check the spelling.`, 'unknown_username');
  }
  if (statsRes?.ok) {
    const stats = (await statsRes.json().catch(() => ({}))) as ChessComStatsResponse;
    rating = stats.chess_rapid?.last?.rating || stats.chess_blitz?.last?.rating || stats.chess_bullet?.last?.rating || 1100;
  }

  const now = new Date();
  let all: ChessComGameItem[] = [];
  let standard: ChessComGameItem[] = [];
  let picked: ChessComGameItem[] = [];
  for (let back = 0; back < 4 && picked.length < RECENT_GAME_LIMIT; back++) {
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
    standard = all.filter(isStandardGame);
    picked = opts?.timeClasses
      ? standard.filter((g) => opts.timeClasses!.includes(g.time_class ?? ''))
      : standard;
  }

  if (all.length === 0) {
    throw new ChessComInputError(`'${username}' has no finished Chess.com games in the last 4 months. Paste the game's PGN instead.`);
  }
  if (standard.length === 0) {
    throw new ChessComInputError(
      `No standard chess games found for '${username}'. Chessplain reviews standard chess only — variants like Chess960 are not supported yet.`
    );
  }
  if (opts?.timeClasses && picked.length === 0) {
    throw new ChessComInputError(
      `'${username}' has no rapid, blitz, or daily games in the last 4 months.`,
      'no_games',
    );
  }
  return { rating, games: picked.slice(0, RECENT_GAME_LIMIT) };
}

function summarizeGame(username: string, game: ChessComGameItem): {
  playerColor: 'white' | 'black';
  player: ChessComGamePlayer;
  opponent: ChessComGamePlayer;
  outcome: ChessComGameSummary['outcome'];
} {
  const playerColor = game.white.username.toLowerCase() === username ? 'white' as const : 'black' as const;
  const player = playerColor === 'white' ? game.white : game.black;
  const opponent = playerColor === 'white' ? game.black : game.white;
  const outcome: ChessComGameSummary['outcome'] = player.result === 'win' ? 'win' : DRAW_RESULTS[player.result ?? ''] ? 'draw' : 'loss';
  return { playerColor, player, opponent, outcome };
}

export async function listRecentChessComGames(username: string): Promise<ChessComGameSummary[]> {
  const cleanUsername = username.trim().toLowerCase();
  const { games } = await fetchRecentStandardGames(username, { timeClasses: SCAN_TIME_CLASSES });
  return games.map((g) => {
    const { playerColor, player, opponent, outcome } = summarizeGame(cleanUsername, g);
    return {
      url: g.url ?? '',
      endedAt: new Date((g.end_time ?? 0) * 1000).toISOString(),
      timeClass: g.time_class ?? 'unknown',
      playerColor,
      outcome,
      playerRating: player.rating ?? null,
      opponent: opponent.username,
      opponentRating: opponent.rating ?? null,
    };
  });
}

export interface ChessComScanGame {
  pgn: string;
  url: string;
  endedAt: string;
  timeClass: 'rapid' | 'blitz' | 'daily';
  playerColor: 'white' | 'black';
  outcome: 'win' | 'loss' | 'draw';
  playerRating: number | null;
  opponent: string;
  opponentRating: number | null;
  eloBand: EloBand;
}

/** Last 10 standard rapid/blitz/daily games for a scan. Bullet and variants are skipped. */
export async function fetchScanGames(username: string): Promise<ChessComScanGame[]> {
  const cleanUsername = username.trim().toLowerCase();
  const { rating, games } = await fetchRecentStandardGames(username, { timeClasses: SCAN_TIME_CLASSES });
  const eloBand = mapEloToBand(rating);
  return games.map((g) => {
    const { playerColor, player, opponent, outcome } = summarizeGame(cleanUsername, g);
    return {
      pgn: g.pgn as string,
      url: g.url ?? '',
      endedAt: new Date((g.end_time ?? 0) * 1000).toISOString(),
      timeClass: g.time_class as ChessComScanGame['timeClass'],
      playerColor,
      outcome,
      playerRating: player.rating ?? null,
      opponent: opponent.username,
      opponentRating: opponent.rating ?? null,
      eloBand,
    };
  });
}

/** The player's latest standard game, or the recent game at `gameUrl`. */
export async function fetchRecentChessComGame(username: string, gameUrl?: string): Promise<ChessComGameResult> {
  const cleanUsername = username.trim().toLowerCase();
  const { rating, games } = await fetchRecentStandardGames(username, { timeClasses: SCAN_TIME_CLASSES });
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
