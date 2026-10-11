import { afterEach, describe, expect, it, vi } from 'vitest';
import { ChessComInputError, fetchScanGames, listRecentChessComGames } from '../src/analysis/chesscom.js';

function game(id: number, timeClass: string, rules = 'chess') {
  return {
    url: `https://www.chess.com/game/live/${id}`,
    pgn: `[Event "g${id}"]\n\n1. e4 e5 *`,
    end_time: id,
    time_class: timeClass,
    rules,
    white: { username: 'Me', rating: 1500, result: 'win' },
    black: { username: 'opp', rating: 1400, result: 'checkmated' },
  };
}

afterEach(() => vi.unstubAllGlobals());

describe('fetchScanGames', () => {
  it('keeps the last 10 rapid, blitz, and daily games and skips bullet', async () => {
    // Archives are oldest-first. Bullets are the newest so a scan must keep walking.
    const current = [
      game(2, 'rapid'),
      game(3, 'daily'),
      ...Array.from({ length: 12 }, (_, i) => game(100 + i, 'bullet')),
    ];
    const older = [game(1, 'blitz')];
    const now = new Date();
    const monthKey = (back: number) => {
      const d = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - back, 1));
      return `${d.getUTCFullYear()}/${String(d.getUTCMonth() + 1).padStart(2, '0')}`;
    };
    const byMonth: Record<string, unknown[]> = { [monthKey(0)]: current, [monthKey(1)]: older };
    vi.stubGlobal('fetch', vi.fn(async (url: string) => {
      const month = url.match(/\/games\/(\d{4}\/\d{2})/)?.[1];
      const body = url.endsWith('/stats')
        ? { chess_rapid: { last: { rating: 1500 } } }
        : { games: month ? byMonth[month] ?? [] : [] };
      return new Response(JSON.stringify(body), { status: 200 });
    }));

    const games = await fetchScanGames('me');
    expect(games.map(g => [g.timeClass, g.url.split('/').pop(), g.playerColor, g.outcome, g.eloBand])).toEqual([
      ['daily', '3', 'white', 'win', 'above_1400'],
      ['rapid', '2', 'white', 'win', 'above_1400'],
      ['blitz', '1', 'white', 'win', 'above_1400'],
    ]);
    expect(games[0].pgn).toContain('g3');
    expect(games[0].opponent).toBe('opp');

    // The review game picker offers the same games a scan reads: no bullet.
    const listed = await listRecentChessComGames('me');
    expect(listed.map(g => g.timeClass)).toEqual(['daily', 'rapid', 'blitz']);
  });

  it('reports an unknown player and a player with only bullet as input errors', async () => {
    vi.stubGlobal('fetch', vi.fn(async (url: string) => new Response('{}', { status: url.endsWith('/stats') ? 404 : 200 })));
    const missing = await fetchScanGames('nope').catch(e => e);
    expect(missing).toBeInstanceOf(ChessComInputError);
    expect(missing.kind).toBe('unknown_username');

    vi.stubGlobal('fetch', vi.fn(async (url: string) => new Response(
      JSON.stringify(url.endsWith('/stats') ? {} : { games: [game(1, 'bullet')] }),
      { status: 200 },
    )));
    const bulletOnly = await fetchScanGames('me').catch(e => e);
    expect(bulletOnly).toBeInstanceOf(ChessComInputError);
    expect(bulletOnly.kind).toBe('no_games');
  });
});
