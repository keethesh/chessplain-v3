# Launch checklist

**Status: NOT ready to advertise.** The OpenRouter key was replaced on
2026-09-26 after the old one was revoked (`401 User not found`); a real report
then completed with 3 moments and 0 fallback phrases. The production API is
deployed and live checkout creation works. The frontend runs on Cloudflare
Workers and both custom domains are cut over. Passwordless sign-in works end to
end for non-team addresses since 2026-09-24. A real subscription lifecycle test,
an inbound support-mail test and credential rotation remain (sections 2 and 4).

The current engine deployment was verified on 2026-09-26:
engine commit `48a156d`, prompt `2026-09-24.1`, `openai/gpt-6-luna` through
OpenRouter. Earlier rows retain dated evidence where it is still useful; do
not treat old commit IDs or old provider settings below as current state.
Do not confuse the API verifier's `READY` output with launch approval: it does
not test the website, payment completion, premium access, or cancellation.

## Current evidence

| Area | Evidence | Scope / remaining gap |
|---|---|---|
| Repository | Typecheck, 78/78 tests in 17 files, web production build passed (2026-09-26) | Current local/VPS verification; not proof of every production flow |
| GitHub CI | CI green on `main` through `96d4dfb` (2026-09-26) | Rerun after further changes |
| Engine deployment | `london-ampere`, `/home/ubuntu/chessplain-v3`, systemd `chessplain-engine`, deployed engine commit `48a156d`, active | VPS tests 78/78. The username path lists the 10 most recent games and reviews the chosen one (verified live 2026-09-26, picking a loss created a report). Unknown usernames are rejected at submit (400). A signed-in resubmit of the same game returns the existing report (200, no quota), or re-queues it if it failed. Empty (0-moment) reports don't count against quota |
| API smoke check | `node apps/engine/scripts/verify-deployment.mjs https://api.getchessplain.com`: 25 passed, 0 failed, 0 warnings | Input rejection, authentication boundaries, health and headers; no paid checkout completion |
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
| Live Checkout | Authenticated month/year sessions created at $9.99/$99.99; unpaid sessions expired | No card charged; paid entitlement still needs a real card |
| Webhook signatures | Signed, deliberately unhandled probe returned 200; tampered signature returned 400 | Proves signature configuration, not paid entitlement updates |
| Portal configuration | Live default configuration active; cancellation enabled at period end | Customer portal journey and cancellation webhook still need a real subscription test |
| Webhook routing | Current engine endpoint enabled; obsolete web endpoint disabled, not deleted | Verify delivery on a paid checkout |
| HTTPS | Caddy validates and reloads; API sends `Strict-Transport-Security: max-age=31536000` | Scoped to API host, no `includeSubDomains` |
| Website (Cloudflare) | Live on `https://chessplain-web.oxide-website.workers.dev`; `getchessplain.com` and `www.getchessplain.com` verified HTTP 200 on 2026-09-23 | Domain cutover done |
| Quota | **ENFORCED** and verified: free account `201, 201, 402`; premium never blocked | Was unbounded until 2026-09-17 |
| Client IP | `TRUST_PROXY=127.0.0.1,::1`; loopback is trusted, arbitrary forwarded addresses are not | Reverify if the proxy topology changes |
| Analytics (PostHog, EU) | Production page sends events (`POST eu.i.posthog.com/e/` → 200, 2026-09-26). Session replay, surveys, heatmaps and dead-click capture are disabled in `apps/web/lib/posthog.ts`; Do Not Track respected; opt-out toggle on `/privacy` persists across reloads | Relies on the UK PECR statistical-purposes exemption (DUAA 2025, in force 2026-02-05): stats only, clear information, simple opt-out, no banner. Re-enabling replay or surveys needs prior consent. Not legal advice |

Earlier same-day acceptance evidence: real Stockfish/LLM gate 20/20, p50 13.89s;
local viewport audit 30/30 page/width combinations; site and sample share images
rendered as 1200×630 PNGs. These are recorded local results, not fresh checks of the
blocked production website or a load test. Rerun the relevant gates after changes.

## 1. Cloudflare Custom Domain Cutover (`getchessplain.com`) — DONE

The frontend runs on **Cloudflare Workers** using
`@opennextjs/cloudflare`, and the custom domain cutover is complete:

- `https://getchessplain.com` and `https://www.getchessplain.com` both serve
  the worker directly and return HTTP 200 (reverified 2026-09-23).
- Live worker URL (still reachable directly): `https://chessplain-web.oxide-website.workers.dev`
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
