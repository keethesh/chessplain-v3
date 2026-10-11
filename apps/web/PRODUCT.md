# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Users

Primary hypothesis (2026-10-10): adult online players, roughly 600-1800 on Chess.com, who play most days, keep losing games the same way and want to stop, but won't keep a mistake log or run a checklist every move. They already open Chess.com Game Review and find it says what went wrong, not what keeps going wrong. The evidence is public forum talk only (see [Strategy](../../docs/STRATEGY.md)); there is no first-party research yet. Not for: players who play purely for fun, 2000+ players with coaches and engine workflows, under-13s, and bullet-only players. The moment prompt still emphasizes 600-1200 players with additional rating bands.

## Product Purpose

Help a player find the mistake they keep making, fix it on positions from their own games, and see whether it gets rarer in the games they play next. The owner chose this direction on 2026-10-10; reasoning, hypotheses and phases are in [Strategy](../../docs/STRATEGY.md).

Built today: a single-game review. Enter a Chess.com username and pick one of the 10 most recent games (players often play several games before reviewing one), or paste a specific game's PGN and select the played side. Read a summary, explore selected moments on the board, compare an available alternative, and take away a practical lesson. This review stays available and supplies the evidence behind any claim about a player's pattern.

Confirmed phase 1 entry point (2026-10-11): a Chess.com username starts a scan of the last 10 supported games, rather than asking the player to pick one first. Single-game review remains available. The scan is planned, not shipped.

Not built yet: a fixed concept list that lets reviews connect, a scan of recent games, a next step after every review, a check-in on the last habit, and watching new games. Automatic follow-through as the Premium package is still a proposal; current billing and prices are unchanged.

The explanation structure (what the move was going for, consequence, teachable concept, and takeaway) remains the product's core. The first part describes the move's aim from the board in the third person; it never claims to know the player's thoughts (validation rejects "I/me/my"). Asking the player what they intended is a possible later step. Explanations can be wrong; board exploration lets the player inspect the idea.

## Positioning

A chess coach for the mistake you keep making, not a game review. Explaining a single game is the most crowded part of the market (Chess.com's free daily Game Review, DecodeChess, Sensei and others); following one idea across a player's real games and telling them, unprompted, whether it is getting rarer is not. Prioritize explanations of ideas and consequences over move grades, with no accuracy-score theater. Public copy promises only what is built: "find the mistake you keep making" once the scan exists, and "know when you've stopped" only once follow-ups do. Internal engine evidence supports explanations; it does not establish psychological certainty or a demonstrated improvement in playing strength.

## Operating Context

- **Clean pivot context (2026-10-11):** no active users are using the current
  product. The old website, flow, UI, UX and pricing surface are replaceable;
  preserve only reusable engine, board and trust primitives. Existing accounts
  and report links remain data to handle, not a reason to keep the old front
  door.
- First value must be accessible without an account. The landing page provides both submission and a sample review at `/report/demo` (Morphy's Opera Game from Black's side, two moments). Accounts are optional and passwordless (`/login`: Continue with Google, or an email magic link; either signs up a new user). A signed-in player lands on a different home: remembered Chess.com username, games already reviewed marked, free reviews left, their reviews and recurring concepts (`/account`). Google was restored on 2026-09-30 because 324 of the 326 accounts from the previous version signed up with it. A signed-in user's free allowance is counted per account instead of per network.
- Submission opens `/report/[id]`; analysis is asynchronous. The engine queue processes games serially. Completion time and concurrent-user capacity have not been measured on the reported 24GB VPS, so no sub-20-second or paid-speed guarantee is justified.
- Reports and share views are accessible to anyone with their links. Do not call them private, owner-only, or confidential. Submitted game and player names can appear in the report.
- Source includes PostHog event hooks, including `landing_viewed`, `game_submitted`, and sample/billing actions. The homepage uses a single `editorial_v1` identifier. Production delivery to PostHog (EU) is verified; analytics is statistics-only (no session replay, surveys or heatmaps) with an opt-out on `/privacy`, as the UK PECR statistical exemption requires. A/B/E experiments and a measured production funnel are not established.

## Non-Negotiable Product Truths

1. **The chessboard is the primary learning surface.** Explanations support the board, not the reverse.
2. **One idea at a time.** One lesson per game and one open idea per player; never every micro-inaccuracy.
3. **No signup barrier for first value.** Two free reviews every 7 days without authentication.
4. **Honest engine humility.** Explanations describe probable intentions and objective continuations, not mind-reading.
5. **Evidence before claims.** Treat audience, retention, willingness to pay, and learning impact as hypotheses until tested.
6. **Earn the return.** Every screen offers a next step. Never pull players back with streak guilt, withheld answers, or email they did not opt into.
