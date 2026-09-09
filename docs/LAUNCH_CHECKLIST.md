# Launch checklist

Ordered by dependency. Each step has a command or observation that proves it
worked — do not advance on assumption. Everything above the line labelled
BLOCKING must be true before the site is advertised anywhere.

Last verified against the repo at commit `048d1bd`, 2026-09-09.

---

## 0. What is already true (verified locally, no action needed)

| Claim | Evidence |
| --- | --- |
| Engine analyses real games correctly | `pnpm --filter @chessplain/engine verify:20` → 20/20, p50 13.89s, 0 sample fallbacks (re-run after the summary prompt changes) |
| 56 unit tests pass | `pnpm test` (14 files) |
| Typecheck covers src, tests and scripts | `pnpm typecheck` |
| Both apps build | `pnpm build` |
| Migrations create the schema from empty, and are re-runnable | all 9 applied twice to a throwaway Postgres 18.4; column set matches production exactly; signup trigger creates a profile |
| API rejects malformed and abusive input | `node apps/engine/scripts/verify-deployment.mjs <url>` → 24/24 |
| Layout holds 320–1440px on 3 pages | `pnpm --filter @chessplain/web test:viewport <url>` → 15/15 clean |
| Share cards render | `/opengraph-image` and `/r/<id>/opengraph-image` return 1200×630 PNGs from a production build |
| CI passes with placeholder env | web build verified with `.env.local` removed and only the workflow's placeholders set |
| Crawlers see the right thing | `/robots.txt` allows the site but disallows `/report/` and `/auth/`; `/sitemap.xml` lists the 5 public pages |
| Broken and truncated links land somewhere useful | `/anything-wrong` returns 404 with a real page offering a sample and a submit link |
| A client crash is recoverable | `app/error.tsx` boundary with a retry button, and the failure is reported to analytics |

---

## BLOCKING — the site is currently dark and cannot take money

### 1. Re-enable the Vercel deployment

`https://getchessplain.com` returns `402 Payment Required` with
`x-vercel-error: DEPLOYMENT_DISABLED`. This is a billing/spend state on the
Vercel account, not a code fault. Nothing else on this list matters while the
front door is closed.

**Verify:** `curl -o /dev/null -w '%{http_code}\n' https://getchessplain.com` → `200`

### 2. Apply the two new migrations to production

```bash
supabase link --project-ref <your-project-ref>
supabase db push
```

- `20260831000000_baseline_schema.sql` — no-op on production (CREATE TABLE IF NOT EXISTS only); it exists so a fresh project can be built.
- `20260831000006_add_missing_columns.sql` — no-op if the columns exist.
- `20260831000007_repair_analysis_errors.sql` — **this one changes production.** It adds `analysis_errors.analysis_id` and relaxes the v2 CHECK constraints. Until it runs, every error the engine tries to record is silently rejected; the table held 0 rows on 2026-09-09.
- `20260831000008_profile_on_signup.sql` — installs the `on_auth_user_created` trigger and backfills any auth user without a profiles row. Production already has 324 profiles from a v2-era trigger that was never in source control, so this is close to a no-op there — but without it a fresh project takes payments and upgrades nobody, because billing keys off `profiles.id`.

All nine migrations were applied twice in a row to a throwaway Postgres 18.4:
both passes succeeded and data survived, so re-running against a production
database that already has migrations 1–5 is safe.

**Verify:** after deploying the engine, force one failure (submit a
Chess.com username that does not exist) and confirm a row appears:

```sql
select stage, source, severity, created_at from analysis_errors order by created_at desc limit 5;
```

### 3. Deploy the current engine to the VPS

Production is running code from before `d8a3a65`. That build has four defects
this repo has since fixed:

- reports for players who chose **Black** analysed White's moves instead
- a moment could be reported whose "best move" was the move played
- the summary told winners they had lost
- `/api/billing/checkout` was reachable **without authentication** and trusted a client-supplied user id

**Verify:** `node apps/engine/scripts/verify-deployment.mjs https://api.getchessplain.com`
→ 24/24, in particular `checkout requires authentication` and
`checkout does not reach Stripe unauthenticated`.

### 4. Fix the Stripe mode mismatch

Production currently pairs a **test-mode secret key** with **live-mode price
IDs**, so checkout returns 500 for every visitor:

```
No such price: 'price_1SOs7y…'; a similar object exists in live mode,
but a test mode key was used to make this request.
```

Set on the VPS:

- `STRIPE_SECRET_KEY` → the `sk_live_…` key
- `STRIPE_WEBHOOK_SECRET` → the **live-mode** signing secret (test-mode secrets fail signature verification silently, which means paid users never get upgraded)

Register a live-mode webhook at `https://api.getchessplain.com/api/billing/webhook`
for `checkout.session.completed`, `customer.subscription.updated`,
`customer.subscription.deleted`.

**Verify:** the deployment script's `webhook secret is configured` and
`webhook rejects an unsigned payload` both pass, then complete step 5.

### 5. Buy a subscription with a real card, once

The webhook is the only thing that converts a payment into access. Nothing
short of a real transaction proves it.

1. Sign in, go to `/pricing`, subscribe.
2. `select subscription_tier, stripe_customer_id from profiles where email = '<you>';` → `premium`
3. Submit a 3rd report inside 7 days → must **not** be refused.
4. Cancel through the customer portal → tier returns to `free`.

---

## Engine environment (VPS `/etc/chessplain/engine.env`)

Required — the process refuses to start without these:

```
SUPABASE_URL=https://<project-ref>.supabase.co
SUPABASE_ANON_KEY=<anon key>
SUPABASE_SERVICE_ROLE_KEY=<service role key>
LLM_API_KEY=<crof.ai key>
```

Required for billing to function (no defaults any more — a missing price ID
becomes an empty string and checkout fails):

```
STRIPE_SECRET_KEY=sk_live_…
STRIPE_WEBHOOK_SECRET=whsec_…
STRIPE_PRICE_MONTHLY=price_1SOs7yFtgmZSE6kx0wJ3wY3u
STRIPE_PRICE_YEARLY=price_1SOs7yFtgmZSE6kxI9RoSTXR
```

Operational:

```
PORT=8080
NODE_ENV=production          # quota is only enforced when this is 'production'
WEB_ORIGIN=https://getchessplain.com
ENGINE_PATH=/usr/local/bin/stockfish18_clang
TRUST_PROXY=loopback         # only if nginx/Caddy terminates TLS on this host
ENGINE_POOL_SIZE=4           # pool x threads must fit the usable cores
ENGINE_HASH_MB=512           # MiB per Stockfish process
ENGINE_THREADS=1
STALE_LEASE_MINUTES=15       # must exceed worst-case single-game analysis time
POSTHOG_KEY=<optional; unset = no telemetry, never a silent default>
```

`WORKER_ENABLED` must stay unset (or `true`) in production. Set it to `false`
only when running the engine on a laptop — there is no separate staging
database, so a local worker competes with the deployed one for real jobs.

## Web environment (Vercel)

```
NEXT_PUBLIC_API_URL=https://api.getchessplain.com
NEXT_PUBLIC_SUPABASE_URL=https://<project-ref>.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=<anon key>
NEXT_PUBLIC_SITE_URL=https://getchessplain.com
NEXT_PUBLIC_POSTHOG_KEY=<optional>
NEXT_PUBLIC_POSTHOG_HOST=https://eu.i.posthog.com
```

`NEXT_PUBLIC_*` values are inlined at build time, so changing one requires a
redeploy, not a restart. `NEXT_PUBLIC_SITE_URL` only affects absolute share-card
URLs.

---

## Before posting the first link

- [ ] `curl -sI https://getchessplain.com | head -1` → `200`
- [ ] Paste `https://getchessplain.com` into X's post composer and confirm a card with an image appears. Also check a report link (`/r/<shareId>`) — it should show that report's own headline.
- [ ] Run one game through the live site on a phone, on cellular (not Wi-Fi), end to end.
- [ ] Open a shared report link in the Instagram or TikTok in-app browser — that is where most of the traffic will land.
- [ ] `node apps/engine/scripts/verify-deployment.mjs https://api.getchessplain.com` → READY
- [ ] Rotate the Supabase service-role key if it has ever been pasted into a chat, issue or screenshot, and update the VPS.
- [ ] **Create the `support@getchessplain.com` mailbox** (or set `NEXT_PUBLIC_SUPPORT_EMAIL` to one that exists). The privacy page promises deletion on request and the terms page promises 14-day refunds — both now link to this address, and Stripe expects a working contact route.

## Known limits — accurate expectations, not bugs

- **Free quota is 2 reports per 7 days, counted by IP for anonymous visitors.** Mobile users share carrier-grade NAT addresses, so a first-time visitor can occasionally be told the network's allowance is used up. The message leads with signing in, which moves them onto a per-account allowance. If this proves common in practice, the next step is requiring an email code before the second anonymous report.
- **Chess variants are not supported.** Chess960 and friends are rejected by name at submission, and Chess.com imports skip back to the most recent standard game.
- **A steadily played game can produce a report with no moments.** That is deliberate: a moment needs a 1.5-pawn swing, or 0.75 for the quiet-drift fallback. The report says so plainly instead of inventing a lesson. Two of the 20 games in the acceptance run came out this way.
- **One VPS, one worker process.** Job claims are compare-and-swap safe and stale leases are reclaimed after `STALE_LEASE_MINUTES`, so a second replica is safe to add when CPU becomes the limit.
