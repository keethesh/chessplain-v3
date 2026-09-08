# Product

<!-- impeccable:product-schema 1 -->

## Platform

Web. This record distinguishes current source behavior from product intent; it is not evidence of a working production deployment.

## Users

The historical audience hypothesis is adult club-level Chess.com players, roughly 600–1800 Elo, reviewing a frustrating loss. The existing moment prompt emphasizes 600–1200 players with additional rating bands. Neither range is validated customer research. The current landing page more broadly invites players to understand a completed game, including wins and draws.

## Product Purpose

Help a player understand a few consequential decisions and leave with one habit to check next game. Submit a Chess.com username for the latest completed game, or paste a specific game's PGN and select the played side. Read a summary, explore selected moments on the board, compare an available alternative, and take away a practical lesson.

The original explanation structure—possible intention, consequence, teachable concept, and takeaway—remains useful product intent. A suggested intention is an interpretation, not knowledge of the player's thoughts. Explanations can be wrong; board exploration lets the player inspect the idea.

## Positioning

Prioritize explanations of ideas and consequences over move grades. The historical "anti-accuracy-score game review" framing and voice contract remain strong defaults, not user-confirmed immutable constraints. Internal engine evidence supports explanations; it does not establish psychological certainty or a demonstrated improvement in playing strength.

## Operating Context

- First value must be accessible without an account. The landing page provides both submission and an illustrative sample at `/report/demo`.
- Submission opens `/report/[id]`; analysis is asynchronous. The engine queue processes games serially. Completion time and concurrent-user capacity have not been measured on the reported 24GB VPS, so no sub-20-second or paid-speed guarantee is justified.
- Reports and share views are accessible to anyone with their links. Do not call them private, owner-only, or confidential. Submitted game and player names can appear in the report.
- Source includes PostHog event hooks, including `landing_viewed`, `game_submitted`, and sample/billing actions. The homepage uses a single `editorial_v1` identifier. A/B/E experiments and a measured production funnel are not established by this code; production analytics delivery and results have not been verified.

## Capabilities and Constraints

- Two submission methods: latest completed Chess.com game by username, or pasted PGN with player-side selection.
- The UI offers two free reports every seven days without signup and explains that the allowance is counted by network. Shared connections may share that allowance.
- Pricing displays $9.99 monthly or $99.99 yearly, recurring until cancelled. Paid copy offers no weekly quota for personal use, subject to fair use; processing still takes time.
- Pricing supports email-link authentication, checkout initiation, and a billing portal. Payment confirmation happens on Stripe; returning from checkout does not itself prove entitlement activation. Live billing configuration and transactions require separate verification.
- A report link can be revisited or shared. There is no implemented saved-report history library to advertise.
- Routes include `/`, `/report/[id]`, `/r/[shareId]`, `/pricing`, `/privacy`, `/terms`, and `/auth/callback`.
- Stack: Next.js App Router, React, Tailwind CSS, react-chessboard, chess.js, Supabase auth/data, and PostHog integration; a separate engine service performs analysis.

## Pricing and Entitlement

The subscription pays for reviewing more games with the same explanation experience. The paid entitlement currently removes the free weekly report allowance; it does not unlock a stronger engine, deeper analysis, a different explanation model, priority processing, private reports, or a history library.

| Plan | Current displayed price | Implemented distinction |
| --- | --- | --- |
| Free | $0 | Two reports per rolling seven days, counted by network in production when quota enforcement is enabled; no signup required. |
| Paid | $9.99/month or $99.99/year | An authenticated account marked premium bypasses that weekly allowance. The same report pipeline is used. Fair-use and request rate limits still apply. |

These prices were already present before the September 2026 frontend work. They were retained, not newly calculated from VPS costs or validated through customer research. Displayed amounts must be checked against the configured Stripe prices before launch.

The commercial hypothesis is that players who find the free reports useful will pay to review games regularly. Revenue must cover engine hosting, external AI explanation requests, database services, payment fees, and support. The existing 24GB VPS hosts Stockfish; it does not make those other costs disappear or establish how many users can be served.

Treat this as a provisional offer. Validate reliable delivery, repeat use, cost per usable report, and willingness to pay before expanding acquisition or promising paid capacity. See [the product assessment](../../docs/PRODUCT_REVIEW_2026-09-06.md#monetization) for rationale and launch limits.

## Brand Commitments

- **Binding (user-confirmed):** the first taste is free and requires no signup. Keep the initial review and sample accountless; authentication belongs to subscription management.
- Name: Chessplain. Current identity includes a serif wordmark, a line-drawn chess symbol, and an SVG app icon.
- Plain language, calm presentation, and one useful lesson guide the current experience. The voice contract in `docs/MOMENT_PROMPT.md` remains a strong default, not a substitute for checking whether generated output is supported by the position.

## Evidence on Hand

- [Complete September change record](../../docs/CHANGES_2026-09-06.md) covers the design, frontend flows, API, engine, billing, analytics, and configuration work. [Documentation index](../../docs/README.md) links the current records and identifies historical references.

- Current landing, layout, pricing, and shared review components show implemented frontend behavior; `DESIGN.md` records its current visual system.
- `docs/MOMENT_PROMPT.md` provides historical generation guidance and examples.
- `docs/REBUILD_STRATEGY_31082026.md` and `CHESSPLAIN_V3_REBUILD_EXECUTION_PLAN.md` preserve strategy and planned milestones; plans are not shipped-feature evidence.
- `wireframes-report-page.html` is a historical design artifact, not proof of current responsive behavior.
- No customer research, testimonials, conversion results, or production performance measurements were verified during this refresh. Do not invent them.
- This update is based on source inspection. Screenshot transport was unavailable; visual validation remains outstanding.

## Product Principles

1. **The explanation is the product.** Make it easy to reach, read, check, and revisit.
2. **Meet the player in the moment.** Aim for clarity and short waits; measure actual latency before making promises.
3. **Value before accounts.** Preserve a free, accountless first taste.
4. **Plans, not grades.** Connect decisions to consequences without pretending to know the player's mind.
5. **Evidence before claims.** Treat audience, retention, willingness to pay, and learning impact as hypotheses until tested.
