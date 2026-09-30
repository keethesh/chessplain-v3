# Chessplain: product and launch assessment

Audit of 30 September 2026 covering idea, business, architecture, backend,
frontend, SEO, legal and operations. It supersedes the 6 September review.
Evidence: code on `main`, read-only queries against production Supabase and
Stripe, the live site, the VPS, and the public sources linked below. Ordered
launch gates and production state live in
[LAUNCH_CHECKLIST.md](LAUNCH_CHECKLIST.md); this document holds the reasoning.
Nothing here is legal or tax advice.

## Verdict

- **Soft launch (invite-only, 20–75 players you can talk to): yes**, once the
  checklist's section 0 gates are done. That takes about a day of owner work.
- **Hard launch (public posts, Product Hunt, creators, paid acquisition): not
  yet.** Nothing has been proven with real users. Charging worldwide lacks a
  tax and consumer-law setup. The queue runs one game at a time, and nothing
  alerts when something breaks.
- **The idea:** the job is real (players who cannot turn an engine line into a
  reason and a habit), but demand, retention and willingness to pay are
  unproven for this version. The previous version converted 2 of ~324 sign-ups
  to paid (~0.6%), and both cancelled.

## What production data says (2026-09-30)

| Signal | Value | Reading |
|---|---|---|
| Reports ever | 28 (26 completed, 2 failed), 7 anonymous IPs, 2 signed-in submitters | Internal testing only; no real-user funnel yet |
| Moments per completed report | 0×4, 1×11, 2×6, 3×3, 4×2 | Most games yield one lesson; empty reports were genuinely clean games |
| Report quality (26 replayed) | correctness 2.50, relevance 2.54, clarity 2.96, actionability 2.88 of 3 | Current prompt scored 3/3/3/3 on both reports that used it (n=2) |
| Worker time with moments | 4.3–48 s; 48 s = two 30 s LLM timeouts | No per-stage timing yet |
| Accounts | 326 (324 Google, 2 email); active Dec 2025–May 2026 | An existing audience, see below |
| Revenue | Zero paying customers today; historically $39.96 + $9.99 from two customers | The live "subscriber" is the owner's 100%-off comp |
| LLM spend | $0.002 of the $10 key limit; ≈ $0.0013 per 3-moment report | Cost is not a constraint |

## Product and positioning

Promise: a short, board-checkable debrief of the decision that changed your
game — what it allowed, and one question to ask next game. First segment to
test: adult Chess.com/Lichess **rapid** players around 600–1500 who already
open Game Review but cannot turn the evaluation into a cause. Players ask for
exactly this ([r/chessbeginners](https://www.reddit.com/r/chessbeginners/comments/1horzn2/how_exactly_am_i_supposed_to_analyze_lost_games/),
[r/chessbeginners](https://www.reddit.com/r/chessbeginners/comments/14w5ja6/why_are_enginesgame_reviews_so_inconsistent/),
[Lichess forum](https://lichess.org/forum/general-chess-discussion/how-do-you-analyze-games)).
That validates the confusion, not payment.

Say "the moment that mattered", not "the moments that decided it": 15 of 26
reports had at most one moment. Never claim to be the only tool that explains
*why*, to read minds, to be instant, or to be private.

## Competition (checked 2026-09-30; prices vary by region)

| Alternative | Price / free tier | Approach | Where Chessplain can win |
|---|---|---|---|
| [Chess.com](https://support.chess.com/en/articles/8562418-what-does-each-level-of-premium-membership-get-me) | Free: one full Game Review a day; Platinum: unlimited; Diamond adds Coach explanations and Insights | Native, move labels, coach voice | One decision, checkable consequence, next-game habit; no account; works from any PGN |
| [Lichess](https://lichess.org/features) | Free | Raw Stockfish, eval graph, Learn from Mistakes | Human synthesis instead of engine access |
| [Aimchess](https://aimchess.com/) | Free: one 40-game report a month; $7.99/mo or $57.99/yr | Aggregate weaknesses, training plans | Faster single-game debrief |
| [DecodeChess](https://decodechess.com/pricing-plans/) | Paid subscription/credits | Engine-to-human explanation of plans and threats | Brevity and editorial focus |
| [Sensei Chess](https://senseichess.com/) | Currently free | AI coach with Chess.com + Lichess sync | Single-game simplicity; Sensei wins on sync and history |

## Pricing and packaging

Premium today ($9.99/month, $99.99/year) only removes the weekly quota. Next to
free Lichess, Chess.com's free daily review and a $7.99 Aimchess, "more of the
same" is a weak paid reason.

- Keep the current prices as a provisional test; do not change them before
  30–50 activated users.
- Prefer a **free-only soft launch**: it removes the tax question until you
  choose a billing route.
- After evidence, test one variable at a time: credit packs (e.g. $4.99 for 5)
  if repeat use is weak, or a durable premium feature (saved history, recurring
  patterns across games) if repeat use is strong. Do not build either first.
- Never issue unrestricted or "forever" promotion codes again.

## Unit economics

- LLM: ≈ $0.0013 per 3-moment report; a maximal free user (≈ 8.7 reviews a
  month) costs ≈ $0.011 a month.
- Stripe UK: 1.5% + 20p for UK cards, 2.5% + 20p for EEA cards
  ([pricing](https://stripe.com/gb/pricing)); international and currency
  conversion add more. Budget $0.60–0.80 per $9.99 charge.
- Fixed costs: the VPS is Oracle Cloud hardware and may be Always Free
  [INFERENCE — confirm in the OCI console]; the Supabase plan is unconfirmed;
  Cloudflare Workers is on the free plan (10 ms CPU per request); Resend
  free tier.
- Contribution is roughly $7.5 per $9.99 subscriber after fees and a VAT-inclusive
  price. Break-even = monthly fixed cash cost ÷ 7.5 (e.g. $30 → 4 subscribers).

## The existing asset: 326 accounts

324 signed up with Google, so `/login` now offers Continue with Google again
(the provider was still enabled in Supabase). 80 profiles carry a Chess.com
username and 35 a Lichess one. Their old reports were deleted with the v2
tables.

Under PECR, marketing email needs consent or the soft opt-in. The soft opt-in
applies only if the address came from a sale or negotiation for one and an
opt-out was offered at collection and in every message
([ICO](https://ico.org.uk/for-organisations/direct-marketing-and-privacy-and-electronic-communications/guide-to-pecr/electronic-and-telephone-marketing/)).
Nothing shows the v2 sign-up offered one. So send **one neutral account
notice**: what changed, what happened to their data, the new privacy policy.
Put no promotion in it, and include a link to opt in to launch updates. Market
only to those who opt in.

## Go-to-market: soft to hard

Channels in order of expected return for a solo founder: opted-in legacy
users; value-first answers in r/chessbeginners, r/chess and chess Discords
(follow each community's self-promotion rules; ask moderators first); small
creators (1k–50k) with tracked codes that are customer-restricted and
time-limited; then SEO guides. Product Hunt and Show HN come last; they are not
where chess players are.

| Week | Scope | Gate to continue |
|---|---|---|
| 0 | Checklist section 0; 20 internal/friendly reports incl. Black side, draws, clean games | No P0 billing/privacy incident |
| 1 | 20–30 invited players, a short conversation after each report | ≥ 15 useful reports; ≥ 8 players can state the lesson back |
| 2 | 50–75 invitees, 3 value-first community posts | ≥ 35 completed; ≥ 25% of activated players return within 7 days |
| 3 | 100–200 visits via communities/creators | ≥ 50 completed; ≥ 20% D7 return; organic shares |
| 4 | Hard-launch decision | ≥ 95% usable completion over 50+ reports; < 5% factual complaints; ≥ 25% D7; ≥ 3 real payers or 10 explicit commitments |

Stop scaling acquisition if D7 return stays under 20% after 50 reports, or if
more than 10% of reports draw factual disputes.

Lichess username import: add it before hard launch if more than 20% of
activated players come from Lichess or PGN paste causes visible friction. PGN
paste already works.

## Architecture

The design is boring and right for a soft launch. It runs a Fastify API and an
in-process worker on one VPS, with a Postgres table as the queue
(compare-and-swap claims, stale-lease recovery) and SSE progress. The web app
is Next.js on Cloudflare Workers; Supabase handles auth and Stripe handles
billing.

Before a hard launch:

1. **Capacity.** The worker processes one game at a time. At 24–48 s per
   moment-bearing game that is ≈ 75–150 reports an hour; a 1,000-submission
   spike would queue for hours. The cheapest fix is 2–3 concurrent job loops
   sharing the Stockfish pool. Claims are already compare-and-swap, and the
   LLM share of a job is I/O-bound.
2. **Observability.** Log per-stage timing and cache hits; add uptime and
   queue-age alerts.
3. **Single host.** One VPS is one point of failure. The host config
   (systemd, Caddy, firewall, Stockfish binary) lives only on the box and in
   `ENGINE_DEPLOYMENT.md`.
4. **Quota lock** is in-process: fine for one API process (see
   `ENGINE_DEPLOYMENT.md`).

Security review: no critical findings. Fixed on `main`:

- open redirect through the sign-in `next` parameter
- free-quota race (parallel submits got ~30 reports instead of 2)
- unbounded SSE connections
- the public share endpoint returning internal ids
- claims of other people's anonymous reports
- unvalidated `hero_variant`
- no rate limit on the Chess.com listing route
- stale CORS origins
- raw Stripe errors returned to clients
- unbounded PGN player names reaching prompts

Remaining: free-tier farming through new accounts (accept for now) and no
enforced CSP.

## Legal, tax and compliance

- **Tax.** B2C digital services sold to EU consumers owe VAT in the
  customer's country from the first sale; a UK business registers for the
  non-Union OSS ([HMRC](https://www.gov.uk/guidance/the-vat-rules-if-you-supply-digital-services-to-private-consumers)).
  The UK £90k threshold covers only UK sales. Stripe Tax is active but has
  no registrations, and checkout does not calculate tax. Options:
  - A Merchant of Record handles tax worldwide:
    [Stripe Managed Payments](https://docs.stripe.com/payments/managed-payments/eligibility)
    (least code change if eligible), [Paddle](https://www.paddle.com/pricing),
    [Lemon Squeezy](https://www.lemonsqueezy.com/pricing) or
    [Polar](https://polar.sh/docs/merchant-of-record/fees). Each costs a few
    percent more per sale.
  - Keep Stripe, register (OSS and others) and file returns.

  At this volume a Merchant of Record is the boring choice.
- **Consumer law.** UK consumers have a 14-day right to cancel online services
  ([CCR 2013](https://www.legislation.gov.uk/uksi/2013/3134/part/3)). The
  terms' existing full refund within 14 days of any charge covers it, and the
  terms now say so. The subscription rules in the DMCC Act (renewal reminders,
  easy exit) are expected from January 2027; build them before then.
- **Data protection.**
  - The privacy page now lists every processor and states that data is kept
    until a deletion request.
  - Still owner items: the controller's legal name and address; the ICO data
    protection fee (likely tier 1,
    [self-assessment](https://ico.org.uk/for-organisations/data-protection-fee/self-assessment-or-faqs-data-protection-fee/));
    a retention policy and a deletion routine.
  - Decide a minimum age. Chess has many minors
    ([Children's Code](https://ico.org.uk/for-organisations/uk-gdpr-guidance-and-resources/childrens-information/childrens-code-guidance-and-resources/age-appropriate-design-a-code-of-practice-for-online-services/services-covered-by-this-code/)).
- **Chess.com.** Use the public API as documented, send a descriptive
  User-Agent, and never imply endorsement; see the
  [PubAPI](https://support.chess.com/en/articles/9650547-what-is-the-pubapi-and-how-do-i-use-it)
  and the [user agreement](https://www.chess.com/legal/user-agreement).

## UX and SEO

Heuristic scores:
- Acquisition, account and billing surfaces: 30/40.
- Report, board and share surfaces: 33/40.
- No dark patterns found.

Strengths: the board is the primary surface, keyboard stepping works, controls
are 44 px, the empty and failed states offer recovery, and no sign-up is
needed for first value.

Fixed on `main`:
- Google sign-in, and recovery copy for cancelled and expired sign-in links.
- The quota-exhausted path now returns the player to the form after sign-in.
- Pricing sends players to the shared sign-in page.
- The 404 page's sample link was dead.
- The error page and the empty report overclaimed.
- Reports now carry a fallibility note, and shared pages disclose that anyone
  with the link can see player names.
- A cancelled native share no longer copies the link.

Still open:
- Report-specific help on engine uncertainty.
- Guidance while analysis is stalled.
- Announcing network drops.

SEO fixed on `main`:
- Client routes had inherited the homepage's title, description and canonical.
- User reports are now noindex, with crawl access kept so the tag is seen.
- Added JSON-LD, `llms.txt` and a cleaner sitemap; design prototypes are no
  longer publicly served.

Still open:
- HTTP→HTTPS and www→apex redirects (Cloudflare).
- Core Web Vitals, measured after deploy (the PageSpeed API quota ran out
  during the audit).
- Content: one genuinely useful guide per intent (chess game review, why did I
  lose, explain chess mistakes, Chess.com game review alternative), each linked
  to the sample and the form. No thin keyword pages.

## Material risks

- **Explanations can be wrong.** Validation checks form, not causal claims; the
  latest benchmark had 2 phantom-piece outputs in 49. Rerun it on the current
  prompt before a hard launch.
- **Public links.** Reports and share links are readable by anyone with the
  URL and include opponent names. That is disclosed, but it is not private.
- **One host, one worker, no alerts** — see Architecture.
- **Credential expiry.** The OpenRouter key expires 2026-12-25.
