# Product

<!-- impeccable:product-schema 1 -->

## Platform

Web. This record distinguishes current source behavior from product intent; it is not evidence of a working production deployment.

## Users

The historical audience hypothesis is adult club-level Chess.com players, roughly 600-1800 Elo, reviewing a frustrating loss. The existing moment prompt emphasizes 600-1200 players with additional rating bands. Neither range is validated customer research. The current landing page more broadly invites players to understand a completed game, including wins and draws.

## Product Purpose

Help a player understand a few consequential decisions and leave with one habit to check next game. Enter a Chess.com username and pick one of the 10 most recent games (players often play several games before reviewing one), or paste a specific game's PGN and select the played side. Read a summary, explore selected moments on the board, compare an available alternative, and take away a practical lesson.

The explanation structure (what the move was going for, consequence, teachable concept, and takeaway) remains the product's core. The first part describes the move's aim from the board in the third person; it never claims to know the player's thoughts (validation rejects "I/me/my"). Asking the player what they intended is a possible later step. Explanations can be wrong; board exploration lets the player inspect the idea.

## Positioning

Prioritize explanations of ideas and consequences over move grades. The historical "anti-accuracy-score game review" framing and voice contract remain strong defaults, not user-confirmed immutable constraints. Internal engine evidence supports explanations; it does not establish psychological certainty or a demonstrated improvement in playing strength.

## Operating Context

- First value must be accessible without an account. The landing page provides both submission and an illustrative sample at `/report/demo`. Accounts are optional and passwordless (`/login`, email magic link; the same link signs up a new user); a signed-in user's free allowance is counted per account instead of per network.
- Submission opens `/report/[id]`; analysis is asynchronous. The engine queue processes games serially. Completion time and concurrent-user capacity have not been measured on the reported 24GB VPS, so no sub-20-second or paid-speed guarantee is justified.
- Reports and share views are accessible to anyone with their links. Do not call them private, owner-only, or confidential. Submitted game and player names can appear in the report.
- Source includes PostHog event hooks, including `landing_viewed`, `game_submitted`, and sample/billing actions. The homepage uses a single `editorial_v1` identifier. Production delivery to PostHog (EU) is verified; analytics is statistics-only (no session replay, surveys or heatmaps) with an opt-out on `/privacy`, as the UK PECR statistical exemption requires. A/B/E experiments and a measured production funnel are not established.

## Non-Negotiable Product Truths

1. **The chessboard is the primary learning surface.** Explanations support the board, not the reverse.
2. **One lesson per game is enough.** Do not overwhelm players with every micro-inaccuracy.
3. **No signup barrier for first value.** Two free reports every 7 days without authentication.
4. **Honest engine humility.** Explanations describe probable intentions and objective continuations, not mind-reading.
5. **Evidence before claims.** Treat audience, retention, willingness to pay, and learning impact as hypotheses until tested.
