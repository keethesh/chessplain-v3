# Launch checklist

**Status: NOT ready to advertise.** The production API is deployed and live
checkout creation works. The frontend has been migrated to Cloudflare Workers (replaces Vercel)
and is live on workers.dev; DNS cutover to `getchessplain.com` and a real subscription lifecycle remain.

Verified on 2026-09-09 against engine commit `d01c697`. Documentation-only commits
may be newer. Do not confuse the API verifier's `READY` output with launch approval:
it does not test the website, payment completion, premium access, or cancellation.

## Current evidence

| Area | Evidence | Scope / remaining gap |
|---|---|---|
| Repository | Typecheck, 56/56 tests in 14 files, both production builds passed | Current local verification; not proof of every production flow |
| GitHub CI | [Run 34393964367](https://github.com/keethesh/chessplain-v3/actions/runs/34393964367) succeeded at `d01c697` | Earlier run at `0163972` failed because tests depended on a local `.env`; fixed |
| Engine deployment | `london-ampere`, `/home/ubuntu/chessplain-v3`, systemd `chessplain-engine`, commit `d01c697`, active | VPS tests also passed 56/56 without a local `.env` |
| API smoke check | `node apps/engine/scripts/verify-deployment.mjs https://api.getchessplain.com`: 25 passed, 0 failed, 0 warnings | Input rejection, authentication boundaries, health and headers; no paid checkout completion |
| Black-side production report | `3067cfdc-ffa4-4947-af48-37bdfd471cc5` completed; all selected moments have Black perspective and even plies | Verifies the deployed perspective fix for this game, not universal narrative accuracy |
| Database | `analysis_errors.analysis_id` exists; signup trigger installed once; no auth users without profiles; migrations 7 and 8 recorded | Production retains 71 older migration-history entries absent from this repo; see migration warning below |
| LLM provider | Production switched to `deepseek/deepseek-v4.1-flash` via local CommandCode proxy (`http://127.0.0.1:3050/v1`) using user CommandCode API key | Proxy automatically maps `reasoning_effort: 'none'` to `'low'` and adds reasoning headroom so deepseek-v4.1-flash generates full structured coaching without mid-thought truncation |
| Analysis works end-to-end | Morphy Opera Game submitted to production: `completed` in ~50s, 1 moment, **0 fallback phrases**, outstanding human-grade analysis (`457ae85a-d094-4b45-b05a-7e649a9fed84`) | Headline: *"You didn't lose this in the endgame. There wasn't one."* |
| Error telemetry | Migration 9 (`analysis_errors_stage_check` now accepts `explaining_moment`, `explaining_summary`, `llm_credits_exhausted`); insert of all four v3 stages verified, then rolled back | **Why the outage was invisible:** migration 7 fixed `source`/`severity` but missed `stage`, so every LLM failure was rejected (23514) and only reached journald |
| Silent-failure gap | **OPEN.** A total LLM outage still yields a `completed` report full of generic fallback prose rather than a visible failure | Users saw "analysis doesn't work" as fake content, not an error |
| LLM request shape | The engine hardcodes `reasoning_effort:'none'`; measured on the VPS as load-bearing — without it `deepseek-v4-flash` spent its whole 500-token budget on reasoning and returned empty content | Any future model must be checked with its current `max_tokens` before switching |
| Stripe live configuration | Existing Vercel live secret verified with Stripe and securely installed on VPS; both configured USD prices active; charges enabled | No secret values stored in this document or printed during transfer |
| Live Checkout | Authenticated month/year sessions created at $9.99/$99.99, subscription mode, correct owner; duplicate calls returned the same session | No card charged; both unpaid sessions expired; temporary auth user/profile deleted |
| Webhook signatures | Signed, deliberately unhandled probe returned 200; tampered signature returned 400 | Proves signature configuration, not Stripe delivery or paid entitlement updates |
| Webhook routing | New engine endpoint enabled; obsolete web endpoint disabled, not deleted | New: `we_1UDrkeFtgmZSE6kxl5rhwS0F`; old: `we_1SOsFmFtgmZSE6kx0QBpARJx` |
| Portal configuration | Live default configuration active; cancellation enabled at period end | Customer portal journey and cancellation webhook still need a real subscription test |
| HTTPS | Caddy validates and reloads; API sends `Strict-Transport-Security: max-age=31536000` | Scoped to API host, no `includeSubDomains` |
| Website (Cloudflare) | Live on `https://chessplain-web.oxide-website.workers.dev`; 11/11 routes verified HTTP 200 | Cutover `getchessplain.com` in Cloudflare dashboard |
| Quota | **ENFORCED** and verified: free account `201, 201, 402`; premium never blocked (see section 3) | Was unbounded until 2026-09-17 |
| Client IP | `TRUST_PROXY` was unset, so every request on earth reported `127.0.0.1`, making the anonymous quota and the rate limiter global. Now `127.0.0.1,::1`; a real submission records `77.98.146.19` | Trust only loopback; never `true` |

Earlier same-day acceptance evidence: real Stockfish/LLM gate 20/20, p50 13.89s;
local viewport audit 30/30 page/width combinations; site and sample share images
rendered as 1200×630 PNGs. These are recorded local results, not fresh checks of the
blocked production website or a load test. Rerun the relevant gates after changes.

## 1. Cloudflare Custom Domain Cutover (`getchessplain.com`)

The frontend has been completely moved from Vercel to **Cloudflare Workers** using
`@opennextjs/cloudflare`. It is live and verified on Cloudflare's global edge network:

- Live URL: `https://chessplain-web.oxide-website.workers.dev`
- 11/11 routes returning HTTP 200 (including dynamic `/r/[shareId]` and dynamic OG images)
- Unlimited static asset bandwidth; 100,000 free edge requests/day; zero Vercel CPU limits

### Cutover steps in Cloudflare Dashboard:

Because `getchessplain.com` is already an active zone in this Cloudflare account,
switch the domain from the old Vercel IP to the Worker:

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
## 2. Finish the live money path — OWNER CARD REQUIRED

The VPS now has a working live key and its own live webhook signing secret.
There is no need to paste another key into a chat. The active endpoint is:

```text
https://api.getchessplain.com/api/billing/webhook
```

Subscribed events: `checkout.session.completed`,
`customer.subscription.updated`, `customer.subscription.deleted`.
The obsolete `/api/stripe/webhook` endpoint on the web host is disabled to stop
Stripe retrying deliveries to a retired route.

Before advertising, using a consenting owner's account and payment method:

1. Sign in through the deployed site and complete one real subscription checkout.
2. Confirm Stripe delivered the event successfully and the corresponding profile
   has `subscription_tier=premium` plus matching Stripe customer/subscription IDs.
3. Confirm another checkout is rejected with 409 rather than creating a duplicate.
4. Open **Manage subscription** and verify the portal loads for that customer.
5. Cancel through the portal. At-period-end cancellation must retain premium until
   the period ends; verify eventual cancellation/deletion downgrades the profile.
6. If a refund is desired, explicitly authorize it and perform it through Stripe.

No real payment, refund, or customer cancellation has been performed by the
verification steps above. Synthetic signature tests are not a substitute for this
sequence. Do not claim the paid lifecycle is verified until these observations exist.

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

- Create/verify the monitored support mailbox. The app defaults to
  `support@getchessplain.com`; showing that address does not prove it exists.
  Privacy/deletion and refund requests must actually reach someone.
- Rotate the Supabase service-role and LLM credentials previously pasted into the
  conversation. Coordinate replacements across the VPS and local tooling before
  revocation; never print replacement secrets or commit them.
- Live Stripe credentials transferred in this session were not printed. Privileged
  keys must remain server-side. Do not indiscriminately rotate unrelated keys.

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

Only advertise after the website, real paid lifecycle, quota, support and
credential gates above are resolved. The launch goal remains open until then.

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
