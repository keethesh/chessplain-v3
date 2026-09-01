import { EloBand } from '../types.js';

export interface ChessComGameResult {
  pgn: string;
  eloBand: EloBand;
  rating: number;
  playerColor: 'white' | 'black';
  opponentUsername: string;
}

interface ChessComStatsResponse {
  chess_rapid?: { last?: { rating?: number } };
  chess_blitz?: { last?: { rating?: number } };
  chess_bullet?: { last?: { rating?: number } };
}

interface ChessComGamePlayer {
  username: string;
  rating?: number;
}

interface ChessComGameItem {
  pgn?: string;
  white: ChessComGamePlayer;
  black: ChessComGamePlayer;
}

interface ChessComGamesResponse {
  games?: ChessComGameItem[];
}

export function mapEloToBand(rating: number): EloBand {
  if (rating < 1000) return 'under_1000';
  if (rating <= 1400) return '1000_1400';
  return 'above_1400';
}

export async function fetchRecentChessComGame(username: string): Promise<ChessComGameResult> {
  const cleanUsername = username.trim().toLowerCase();
  const headers = {
    'User-Agent': 'Chessplain/3.0 (contact@getchessplain.com)',
    'Accept': 'application/json',
  };

  // 1. Fetch user stats for Elo rating
  let rating = 1100; // default middle rating if not found
  try {
    const statsRes = await fetch(`https://api.chess.com/pub/player/${cleanUsername}/stats`, { headers });
    if (statsRes.ok) {
      const stats = (await statsRes.json()) as ChessComStatsResponse;
      const rapid = stats.chess_rapid?.last?.rating;
      const blitz = stats.chess_blitz?.last?.rating;
      const bullet = stats.chess_bullet?.last?.rating;
      rating = rapid || blitz || bullet || 1100;
    }
  } catch (err) {
    console.warn(`Failed to fetch stats for ${cleanUsername}:`, err);
  }

  const eloBand = mapEloToBand(rating);

  // 2. Fetch games from current month, fallback to previous month if empty
  const now = new Date();
  const yyyy = now.getUTCFullYear();
  const mm = String(now.getUTCMonth() + 1).padStart(2, '0');

  let games: ChessComGameItem[] = [];
  const gamesRes = await fetch(`https://api.chess.com/pub/player/${cleanUsername}/games/${yyyy}/${mm}`, { headers });
  if (gamesRes.ok) {
    const data = (await gamesRes.json()) as ChessComGamesResponse;
    games = data.games || [];
  }

  if (games.length === 0) {
    // Try previous month
    const prevDate = new Date(Date.UTC(yyyy, now.getUTCMonth() - 1, 1));
    const prevY = prevDate.getUTCFullYear();
    const prevM = String(prevDate.getUTCMonth() + 1).padStart(2, '0');
    const prevRes = await fetch(`https://api.chess.com/pub/player/${cleanUsername}/games/${prevY}/${prevM}`, { headers });
    if (prevRes.ok) {
      const prevData = (await prevRes.json()) as ChessComGamesResponse;
      games = prevData.games || [];
    }
  }

  if (games.length === 0) {
    throw new Error(`No recent games found for Chess.com user '${username}'`);
  }

  // Get the most recent game
  const latestGame = games[games.length - 1];
  const pgn = latestGame.pgn;
  if (!pgn) {
    throw new Error(`Latest game for '${username}' has no PGN`);
  }

  const isWhite = latestGame.white.username.toLowerCase() === cleanUsername;
  const playerColor = isWhite ? 'white' : 'black';
  const opponentUsername = isWhite ? latestGame.black.username : latestGame.white.username;

  return {
    pgn,
    eloBand,
    rating,
    playerColor,
    opponentUsername,
  };
}
