# Launch checklist

**Status (2026-09-30): ready for a public launch (owner decision).** The core
loop works in production: submission → report → share, sign-in (Google or
email link), and checkout through Stripe Managed Payments with tax-inclusive
prices. The audit's blocking gates are closed: fixes deployed, the unlimited
promotion code archived, VPS ports closed and host patched, HTTPS/www
redirects on, premium reconciled, two games analysed at once. Open owner
items are in section 0; [`PRODUCT_REVIEW.md`](PRODUCT_REVIEW.md) holds the
reasoning.

Deployed state verified 2026-10-09:
- Engine commit `3cc9125` (adds `GET /api/me` and the failed-retry rule), prompt `2026-09-24.1`,
  `openai/gpt-6-luna` through OpenRouter (key: $10 limit, expires 2026-12-25).
  The OpenRouter **account** held only $3.07 of credit on 2026-09-30, and that
  balance, not the key limit, is what runs out first.
- Web Worker version `e413bb6f` (signed-in home, `/account`, plan-aware pricing,
  Opera Game sample, out-of-reviews state on the game list).

Earlier rows keep dated evidence where it is still useful; don't treat old
commit IDs or provider settings below as current state. The API verifier's
`READY` is not launch approval: it doesn't test the website, payment
completion, premium access, or cancellation.

## Current evidence

| Area | Evidence | Scope / remaining gap |
|---|---|---|
| Repository | Typecheck, 92/92 tests in 19 files, engine, web and Worker builds passed; viewport audit clean signed out (30 combinations) and signed in (`AUDIT_INIT=apps/web/test/signed-in.js`, `/`, `/account`, `/pricing`) (2026-10-08) | — |
| GitHub CI | Green on `main` at `3cc9125` (2026-10-09) | Rerun after further changes |
| Engine deployment | `london-ampere`, `/home/ubuntu/chessplain-v3`, systemd `chessplain-engine`, commit `3cc9125`, active; VPS test run 92/92, smoke check 25/25 (2026-10-09). Listens on `127.0.0.1:8080` only (Caddy proxies to it); 2 job loops share 4 engines. Two owner reports re-queued at once completed in 6.1 s and 7.0 s (warm cache). A new game submitted through the live API as the test account: listing 200, submit 201, progress stream live, completed in 19.8 s with 4 moments, 0 fallback phrases, `model` and `prompt_version` recorded (sweep 0.7 s, verify 10.3 s, explain 4.1 s, summary 4.6 s; cache 13%) | The username path lists the 10 most recent games. Unknown usernames are rejected at submit (400). A signed-in resubmit of the same game returns the existing report (200, no quota), or re-queues it if it failed: a failure under 7 days old is retried free and keeps its date, an older one is quota-checked and gets a fresh date. Empty (0-moment) reports don't count against quota. About 360 new reports/hour at ~20 s each with 2 loops (estimate) |
| Website deployment | Worker version `e413bb6f` (2026-10-09; signed-in home, `/account`, plan-aware pricing). Security work from Worker `11c40c11` (2026-09-30) still applies: per-route titles and canonicals, security headers (HSTS with `includeSubDomains`, nosniff, Referrer-Policy, Permissions-Policy, `X-Frame-Options: DENY`), no `x-powered-by`, Google sign-in reaches `accounts.google.com` via the Supabase callback, prototypes return 404, the workers.dev mirror returns 404 | Deploy with `pnpm --filter @chessplain/web build:worker && pnpm --filter @chessplain/web deploy:worker`; "No targets deployed" is expected because the custom domains are attached in the Cloudflare dashboard |
| Production usage | 28 analyses before launch (26 completed, 2 failed), 7 anonymous IPs and 2 signed-in submitters: internal testing only (2026-09-30) | No real-user evidence yet for completion rate, latency or retention |
| Legacy accounts | 326 auth users from the previous version: 324 Google, 2 email; 321 real, confirmed accounts. All 321 were already Resend contacts from the March 2026 relaunch email ("It's your turn.", sent 6–8 March to about 229 people in three batches) | Resend segment `relaunch-2026-10` holds the 320 still subscribed (verified contact by contact, 2026-09-30). Draft broadcast "Relaunch, October 2026" is ready to send. 5 Resend contacts no longer have an account and were left out |
| API smoke check | `node apps/engine/scripts/verify-deployment.mjs https://api.getchessplain.com`: 25 passed, 0 failed, 0 warnings (2026-09-30, after the deploy and again after the reboot) | Input rejection, authentication boundaries, health and headers; no paid checkout completion |
| Analysis works end-to-end | Deployed `runAnalysisPipeline` run on the Ne3 production game completed with 1 moment and **0 fallback phrases** | Direct pipeline verification bypassed HTTP quota; OpenRouter usage increased as expected |
| Analysis quality | 49-position benchmark rerun 2026-09-30 on prompt `2026-09-24.1` with `openai/gpt-6-luna`: 49/49 valid, 1 phantom piece, within noise of the 2026-09-23 run (`apps/engine/benchmark/results/2026-09-30T12-25-48-803Z.md`) | Benchmark judge scores are directional, not a guarantee |
| Database | `analysis_errors.analysis_id` exists; signup trigger installed once; no auth users without profiles; migrations 7 and 8 recorded | Production retains 71 older migration-history entries absent from this repo; see migration warning below |
| LLM provider | **Current:** `openai/gpt-6-luna` via `https://openrouter.ai/api/v1`, `reasoning_effort: none`. Key replaced 2026-09-26: $10 limit, expires 2026-12-25; one 3-moment report cost $0.00127 | Replace before 2026-12-25 with `ssh london-ampere "chessplain-set-llm-key '<key>'"` (checks the key with OpenRouter before writing, backs up, restarts) |
| Error telemetry | Migration 9 (`analysis_errors_stage_check` accepts `explaining_moment`, `explaining_summary`, `llm_credits_exhausted`) | Reverify after future schema changes |
| Silent-failure gap | **CLOSED** in `2dfe75b` (deployed): when every moment falls back or credits are exhausted, `pipeline.ts` throws `LlmUnavailableError`; the worker retries, then marks the row failed, and quota ignores failed rows | A partial outage still publishes the explained moments with a generic summary, by design |
| Auth email | Custom SMTP via Resend (`smtp.resend.com:465`, sender `no-reply@mail.getchessplain.com`, domain verified, DKIM/SPF on `mail.` subdomain); email rate limit 100/h. Delivered to a non-team address and sign-in completed on `www.` on 2026-09-24; the signup trigger created its `profiles` row (`free`). Resend click and open tracking are off, so sign-in links are not rewritten through a tracking redirect | Before this, Supabase's built-in sender only mailed team members: real visitors could not sign in. Templates live in `supabase/templates/` and must be pasted into the dashboard after edits; the auth server keeps sending the previous template for roughly 10 minutes after a save |
| Auth redirects | Site URL `https://getchessplain.com`; allow list is exactly `http://localhost:3000/**`, `https://getchessplain.com/**`, `https://www.getchessplain.com/**` (2026-09-24; obsolete Vercel preview entries removed) | Add a preview host here before testing sign-in on it |
| Sign-in callback | `detectSessionInUrl: false` (`1915e69`, web `8316e1b9`): the client no longer exchanges `?code=` itself, so `/auth/callback` no longer shows "Let's try that link again" to a user it just signed in | Links still only complete in the requesting browser (PKCE); an email code fallback is not built |
| Stripe live configuration | Live secret installed on the VPS; checkout uses **Stripe Managed Payments** (stripe-node 22, API `2026-08-26.dahlia`). A live session created through `POST /api/billing/checkout` on 2026-09-30 returned `managed_payments.enabled: true`, $99.99, `tax_behavior: inclusive`, user id set; it was then expired | Onelink is the seller of record. Respond to Onelink support within 48 hours or Stripe may refund without approval |
| Live Checkout | **Real paid checkout 2026-09-26** (before Managed Payments): owner account, monthly plan, promo `OWNERTEST-E355AF` ($9.49 off once), charged $0.50 USD live. Profile `premium` with matching `cus_…`/`sub_…`; subscription `active`, metadata `user_id` matches. **Cancelled via portal** the same day: `cancel_at_period_end=true`, `cancel_at` 2026-10-26, `customer.subscription.updated` delivered | Downgrade happens on `customer.subscription.deleted` at 2026-10-26 20:32 UTC. On 2026-10-27, check the profile is `free`. The first real Managed Payments purchase is the remaining untested money path: check the profile turns `premium` |
| Revenue and premium | No paying customers today. Previous version: 2 customers, 5 charges, $49.95; $39.96 refunded by the owner because the service was down. Premium profiles are now only the owner's three accounts: two unpaid profiles were set to `free` on 2026-09-30 (a February ex-customer whose `customer.subscription.deleted` went to the retired endpoint, and a profile with no subscription) | — |
| Promotion codes | `CAMARA…` (100% off forever, unlimited) archived 2026-09-30; no active promotion codes. The owner's comp subscription keeps its discount | Restrict every new code to a customer, a redemption count or an expiry |
| Tax | Stripe Managed Payments calculates, collects and remits tax as merchant of record; both prices set to `tax_behavior: inclusive` (2026-09-30) | Managed Payments fee: 3.5% of the total on top of card processing |
| VPS exposure | UFW allows only 22, 80, 443 and 51820/udp (WireGuard VPN) from the internet; the 8080, 5001 and 51821 rules were removed on 2026-09-30. An outside probe finds 8080, 5001 and 51821 closed (Oracle's network security list already blocked them). 31 updates applied; rebooted into kernel `7.0.0-1012-oracle`; all 13 containers and services came back | Dockge and wg-easy publish on `0.0.0.0` through Docker, which bypasses UFW, so Oracle's security list is what keeps them private. Bind them to `127.0.0.1` or the VPN address to make that local too. systemd hardening for the engine is still open |
| Web edge | `http://` → `https://` and `www` → apex are 301 redirects that keep path and query (Cloudflare Always Use HTTPS + redirect rule "www to apex", 2026-09-30) | — |
| Monitoring | UptimeRobot checks on the API health endpoint and the site, plus calendar reminders for the key expiry and the 2026-10-27 downgrade check (set up by the owner, 2026-09-30) | No alert yet on queue age, LLM credit or Stripe webhook failures |
| Webhook signatures | Signed, deliberately unhandled probe returned 200; tampered signature returned 400 | Proves signature configuration, not paid entitlement updates |
| Portal configuration | Live default configuration active; cancellation at period end exercised by a real customer (2026-09-26); privacy and terms links set (2026-09-30). Managed Payments subscriptions can also be managed at link.com | — |
| Webhook routing | `checkout.session.completed`, `customer.subscription.created/updated`, `invoice.paid` for the test customer all show `pending_webhooks=0` (delivered) | — |
| HTTPS | Caddy validates and reloads; API sends `Strict-Transport-Security: max-age=31536000` | Scoped to API host, no `includeSubDomains` |
| Website (Cloudflare) | `getchessplain.com` and `www.getchessplain.com` are Worker custom domains for `chessplain-web`; `www` redirects to the apex | The workers.dev URL is disabled (`workers_dev: false`) |
| Quota | **ENFORCED** and verified: free account `201, 201, 402`; premium never blocked | Was unbounded until 2026-09-17 |
| Client IP | `TRUST_PROXY=127.0.0.1,::1`; loopback is trusted, arbitrary forwarded addresses are not | Reverify if the proxy topology changes |
| Analytics (PostHog, EU) | Production page sends events (`POST eu.i.posthog.com/e/` → 200, 2026-09-26). Session replay, surveys, heatmaps and dead-click capture are disabled in `apps/web/lib/posthog.ts`; Do Not Track respected; opt-out toggle on `/privacy` persists across reloads | Relies on the UK PECR statistical-purposes exemption (DUAA 2025, in force 2026-02-05): stats only, clear information, simple opt-out, no banner. Re-enabling replay or surveys needs prior consent. Not legal advice |

Earlier acceptance evidence (recorded 2026-09-09): real Stockfish/LLM gate 20/20, p50 13.89s;
local viewport audit 30/30 page/width combinations; site and sample share images
rendered as 1200×630 PNGs. These are recorded local results, not production checks
or a load test. Rerun the relevant gates after changes.

## 0. Owner items (2026-09-30)

Done 2026-09-30:
- Promotion code archived.
- Public ports closed; VPS patched and rebooted.
- Engine and web deployed and verified.
- HTTPS and www redirects on.
- Premium reconciled.
- Portal links set.
- Managed Payments with tax-inclusive prices.
- Age rule in the terms.
- Worker concurrency and stage timing.
- Benchmark rerun.
- Uptime monitoring and calendar reminders (owner).
- Relaunch email drafted in Resend (see below).

Open, before launch:

1. **OpenRouter credit:** add credit and turn on auto top-up (openrouter.ai →
   Credits → Enable auto top up; card only). Reports fail when the account
   balance hits zero, and `/healthz` stays green, so UptimeRobot won't notice.
2. **One real purchase through Managed Payments** (section 2, steps 1–5), from a
   non-premium account signed in with Google. This also covers Google sign-in
   end to end; only the redirect to Google has been verified.
3. **Supabase keys:** the legacy service-role JWT was pasted into an earlier
   chat (section 4). Create a secret key and a publishable key (Settings → API
   Keys), switch the engine and web to them, verify, then disable the legacy
   keys.
4. **Send the relaunch email:** Resend → Broadcasts → "Relaunch, October
   2026" (segment `relaunch-2026-10`, 320 contacts). Send yourself a test,
   then Send. The test shows "Hi there" because it has no contact; real sends
   use the first names (307 of 320 have one). The Resend account is on the
   free plan, which allows 3 segments.
5. **Stripe public support email:** Settings → Business → Public details
   (still unset on 2026-09-30). `support@` routing to the owner's inbox is
   verified in Cloudflare Email Routing.

Launch week:

- **Backups:** check the Supabase plan (Settings → Billing). Free projects
  have no restorable backups; Supabase recommends `supabase db dump`. A
  nightly dump to the VPS needs the database password stored as a file.
- **Known limit:** Resend's free plan sends at most 100 transactional emails a
  day. Supabase allows 100 sign-in emails an hour, so on a busy day email
  sign-in stops at Resend's cap. Google sign-in is unaffected; Resend Pro
  lifts the cap.
- **Search Console:** submit `https://getchessplain.com/sitemap.xml`.

Deferred by the owner:

- The ICO data protection fee, until there is revenue. The fee is not tied to
  revenue: it applies now; non-payment risks a £400 fixed penalty for tier 1
  (up to £4,350).
- The Supabase custom domain for the Google sign-in screen, while no paid
  advertising is planned.
- Controller name and postal address on the privacy page, and a retention and
  deletion policy: add both before any paid advertising.

## 1. Cloudflare Custom Domain Cutover (`getchessplain.com`) — DONE

The frontend runs on **Cloudflare Workers** using
`@opennextjs/cloudflare`, and the custom domain cutover is complete:

- `https://getchessplain.com` serves the worker. `www.getchessplain.com` is
  also a custom domain of the worker, but a zone redirect rule ("www to apex")
  sends it to the apex with a 301, and Always Use HTTPS redirects `http://`
  (both 2026-09-30).
- The `workers.dev` URL is disabled (`workers_dev: false` in
  `apps/web/wrangler.jsonc`, deployed 2026-09-30).
- Cloudflare's current plan provides 100,000 free edge requests/day and
  unlimited static asset bandwidth.

### How the cutover was done (for reference / redoing on a new zone)

`getchessplain.com` was already an active zone in this Cloudflare account, so
the domain was switched from the old Vercel IP to the Worker:

1. Open [Cloudflare Dashboard](https://dash.cloudflare.com)
2. Go to **Workers & Pages** -> **chessplain-web**
3. Select **Settings** -> **Domains & Routes**
4. Click **Add** -> **Custom Domain**
5. Enter `getchessplain.com` -> Click **Add Custom Domain** (if prompted about existing DNS records, select **Overwrite**)
6. Repeat for `www.getchessplain.com`
7. Once attached, verify `curl -I https://getchessplain.com` returns HTTP 200 from Cloudflare.

To deploy code updates in the future, run from the monorepo root:
```bash
pnpm --filter @chessplain/web deploy:worker
```
## 2. Finish the live money path — DONE except the 2026-10-27 downgrade check

The VPS now has a working live key and its own live webhook signing secret.
There is no need to paste another key into a chat. The active endpoint is:

```text
https://api.getchessplain.com/api/billing/webhook
```

Subscribed events: `checkout.session.completed`,
`customer.subscription.updated`, `customer.subscription.deleted`.
The obsolete `/api/stripe/webhook` endpoint on the web host is disabled to stop
Stripe retrying deliveries to a retired route.

Checkout accepts promotion codes (`allow_promotion_codes`, engine `4cbfe2f`). For a
cheap real charge, create a single-use, once-only $9.49-off code; the first monthly
invoice is then $0.50, Stripe's USD minimum. Cancelling at period end prevents a
full-price renewal.

Before advertising, using a consenting owner's account and payment method:

1. Sign in through the deployed site and complete one real subscription checkout.
2. Confirm Stripe delivered the event successfully and the corresponding profile
   has `subscription_tier=premium` plus matching Stripe customer/subscription IDs.
3. Confirm another checkout is rejected with 409 rather than creating a duplicate.
4. Open **Manage subscription** and verify the portal loads for that customer.
5. Cancel through the portal. At-period-end cancellation must retain premium until
   the period ends; verify eventual cancellation/deletion downgrades the profile.
6. If a refund is desired, explicitly authorize it and perform it through Stripe.

Steps 1–5 verified 2026-09-26 (see evidence table): real $0.50 payment, premium set
with matching IDs, second checkout 409, portal session created on
`billing.stripe.com`, at-period-end cancellation keeps premium. The final downgrade
to `free` fires on 2026-10-26; confirm it on 2026-10-27. No refund was made.

## 3. Quota — DONE and verified

`DISABLE_QUOTA=false` is set in `/etc/chessplain/engine.env`. Verified against
production on 2026-09-17:

- Free signed-in account: two submissions `201`, third `402 quota_exceeded`
  with the sign-in/premium explanation. Temp account, its analyses and its
  source rows were all deleted afterwards.
- Premium account: three submissions, none blocked — paying customers are safe.
- Anonymous visitor: keyed per real client IP, and the exhausted response
  offers `can_sign_in: true` so a first-time visitor is not dead-ended.

This required fixing `TRUST_PROXY` first. It was unset, so Fastify ignored
`X-Forwarded-For` and `request.ip` was `127.0.0.1` for every request on earth —
Caddy reaches the engine over loopback. The advertised "2 free reports" would
have been consumed by the first two anonymous reports worldwide and every other
visitor would have been blocked, while the per-IP rate limiter silently became
one shared 100/min bucket for all traffic. Production now sets
`TRUST_PROXY=127.0.0.1,::1` and a real submission records `77.98.146.19`.

Trusting only loopback is what makes this safe: clients never connect from
loopback, so client-supplied `X-Forwarded-For` is still ignored. Do not set
`TRUST_PROXY=true`. Note the per-IP abuse limiter is on the same key, so it is
also now per visitor.

## 4. Support and credential hygiene — OWNER ACTION

- `support@getchessplain.com` is forwarded to the owner's inbox by Cloudflare Email
  Routing (MX `route{1,2,3}.mx.cloudflare.net`). Send a test from an outside
  address and confirm it arrives before relying on it. Cloudflare routing is
  inbound only; replying as support@ needs "Send mail as" through Resend SMTP.
- The LLM key was replaced on 2026-09-26. The Supabase service-role key pasted
  into an earlier conversation is still live: both Supabase keys are legacy
  JWTs, so rotating one alone means rotating the JWT secret. Use the new API
  keys instead (section 0, item 3). Never print replacement secrets or commit
  them.
- Live Stripe credentials transferred in this session were not printed. Privileged
  keys must remain server-side. Do not indiscriminately rotate unrelated keys.

- Keep the test account `keethesh15+cptest@gmail.com` (free tier). It is the
  signed-in account for production verification: sessions are minted with
  `admin.generateLink` + `verifyOtp`, with no email sent.

## 5. Final deployed checks

```bash
corepack pnpm typecheck
corepack pnpm test
corepack pnpm build
node apps/engine/scripts/verify-deployment.mjs https://api.getchessplain.com
```

Use the existing viewport audit against the now-working production website, then
manually test mobile submission, streaming completion, retry/reconnect, sharing,
sign-in, checkout and portal navigation. Check the actual social preview URLs.
Automated layout checks do not establish usability in every in-app browser.

Section 0 lists what is left before launch.

## Operational notes

- No separate staging database currently exists. Local servers pointed at production
  **must set `WORKER_ENABLED=false`** or they can consume real queued jobs.
- Before deploying an engine update, ensure the target tree is clean, fetch and
  fast-forward to the reviewed commit, install with the lockfile, build and test,
  then restart. Do not use `git reset --hard` as a routine deployment command.
- Engine env backups are retained under `/etc/chessplain/` with mode 0600. The
  Caddy config was backed up before its validated HSTS change. Backups contain
  secrets where applicable and must not be copied into this repository.
- **Migration warning:** production has historical versions not represented by local
  files. A blind `supabase db push` may refuse the mismatched history. Do not erase
  history or mark unexecuted migrations applied to bypass it. Migrations 7 and 8
  were explicitly executed via `supabase db query --linked --project-ref ... -f ...`
  and verified. For future changes inspect history/schema first and reconcile
  deliberately; fresh-database bootstrap and existing production upgrades are
  distinct procedures.
