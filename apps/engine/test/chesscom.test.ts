import { afterEach, describe, expect, it, vi } from 'vitest';
import { ChessComInputError, fetchRecentChessComGame, listRecentChessComGames } from '../src/analysis/chesscom.js';

function stubChessCom(stats: number, archive: number, games: unknown[] = []) {
  vi.stubGlobal('fetch', vi.fn(async (url: string) => {
    const status = url.endsWith('/stats') ? stats : archive;
    return new Response(JSON.stringify(url.endsWith('/stats') ? {} : { games }), { status });
  }));
}

afterEach(() => vi.unstubAllGlobals());

describe('fetchRecentChessComGame error classification', () => {
  it('reports a player Chess.com does not know as an input error', async () => {
    stubChessCom(404, 404);
    await expect(fetchRecentChessComGame('weshcooper2')).rejects.toBeInstanceOf(ChessComInputError);
  });

  it('reports an existing player with no recent games as an input error', async () => {
    stubChessCom(200, 200, []);
    await expect(fetchRecentChessComGame('quietplayer')).rejects.toBeInstanceOf(ChessComInputError);
  });

  it('treats a Chess.com outage as transient, not the user’s fault', async () => {
    stubChessCom(200, 503);
    const err = await fetchRecentChessComGame('hikaru').catch((e) => e);
    expect(err).toBeInstanceOf(Error);
    expect(err).not.toBeInstanceOf(ChessComInputError);
  });
});

describe('listRecentChessComGames', () => {
  const game = (id: number, me: 'white' | 'black', myResult: string) => ({
    url: `https://www.chess.com/game/live/${id}`,
    pgn: `[Event "g${id}"]\n\n1. e4 e5 *`,
    end_time: id,
    time_class: 'rapid',
    white: { username: me === 'white' ? 'Me' : 'opp', rating: 1200, result: me === 'white' ? myResult : 'win' },
    black: { username: me === 'black' ? 'Me' : 'opp', rating: 1210, result: me === 'black' ? myResult : 'win' },
  });

  it('lists newest first across months, from the player’s side', async () => {
    // Archives are oldest-first within a month; the current month is fetched first.
    const months = [[game(2, 'white', 'resigned'), game(3, 'black', 'agreed')], [game(1, 'white', 'win')]];
    let archiveCalls = 0;
    vi.stubGlobal('fetch', vi.fn(async (url: string) => new Response(
      JSON.stringify(url.endsWith('/stats') ? {} : { games: months[archiveCalls++] ?? [] }), { status: 200 })));

    const games = await listRecentChessComGames('me');
    expect(games.map((g) => [g.url.split('/').pop(), g.playerColor, g.outcome])).toEqual([
      ['3', 'black', 'draw'],
      ['2', 'white', 'loss'],
      ['1', 'white', 'win'],
    ]);
  });

  it('reviews the chosen game, and rejects one no longer in the recent list', async () => {
    vi.stubGlobal('fetch', vi.fn(async (url: string) => new Response(
      JSON.stringify(url.endsWith('/stats') ? {} : { games: [game(1, 'white', 'win'), game(2, 'black', 'resigned')] }), { status: 200 })));

    const chosen = await fetchRecentChessComGame('me', 'https://www.chess.com/game/live/1');
    expect(chosen.pgn).toContain('g1');
    expect(chosen.playerColor).toBe('white');
    expect((await fetchRecentChessComGame('me')).pgn).toContain('g2'); // no choice → latest
    await expect(fetchRecentChessComGame('me', 'https://www.chess.com/game/live/999')).rejects.toBeInstanceOf(ChessComInputError);
  });
});
