# Chessplain: product and launch assessment

Audit of 30 September 2026 covering idea, business, architecture, backend,
frontend, SEO, legal and operations, updated the same day with the owner's
decisions (public launch, Stripe Managed Payments, a relaunch email) and the
fixes that followed. It supersedes the 6 September review. Evidence: code on
`main`, queries against production Supabase and Stripe, the live site, the
VPS, and the public sources linked below. Production state and the remaining
owner items live in [LAUNCH_CHECKLIST.md](LAUNCH_CHECKLIST.md); this document
holds the reasoning. Nothing here is legal or tax advice.

## Verdict

- **Public launch: go** (owner decision, 2026-09-30). What blocked it is
  closed:
  - fixes deployed
  - the unlimited promotion code archived
  - VPS ports closed and host patched
  - HTTPS and www redirects on
  - tax handled by a merchant of record
  - premium profiles reconciled
  - two games analysed at once
  - benchmark rerun on the current prompt

  Open owner items before launch: OpenRouter credit, one real purchase through
  Managed Payments, new Supabase API keys, the relaunch email and Stripe's
  support email (checklist section 0). The ICO fee and the Supabase custom
  domain are deferred.
- **The idea:** the job is real (players who cannot turn an engine line into a
  reason and a habit), and people have paid for it. The previous version had
  paying subscribers even though it barely worked: 2 customers and 5 charges
  ($49.95) in Stripe, of which the owner refunded $39.96 because the service
  was down. The owner recalls 2–3 payers. What is unproven is whether *this*
  version keeps users coming back and converts them; measure that from launch
  week.

## What production data says (2026-09-30)

| Signal | Value | Reading |
|---|---|---|
| Reports ever | 28 (26 completed, 2 failed), 7 anonymous IPs, 2 signed-in submitters | Internal testing only; no real-user funnel yet |
| Moments per completed report | 0×4, 1×11, 2×6, 3×3, 4×2 | Most games yield one lesson; empty reports were genuinely clean games |
| Report quality (26 replayed) | correctness 2.50, relevance 2.54, clarity 2.96, actionability 2.88 of 3 | Current prompt scored 3/3/3/3 on both reports that used it (n=2) |
| Time per report | New game after the 2026-09-30 deploy: 19.8 s (sweep 0.7 s, verify 10.3 s, explain 4.1 s, summary 4.6 s). Re-runs with a warm cache: 6–7 s. Earlier: 4.3–48 s, where 48 s = two 30 s LLM timeouts | For new games the depth-20 verify dominates; for cached ones the LLM does |
| Accounts | 326 (324 Google, 2 email); active Dec 2025–May 2026 | An existing audience, see below |
| Revenue | No paying customers today; the active subscriptions are the owner's own | Previous version: paid despite not working (see Verdict) |
| LLM spend | $0.35 of the $10 key limit (mostly the 2026-09-30 benchmark and its judge model); ≈ $0.0013 per 3-moment report. The OpenRouter account itself had $3.07 left | Cost per report is not a constraint; the account balance is |

## Product and positioning

Promise: a short, board-checkable debrief of the decision that changed your
game — what it allowed, and one question to ask next game. First segment:
adult Chess.com/Lichess **rapid** players around 600–1500 who already open
Game Review but cannot turn the evaluation into a cause. Players ask for
exactly this ([r/chessbeginners](https://www.reddit.com/r/chessbeginners/comments/1horzn2/how_exactly_am_i_supposed_to_analyze_lost_games/),
[r/chessbeginners](https://www.reddit.com/r/chessbeginners/comments/14w5ja6/why_are_enginesgame_reviews_so_inconsistent/),
[Lichess forum](https://lichess.org/forum/general-chess-discussion/how-do-you-analyze-games)).

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

Premium ($9.99/month, $99.99/year) only removes the weekly quota. Next to free
Lichess, Chess.com's free daily review and a $7.99 Aimchess, "more of the same"
is a weak paid reason.

- Keep the current prices (owner decision); don't change them before 30–50
  activated users.
- Prices are **tax-inclusive** (set 2026-09-30): every buyer pays exactly the
  listed price, and tax comes out of it. This matches UK rules that consumer
  prices include VAT.
- After evidence, test one variable at a time: credit packs (e.g. $4.99 for 5)
  if repeat use is weak, or a durable premium feature (saved history, recurring
  patterns across games) if repeat use is strong. Don't build either first.
- Never issue unrestricted or "forever" promotion codes again; restrict new
  ones to a customer, a redemption count or an expiry.

## Unit economics

- LLM: ≈ $0.0013 per 3-moment report; a maximal free user (≈ 8.7 reviews a
  month) costs ≈ $0.011 a month.
- Payments: Stripe Managed Payments charges 3.5% of the tax-inclusive total
  ([Stripe](https://support.stripe.com/questions/managed-payments-pricing)).
  That is on top of card processing: 1.5% + 20p for UK cards and 2.5% + 20p
  for EEA cards ([pricing](https://stripe.com/gb/pricing)), with more for
  international cards and currency conversion.
- Per $9.99 charge after tax and fees (estimate): ≈ $7.4–7.6 from UK/EU
  buyers (20–21% VAT), ≈ $8.8 from US buyers where no sales tax applies.
- Fixed costs:
  - The VPS runs on Oracle Cloud hardware and may be Always Free [INFERENCE —
    confirm in the OCI console].
  - The Supabase plan is unconfirmed.
  - Cloudflare Workers is on the free plan (10 ms CPU per request).
  - Resend is on the free tier.
- Break-even = monthly fixed cash cost ÷ 7.5 (e.g. $30 → 4 subscribers).

## The existing asset: 326 accounts

324 signed up with Google, so `/login` offers Continue with Google again (the
provider was still enabled in Supabase). 80 profiles carry a Chess.com
username and 35 a Lichess one. Their old reports were deleted with the v2
tables.

**History:** the same list already got one relaunch email. "It's your turn."
went out on 6–8 March 2026 to about 229 people in three batches, from
`keethesh@mail.getchessplain.com`. It said Chessplain was "genuinely rebuilt,
rebranded, and ready, for the first time", and then the backend was not up.
2 contacts unsubscribed.

**Decision (owner, 2026-09-30):** one relaunch email to current accounts, with
a one-click unsubscribe. Honour every unsubscribe in all later product email;
the privacy page discloses occasional product emails.

**The email** (Resend draft "Relaunch, October 2026"):
- **Audience:** segment `relaunch-2026-10`, the 320 current accounts still
  subscribed.
- **Sender:** same From and Reply-To as March.
- **Subject:** "I relaunched Chessplain too early. It works now."
- **Content:** it owns the March misfire instead of promising "rebuilt and
  ready" a second time. One CTA to review a game.
- **Measurement:** UTM-tagged links (`utm_campaign=relaunch-2026-10`); Resend
  open and click tracking are off on the sending domain.

Measure from PostHog and Resend:
- **Visits and reviews:** from `relaunch-2026-10`. Useful if more than 5% of
  recipients visit and more than half of those complete a review.
- **Unsubscribes:** keep under 0.5%.
- **Bounces:** keep under 2%.
- **Replies:** read every one; they are the best signal this list gives.

No follow-up email: this list has already had two relaunch emails.

Risk accepted by the owner: under PECR, marketing email needs consent or the
soft opt-in. The soft opt-in requires that an opt-out was offered when the
address was collected
([ICO](https://ico.org.uk/for-organisations/direct-marketing-and-privacy-and-electronic-communications/guide-to-pecr/electronic-and-telephone-marketing/)),
and nothing shows the v2 sign-up offered one. An honest email with a working
unsubscribe keeps that exposure small; repeated promotion without consent
would not.

5 Resend contacts no longer have an account. They were left out; if those
accounts were deleted on request, delete the contacts too.

## Go-to-market: public launch

Channels in order of expected return for a solo founder:
1. The relaunch email.
2. Value-first answers in r/chessbeginners, r/chess and chess Discords. Follow
   each community's self-promotion rules and ask moderators first.
3. Small creators (1k–50k followers) with promotion codes that are
   customer-restricted and time-limited.
4. SEO guides, one genuinely useful guide per search intent (see UX and SEO).

Product Hunt and Show HN come last; they are not where chess players are.

Launch-month health checks, reviewed weekly:

| Metric | Healthy | Act if |
|---|---|---|
| Usable completion (report completes without fallback text) | ≥ 95% | < 90%: pause promotion, fix the pipeline |
| Factual complaints per report | < 5% | > 10%: pause promotion, rerun the benchmark on the failing positions |
| D7 return of activated players | ≥ 25% | < 20% after 50 reports: fix the product before buying attention |
| Free → paid | first 3 real payers in the month | none after 200 activated players: revisit packaging |

Lichess username import: add it if more than 20% of activated players come
from Lichess or PGN paste causes visible friction. PGN paste already works.

## Architecture

The design is boring and right for launch. A Fastify API and an in-process
worker run on one VPS, with a Postgres table as the queue (compare-and-swap
claims, stale-lease recovery) and SSE progress. The web app is Next.js on
Cloudflare Workers; Supabase handles auth and Stripe handles billing.

1. **Capacity.** The worker ran one game at a time: ≈ 75–150 reports an hour
   on the old timings. Since 2026-09-30, `WORKER_CONCURRENCY` job loops
   (default 2) share the 4-engine Stockfish pool. Measured: a new game takes
   ~20 s, about half of it depth-20 verification, so ≈ 360 new reports an
   hour (estimate). Raise it with cores if the queue backs up.
2. **Observability.** Each report logs per-stage timing and cache hit rate.
   UptimeRobot watches the API health endpoint and the site (owner-configured);
   there is no alert yet on queue age, LLM credit or webhook failures.
3. **Single host.** One VPS is one point of failure. The host config
   (systemd, Caddy, firewall, Stockfish binary) lives only on the box and in
   `ENGINE_DEPLOYMENT.md`.
4. **Quota lock** is in-process, which is fine for one API process (see
   `ENGINE_DEPLOYMENT.md`).

Security review: no critical findings. Fixed and deployed:

- open redirect through the sign-in `next` parameter
- free-quota race (3 parallel submits all got through; now the third gets a 402)
- unbounded SSE connections
- the public share endpoint returning internal ids
- claims of other people's anonymous reports
- unvalidated `hero_variant`
- no rate limit on the Chess.com listing route
- stale CORS origins
- raw Stripe errors returned to clients
- unbounded PGN player names reaching prompts
- the engine listening on all interfaces

Git history holds no committed secrets (scanned 2026-09-30 for Stripe,
OpenRouter, Resend and Supabase key patterns).

Remaining: free-tier farming through new accounts (accepted for now) and no
enforced CSP.

## Legal, tax and compliance

- **Tax: decided and live.** Checkout uses
  [Stripe Managed Payments](https://docs.stripe.com/payments/managed-payments/how-it-works)
  (since 2026-09-30).
  - Onelink, Stripe's merchant-of-record service, is the seller of record. It
    calculates, collects and remits VAT, GST and sales tax, so no OSS
    registration is needed for EU consumers.
  - Buyers see Onelink at checkout and on receipts, and
    `LINK.COM* CHESSPLAIN PREMIUM` on statements. They can manage
    subscriptions at link.com or through the Manage subscription button.
  - **Respond to Onelink support queries within 48 hours**, or Stripe may
    refund without your approval. Stripe can also refund within 60 days in
    some cases.
- **Consumer law.** UK consumers have a 14-day right to cancel online services
  ([CCR 2013](https://www.legislation.gov.uk/uksi/2013/3134/part/3)). The
  terms' full refund within 14 days of any charge covers it. Checkout shows the
  total, including tax, before payment. The subscription rules in the DMCC Act
  (renewal reminders, easy exit) are expected from January 2027; build them
  before then.
- **Data protection.**
  - The privacy page lists every processor, states that data is kept until a
    deletion request, and discloses product emails.
  - Minimum age 13 (owner decision); under-18s need a parent's permission to
    subscribe.
  - Deferred by the owner: a retention policy and deletion routine, and the
    controller's legal name and postal address. Add both before paid
    advertising.
  - The ICO data protection fee (tier 1: £52 a year, £47 by direct debit) is
    deferred by the owner until there is revenue. The fee does not depend on
    revenue: it applies to anyone processing personal data digitally unless
    exempt, and non-payment risks a £400 fixed penalty (up to £4,350)
    ([ICO](https://ico.org.uk/for-organisations/data-protection-fee/data-protection-fee/penalties/)).
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

Fixed and deployed:
- Google sign-in, and recovery copy for cancelled and expired sign-in links.
- The quota-exhausted path returns the player to the form after sign-in.
- Pricing sends players to the shared sign-in page.
- The 404 page's sample link was dead.
- The error page and the empty report overclaimed.
- Reports carry a fallibility note, and shared pages disclose that anyone with
  the link can see player names.
- A cancelled native share no longer copies the link.
- The favicon used the retired sage palette.

Still open:
- **Google's sign-in screen says "continue to jgtxprfulkbtzkcvinph.supabase.co"**,
  not Chessplain. A Supabase custom domain (e.g. `auth.getchessplain.com`,
  paid add-on) fixes it; deferred by the owner while no paid advertising is
  planned. Not a regression: the 324 existing Google accounts signed up
  through the same screen.
- Report-specific help on engine uncertainty.
- Guidance while analysis is stalled.
- Announcing network drops.

SEO, fixed and deployed:
- Client routes had inherited the homepage's title, description and canonical.
- User reports are noindex, with crawl access kept so the tag is seen.
- Added JSON-LD, `llms.txt` and a cleaner sitemap; design prototypes are no
  longer publicly served.
- HTTP→HTTPS and www→apex are 301 redirects (Cloudflare, 2026-09-30).

Still open:
- Core Web Vitals, measured after deploy (the PageSpeed API quota ran out
  during the audit).
- Content: one genuinely useful guide per intent (chess game review, why did I
  lose, explain chess mistakes, Chess.com game review alternative), each linked
  to the sample and the form. No thin keyword pages.

## Material risks

- **Explanations can be wrong.** Validation checks form, not causal claims.
  Benchmark rerun on the current prompt (2026-09-30): 49/49 valid and 1
  phantom-piece output in 49, within noise of the previous run.
- **Public links.** Reports and share links are readable by anyone with the
  URL and include opponent names. That is disclosed, but it is not private.
- **One host, no alerts** — see Architecture.
- **Credential expiry.** The OpenRouter key expires 2026-12-25.
