# Chessplain: product and launch assessment

Reviewed against the repository on 6 September 2026. Existing strategy documents were treated as hypotheses. No production analytics, customer revenue, VPS benchmarks, Stripe account, or live database was inspected.

**This assessment predates three shipped changes: quota enforcement (2026-09-17),
the Cloudflare Workers migration with a completed custom-domain cutover
(2026-09-23), and a full visual/UX redesign around a "Forensic Match Report"
identity with a new headline and guided debrief flow (see
[`apps/web/DESIGN.md`](../apps/web/DESIGN.md) and
[`apps/web/PRODUCT.md`](../apps/web/PRODUCT.md) for current state).** The
monetization mechanics, positioning arguments, and open risks below are
otherwise still current as of 2026-09-23 — none of those three changes altered
what the customer pays for, the competitive argument, or the material risks
list. Treat "current source behavior" claims about the pre-redesign UI as
historical; treat monetization/positioning/risk analysis as live.

For the complete implementation inventory as of the original review, including
design and user-flow changes, see [CHANGES_2026-09-06.md](archive/CHANGES_2026-09-06.md)
(archive — describes the pre-redesign UI). For current documentation entry
points, see [README.md](README.md).

## Product decision

Make the promise: **understand one important decision, check its consequence on the board, and carry one useful question into the next game.**

The first audience to test is adult casual rapid players who already review some games but struggle to turn engine output into action. The documented 600–1200 rating band is a starting hypothesis, not a verified audience boundary. A player's intention is not observable from moves alone; use "the idea may have been," never mind-reading claims.

Five questions remain open:
- Problem: do players struggle to understand reviews often enough to return? Interview players after actual completed reports.
- Audience: which rating and time-control groups can explain the lesson back in their own words?
- Solution fit: does a short report plus playable consequence help more than the tools they already use?
- Feature value: is the next-game habit useful, or merely pleasant wording? Ask about the next game a week later.
- Competition: would they choose this over their existing review subscription or free analysis?

## What the code establishes

The app has username/PGN submission, a database-backed async analysis pipeline, Stockfish position evaluation, LLM explanations, link-accessible reports, email authentication, and Stripe integration. Those capabilities do not establish reliable production operation or willingness to pay.

The old sample was internally inconsistent. The new sample is an explicitly illustrative, legally replayed short mating example. It demonstrates the interaction; it is not proof that the live engine generates correct explanations.

The design now puts the form in the first screen and uses an actual sample board. Reports concentrate on one selected moment. Players can replay the chosen move, follow its continuation, and compare the proposed alternative. PGN users explicitly choose their side.

## Positioning and competition

"Other products only grade moves" is not defensible. Chess.com documents explanations and coach feedback in Game Review:
https://support.chess.com/en/articles/8584089-how-does-game-review-work
https://www.chess.com/news/view/chesscom-releases-new-game-review

Compete on a narrower experience: fewer points to absorb, precise consequences that can be checked, and a useful next-game action. Lichess analysis, existing paid game-review tools, videos, and simply playing another game are alternatives. No proprietary technical moat or competitor weakness was verified.

Retire accuracy-score antagonism as the main promise. A player can value both scores and explanations. Avoid saying every game has one decisive turning point: draws, wins, quiet games, and multiple missed chances do not fit that narrative.

## Monetization

The existing $9.99/month and $99.99/year prices remain starting offers. They are not validated prices. No revenue forecast is justified by this checkout.

**What the customer is paying for:** more game reviews. Free users receive two reports per rolling seven days, counted by network in production when quotas are enabled. Signed-in users whose profile is premium bypass that weekly allowance. Both use the same analysis and explanation pipeline. Paid access does not currently add stronger chess analysis, extra coaching features, a private library, or queue priority.

**Why a subscription is being offered:** the hypothesis is recurring use by players who want to review games regularly after experiencing a useful free report. Hosting the engine on the owner's 24GB VPS supports delivery, but the service also has external LLM, database, payment, and support costs. Pricing is for the review service, not a separate engine licence or VPS rental.

**Where the amounts came from:** the monthly and annual offers predated this frontend update and were retained. They were not derived from verified unit economics, competitor pricing research, or a user-approved new pricing experiment. Confirm that the actual Stripe amounts/currency/intervals match the page before accepting payments.

**Decision status:** preserve the accountless free first experience. Treat the paid offer as provisional until reliable reports, repeat use, report costs, and willingness to pay are demonstrated. An existing pricing page and connected checkout are not evidence that the product is ready to charge customers.

The paid loop now signs users in before checkout, derives entitlement identity server-side, includes account tokens in game submission, and exposes Stripe's customer portal. Unsupported "instant results", priority queue, and permanent history claims were removed from pricing. A report library is not implemented.

At 100 monthly subscribers, sticker-price gross revenue would be $999/month, before fees, tax, refunds, VPS, LLM usage, database costs, and support. This is arithmetic, not a customer forecast. Contribution per subscriber is:
subscription receipts - payment fees - reports per subscriber × marginal report cost - allocated infrastructure/support.

Do not sell unlimited automated throughput. The page says no weekly report quota for personal use, subject to fair use; the API still has hourly abuse limits. Measure actual usage before changing quotas or price.

## Validation sequence

1. Prove reliability on a staging stack: successful anonymous submission through completed readable report; Black-side import; re-open after completion; retry; exhausted allowance; email return; paid entitlement and cancellation.
2. Invite a small cohort to review real games. Ask: "What will you check next game?" and "Show me where the report proved that." Record specific comprehension failures.
3. Track completed usable reports / accepted submissions, time to first lesson and complete report (p50/p95), fallback frequency, disputed factual claims, return within 7 days, and paid conversion after a successful report.
4. Only then compare positioning or price. The former hero A/B variants mixed acquisition copy before the core value was established. The new version has a stable editorial_v1 identifier; do not pool it with old hero tests.
5. Acquisition: share useful, consented game explanations where players already ask for help. Track visits → submitted games → useful reports → return visits. Historical signup/comment estimates in old docs do not prove acquisition economics.

## Material remaining risks

- **Capacity:** one application worker processes one game at a time. Pool size parallelizes positions within a game. Increasing RAM or launching multiple app instances does not safely multiply throughput: restart recovery currently requeues all in-progress jobs. See ENGINE_DEPLOYMENT.md.
- **Engine lifecycle:** dead or slow UCI processes, depth-20 tail latency, and unbounded waiting need fault-injection testing. Health is not a guarantee of complete database/LLM availability.
- **Factual trust:** legal board replay verifies moves, not every generated causal statement. Quiet positional explanations and inferred intentions need human evaluation. Rejected verification candidates are no longer forcibly relabeled as verified; unavailable prose is explicitly disclosed.
- **Fallback economics:** a technically completed report may contain fallback text when LLM service fails. That can still consume allowance. Track and decide whether to refund such reports before charging broadly.
- **Public links:** both report IDs and share URLs are bearer access to the game. There is no private-report access control or expiring link. Anonymous report claiming does not prove the claimant was the submitter. Do not market private storage; introduce a separate owner capability before private libraries.
- **Quotas:** IP-based free usage can collide behind NAT and count-check/insertion is not atomic. Add a database transaction or reservation if concurrent abuse is observed; do not promise per-person anonymity enforcement.
- **Billing:** exercise webhook retries, missing profiles, out-of-order subscription changes, duplicate checkout, cancellation, and failed payments in Stripe test mode. Profile schema/trigger provisioning must exist; current migrations assume an older profiles table.
- **Privacy and operations:** confirm LLM provider data handling, contact/deletion workflow, retention, and refund operations. Existing legal pages are not evidence those operations exist.
- **External dependencies:** database schema, auth redirects/email delivery, provider credit limits, Stripe price configuration, Stockfish executable, reverse proxy buffering, and production origin settings all need staging verification.

## Scope of verification

Local builds/type checks and deterministic regression tests establish compilation and selected behavior, not live production reliability. No deployment, real subscription, test email, or customer-game submission was performed in this task. Public source links above support only the limited competition and engine-configuration observations.
