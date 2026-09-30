# Launch checklist

**Status (2026-09-30 audit): an invite-only soft launch is possible once the
"before any users" gates in section 0 are done. Not ready to advertise (hard
launch).** The core loop works in production: submission → report → share,
sign-in, a real paid checkout and a portal cancellation. What blocks users is
operational. Fixes on `main` are undeployed, including one webhook regression
caught in review before deploy. An unlimited 100%-off-forever promotion code
is live, and the engine port and two admin UIs on the VPS are public. There is
no monitoring, and tax and consumer-law setup for charging worldwide is
unresolved. Section 0 lists the gates in order;
[`PRODUCT_REVIEW.md`](PRODUCT_REVIEW.md) holds the full audit.

Deployed state verified 2026-09-30: engine commit `b00378f`, prompt
`2026-09-24.1`, `openai/gpt-6-luna` through OpenRouter (key: $10 limit, $0.002
used, expires 2026-12-25). The website serves a build older than `main` (it
lacks `61976ed`, `1d6b0cb` and the audit fixes), and `main` also carries
undeployed engine fixes. Earlier rows retain dated evidence where it is still
useful; do not treat old commit IDs or old provider settings below as current
state. Do not confuse the API verifier's `READY` output with launch approval:
it does not test the website, payment completion, premium access, or
cancellation.

## Current evidence

| Area | Evidence | Scope / remaining gap |
|---|---|---|
| Repository | Typecheck, 84/84 tests in 18 files, engine, web and Worker builds passed locally (2026-09-30) | Includes undeployed fixes; rerun CI after pushing |
| GitHub CI | CI green on `main` through `96d4dfb` (2026-09-26) | Rerun after further changes |
| Engine deployment | `london-ampere`, `/home/ubuntu/chessplain-v3`, systemd `chessplain-engine`, deployed engine commit `b00378f`, active (2026-09-30) | `main` adds: engine binds `HOST` (default 127.0.0.1; Caddy proxies to `127.0.0.1:8080`), fail-fast LLM/service-key config, per-key quota lock, SSE connection caps, `model`/`prompt_version`/`error_message` recorded per row. The username path lists the 10 most recent games (verified live 2026-09-26). Unknown usernames are rejected at submit (400). A signed-in resubmit of the same game returns the existing report (200, no quota), or re-queues it if it failed. Empty (0-moment) reports don't count against quota |
| Website deployment | `getchessplain.com` serves a build older than `main` (2026-09-30: live homepage still says "free reports", not the `1d6b0cb` copy) | Deploy with `pnpm --filter @chessplain/web build:worker && pnpm --filter @chessplain/web deploy:worker`; `workers_dev` is now `false`, so the workers.dev mirror stops after that deploy |
| Production usage | 28 analyses ever (26 completed, 2 failed), 7 anonymous IPs and 2 signed-in submitters: internal testing only (2026-09-30) | No real-user evidence yet for completion rate, latency or retention |
| Legacy accounts | 326 auth users from the previous version: 324 Google, 2 email; last sign-ins mostly Dec 2025–May 2026; 80 profiles carry a Chess.com username, 35 a Lichess one | Google sign-in restored on `/login` in `main`. Emailing them needs a lawful basis (see PRODUCT_REVIEW) |
| API smoke check | `node apps/engine/scripts/verify-deployment.mjs https://api.getchessplain.com`: 25 passed, 0 failed, 0 warnings (2026-09-30) | Input rejection, authentication boundaries, health and headers; no paid checkout completion |
| Analysis works end-to-end | Deployed `runAnalysisPipeline` run on the Ne3 production game completed with 1 moment and **0 fallback phrases** | Direct pipeline verification bypassed HTTP quota; OpenRouter usage increased as expected |
| Analysis quality | 49-position benchmark; prompt `2026-09-24.1`; current choice `openai/gpt-6-luna` | Benchmark judge scores are directional, not a guarantee |
| Database | `analysis_errors.analysis_id` exists; signup trigger installed once; no auth users without profiles; migrations 7 and 8 recorded | Production retains 71 older migration-history entries absent from this repo; see migration warning below |
| LLM provider | **Current:** `openai/gpt-6-luna` via `https://openrouter.ai/api/v1`, `reasoning_effort: none`. Key replaced 2026-09-26: $10 limit, expires 2026-12-25; one 3-moment report cost $0.00127 | Replace before 2026-12-25 with `ssh london-ampere "chessplain-set-llm-key '<key>'"` (checks the key with OpenRouter before writing, backs up, restarts) |
| Error telemetry | Migration 9 (`analysis_errors_stage_check` accepts `explaining_moment`, `explaining_summary`, `llm_credits_exhausted`) | Reverify after future schema changes |
| Silent-failure gap | **CLOSED** in `2dfe75b` (deployed): when every moment falls back or credits are exhausted, `pipeline.ts` throws `LlmUnavailableError`; the worker retries, then marks the row failed, and quota ignores failed rows | A partial outage still publishes the explained moments with a generic summary, by design |
| Auth email | Custom SMTP via Resend (`smtp.resend.com:465`, sender `no-reply@mail.getchessplain.com`, domain verified, DKIM/SPF on `mail.` subdomain); email rate limit 100/h. Delivered to a non-team address and sign-in completed on `www.` on 2026-09-24; the signup trigger created its `profiles` row (`free`). Resend click and open tracking are off, so sign-in links are not rewritten through a tracking redirect | Before this, Supabase's built-in sender only mailed team members: real visitors could not sign in. Templates live in `supabase/templates/` and must be pasted into the dashboard after edits; the auth server keeps sending the previous template for roughly 10 minutes after a save |
| Auth redirects | Site URL `https://getchessplain.com`; allow list is exactly `http://localhost:3000/**`, `https://getchessplain.com/**`, `https://www.getchessplain.com/**` (2026-09-24; obsolete Vercel preview entries removed) | Add a preview host here before testing sign-in on it |
| Sign-in callback | `detectSessionInUrl: false` (`1915e69`, web `8316e1b9`): the client no longer exchanges `?code=` itself, so `/auth/callback` no longer shows "Let's try that link again" to a user it just signed in | Links still only complete in the requesting browser (PKCE); an email code fallback is not built |
| Stripe live configuration | Existing live Stripe secret is installed on VPS; configured USD prices active | No secret values stored in this document |
| Live Checkout | **Real paid checkout 2026-09-26:** owner account, monthly plan, promo `OWNERTEST-E355AF` ($9.49 off once), charged $0.50 USD live. Profile `premium` with matching `cus_…`/`sub_…`; subscription `active`, metadata `user_id` matches. **Cancelled via portal** the same day: `cancel_at_period_end=true`, `cancel_at` 2026-10-26, `customer.subscription.updated` delivered, profile still `premium` | Downgrade happens on `customer.subscription.deleted` at 2026-10-26 20:32 UTC. On 2026-10-27, check the profile is `free`. `main` fixes a review-caught regression where a completed checkout fell through into the subscription handler and returned 500 (`test/billing-webhook.test.ts`) |
| Revenue and premium | **Zero paying customers.** Historical: two real subscribers in the previous version ($39.96 over 4 months; $9.99 once), both cancelled. Premium profiles: owner test, owner 100%-off comp, owner profile whose subscription 404s, the Feb 2026 ex-customer still `premium` (their `customer.subscription.deleted` went to the retired web endpoint and is still pending), one non-owner with no Stripe subscription | Reconcile the last two (section 0) |
| Promotion codes | **`CAMARA…` is active: 100% off, forever, unlimited redemptions, no expiry, not customer-restricted**, and checkout sets `allow_promotion_codes` | Archive it before any public traffic (section 0) |
| Tax | Stripe account GB individual, default GBP; prices USD `tax_behavior: unspecified`; Stripe Tax settings active with **no registrations**; checkout sets no `automatic_tax` | Owner decision: Merchant of Record vs registrations (PRODUCT_REVIEW) |
| VPS exposure | UFW allows `8080/tcp` (engine, plaintext), `5001/tcp` (Dockge) and `51821/tcp` (WireGuard UI) from anywhere; 31 pending upgrades and a pending reboot; service runs without systemd hardening (2026-09-30) | Section 0 |
| Web edge | `http://getchessplain.com` serves 200 without redirecting to HTTPS; `www` serves a duplicate 200; no security headers live | `main` adds HSTS, nosniff, Referrer-Policy, Permissions-Policy, X-Frame-Options and drops `x-powered-by`; redirects are Cloudflare settings |
| Monitoring | None: no uptime check or alert on the engine, queue, LLM credit or Stripe webhook failures | Section 0 |
| Webhook signatures | Signed, deliberately unhandled probe returned 200; tampered signature returned 400 | Proves signature configuration, not paid entitlement updates |
| Portal configuration | Live default configuration active; cancellation at period end exercised by a real customer (2026-09-26) | — |
| Webhook routing | `checkout.session.completed`, `customer.subscription.created/updated`, `invoice.paid` for the test customer all show `pending_webhooks=0` (delivered) | — |
| HTTPS | Caddy validates and reloads; API sends `Strict-Transport-Security: max-age=31536000` | Scoped to API host, no `includeSubDomains` |
| Website (Cloudflare) | Live on `https://chessplain-web.oxide-website.workers.dev`; `getchessplain.com` and `www.getchessplain.com` verified HTTP 200 on 2026-09-23 | Domain cutover done |
| Quota | **ENFORCED** and verified: free account `201, 201, 402`; premium never blocked | Was unbounded until 2026-09-17 |
| Client IP | `TRUST_PROXY=127.0.0.1,::1`; loopback is trusted, arbitrary forwarded addresses are not | Reverify if the proxy topology changes |
| Analytics (PostHog, EU) | Production page sends events (`POST eu.i.posthog.com/e/` → 200, 2026-09-26). Session replay, surveys, heatmaps and dead-click capture are disabled in `apps/web/lib/posthog.ts`; Do Not Track respected; opt-out toggle on `/privacy` persists across reloads | Relies on the UK PECR statistical-purposes exemption (DUAA 2025, in force 2026-02-05): stats only, clear information, simple opt-out, no banner. Re-enabling replay or surveys needs prior consent. Not legal advice |

Earlier acceptance evidence (recorded 2026-09-09): real Stockfish/LLM gate 20/20, p50 13.89s;
local viewport audit 30/30 page/width combinations; site and sample share images
rendered as 1200×630 PNGs. These are recorded local results, not production checks
or a load test. Rerun the relevant gates after changes.

## 0. Launch gates from the 2026-09-30 audit

### Before any users (invite-only soft launch)

1. **Archive promotion code `CAMARA…`** (Stripe → Product catalog → Coupons).
   The owner's comped subscription keeps its discount. Issue future codes only
   with `max_redemptions`, an expiry, or a customer restriction.
2. **Close public ports:** `ssh london-ampere 'sudo ufw delete allow 8080/tcp;
   sudo ufw delete allow 5001/tcp; sudo ufw delete allow 51821/tcp; sudo ufw
   status'`. Re-allow the admin UIs only from the VPN range if needed.
3. **Patch and reboot** the VPS (`sudo apt update && sudo apt upgrade`, then
   `sudo reboot`); confirm `systemctl is-active chessplain-engine caddy`.
4. **Deploy the engine**, then the web (engine first; the API stays backward
   compatible). Verify: verifier 25/25; one real report completes with
   `model` and `prompt_version` populated; `ss -tlnp` shows the engine on
   `127.0.0.1:8080`; `https://getchessplain.com/login` reaches Google; live
   HTML carries the security headers and the new titles.
5. **Cloudflare:** turn on Always Use HTTPS and redirect `www` to the apex.
6. **Monitoring:** an external uptime check (e.g. UptimeRobot, free) on
   `https://api.getchessplain.com/healthz` and `https://getchessplain.com/`,
   alerting by email. Calendar reminders for the OpenRouter key on 2026-11-25
   and 2026-12-18.
7. **Support and Stripe profile:** send a test to `support@getchessplain.com`
   from an outside address; set the public support email in Stripe; add the
   privacy and terms URLs to the billing portal configuration.
8. **Reconcile premium:** set the Feb 2026 ex-customer to `free` (their
   subscription is cancelled) and decide whether the non-owner premium profile
   without a subscription is an intentional grant.

### Before advertising (hard launch)

- Tax route (Merchant of Record vs Stripe Tax with registrations) and the
  consumer-law information at checkout.
- Legal identity on the privacy page, ICO data protection fee, a retention and
  deletion policy, and a minimum-age rule.
- Queue capacity (the worker runs one game at a time) and per-stage timing;
  rerun the 49-position benchmark on the current prompt.
- Pass the soft-launch gates in `PRODUCT_REVIEW.md` with real users.

## 1. Cloudflare Custom Domain Cutover (`getchessplain.com`) — DONE

The frontend runs on **Cloudflare Workers** using
`@opennextjs/cloudflare`, and the custom domain cutover is complete:

- `https://getchessplain.com` and `https://www.getchessplain.com` both serve
  the worker directly and return HTTP 200 (reverified 2026-09-23).
- Live worker URL: `https://chessplain-web.oxide-website.workers.dev`, reachable until
  the next deploy (`workers_dev: false` in `apps/web/wrangler.jsonc` removes it).
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
- Rotate the Supabase service-role and LLM credentials previously pasted into the
  conversation. Coordinate replacements across the VPS and local tooling before
  revocation; never print replacement secrets or commit them.
- Live Stripe credentials transferred in this session were not printed. Privileged
  keys must remain server-side. Do not indiscriminately rotate unrelated keys.

- Delete the sign-in test account `keethesh15+cptest@gmail.com` (Supabase ->
  Authentication -> Users). Its profile row is removed by the `ON DELETE CASCADE` on
  `profiles.id`; any analyses it owned become anonymous (`ON DELETE SET NULL`).

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

Only advertise after the section 0 gates, the paid lifecycle downgrade check,
support and credential gates above are resolved. The launch goal remains open
until then.

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
