// Injected before every page load by viewport-audit.mjs (AUDIT_INIT) to lay out the
// signed-in pages: a fake Supabase session plus canned /api/me and game-list responses.
// Nothing reaches the engine. Long names test wrapping at 320px. The runner replaces
// the tier token below from AUDIT_TIER=free|exhausted|premium (default free).
(() => {
  const now = Date.now();
  const iso = days => new Date(now - days * 86_400_000).toISOString();
  const b64 = o => btoa(JSON.stringify(o)).replace(/=+$/, '').replace(/\+/g, '-').replace(/\//g, '_');
  const exp = Math.floor(now / 1000) + 86_400;
  const user = { id: '00000000-0000-0000-0000-000000000000', email: 'a.rather.long.address@example.com', aud: 'authenticated', role: 'authenticated', app_metadata: {}, user_metadata: {}, created_at: iso(30) };
  const token = `${b64({ alg: 'HS256', typ: 'JWT' })}.${b64({ sub: user.id, exp, email: user.email, role: 'authenticated', aud: 'authenticated' })}.sig`;
  localStorage.setItem('sb-jgtxprfulkbtzkcvinph-auth-token', JSON.stringify({ access_token: token, token_type: 'bearer', expires_in: 86_400, expires_at: exp, refresh_token: 'x', user }));

  const tier = '__AUDIT_TIER__';
  const me = {
    email: user.email, tier: tier === 'premium' ? 'premium' : 'free',
    allowance: tier === 'premium' ? null : tier === 'exhausted' ? { limit: 2, used: 2, next_slot_at: new Date(now + 5 * 86_400_000).toISOString() } : { limit: 2, used: 1, next_slot_at: null },
    chesscom_username: 'a_long_chess_username',
    reviews: [
      { id: 'r1', share_id: 's1', status: 'completed', created_at: iso(1), headline: 'Two natural moves, each one already outnumbered.', moment_count: 2, game_url: 'https://www.chess.com/game/live/1', player_color: 'white', white_player: 'a_long_chess_username', black_player: 'an_opponent_with_a_long_name' },
      { id: 'r2', share_id: 's2', status: 'pending', created_at: iso(0), headline: null, moment_count: 0, game_url: null, player_color: null, white_player: null, black_player: null },
      ...[3, 4, 5].map(n => ({ id: 'r' + n, share_id: 's' + n, status: 'completed', created_at: iso(n), headline: 'Review number ' + n + ' with a headline long enough to wrap onto a second line on a narrow phone.', moment_count: 1, game_url: null, player_color: 'white', white_player: 'a_long_chess_username', black_player: 'opponent' + n })),
    ],
    patterns: [{ concept: 'Attackers and defenders', count: 3 }, { concept: 'Double attack', count: 2 }],
  };
  const games = { games: [
    { url: 'https://www.chess.com/game/live/1', endedAt: iso(1), timeClass: 'blitz', playerColor: 'white', outcome: 'loss', playerRating: 1210, opponent: 'an_opponent_with_a_long_name', opponentRating: 1250 },
    { url: 'https://www.chess.com/game/live/2', endedAt: iso(2), timeClass: 'rapid', playerColor: 'black', outcome: 'win', playerRating: 1210, opponent: 'bob', opponentRating: 1180 },
    { url: 'https://www.chess.com/game/live/3', endedAt: iso(3), timeClass: 'blitz', playerColor: 'white', outcome: 'draw', playerRating: 1210, opponent: 'carol', opponentRating: 1300 },
    { url: 'https://www.chess.com/game/live/4', endedAt: iso(4), timeClass: 'bullet', playerColor: 'black', outcome: 'loss', playerRating: 1210, opponent: 'dave', opponentRating: 1150 },
    { url: 'https://www.chess.com/game/live/5', endedAt: iso(5), timeClass: 'rapid', playerColor: 'white', outcome: 'win', playerRating: 1210, opponent: 'erin', opponentRating: 1195 },
    { url: 'https://www.chess.com/game/live/6', endedAt: iso(6), timeClass: 'blitz', playerColor: 'black', outcome: 'win', playerRating: 1210, opponent: 'frank', opponentRating: 1240 },
  ] };
  const json = body => Promise.resolve(new Response(JSON.stringify(body), { status: 200, headers: { 'content-type': 'application/json' } }));
  const realFetch = window.fetch;
  window.fetch = (input, init) => {
    const url = String(input instanceof Request ? input.url : input);
    if (url.endsWith('/api/me')) return json(me);
    if (/\/api\/chesscom\/[^/]+\/games/.test(url)) return json(games);
    return realFetch(input, init);
  };
})();
