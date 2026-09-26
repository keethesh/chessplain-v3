import { afterEach, describe, expect, it, vi } from 'vitest';
import { ChessComInputError, fetchRecentChessComGame } from '../src/analysis/chesscom.js';

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
