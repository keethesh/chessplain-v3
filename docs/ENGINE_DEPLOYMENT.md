# Engine deployment on the 24GB VPS

The production engine currently runs on `london-ampere` at
`/home/ubuntu/chessplain-v3` under systemd unit `chessplain-engine`.
Production uses `openai/gpt-6-luna` through OpenRouter; the current API
credential expires 2026-10-23 and is intentionally not documented here.
This document is both the observed production topology and the repeatable
deployment/verification recipe. Resource numbers below are starting guidance,
not claims about every host.

## Process model and initial sizing

Multiple replicas are safe: jobs are claimed by compare-and-swap, and only leases older than STALE_LEASE_MINUTES are reclaimed, so a replica that restarts does not steal work another replica is actively running. The remaining limit is CPU — ENGINE_POOL_SIZE × ENGINE_THREADS per replica must fit the host's cores.

Start with:
- ENGINE_POOL_SIZE=2 on a 2-vCPU VPS; 4 if at least 4 usable CPU cores are available.
- ENGINE_THREADS=1 per Stockfish process.
- ENGINE_HASH_MB=512 per process.
- Reserve at least one CPU worth of headroom where practical for HTTP, Node, and other services.

Four workers × 512 MiB is about 2 GiB of hash memory, plus engine networks/processes, Node, OS, and filesystem cache. Hash is per process, not a global budget. 24GB does not imply all 24GB should be allocated to hash. Increasing hash cannot fix a saturated CPU or slow LLM requests.

Stockfish recommends choosing hash for the analysis workload and leaving memory for other software:
https://official-stockfish.github.io/docs/stockfish-wiki/Stockfish-FAQ.html

The queue handles games serially, while sweep/verification positions use the engine pool. If a game occupies the pipeline for 20 seconds, the theoretical serial service ceiling is 3 games/minute before overhead; this is an example, not a benchmark. Keep arrival rate comfortably below measured service rate to avoid growing waits.

## Prerequisites

Use Linux, Node 22 LTS or newer, the repository's pnpm version, and a Stockfish build compatible with the actual CPU. Check CPU flags before choosing an AVX2/BMI2 binary. Optional Syzygy tables consume disk and I/O; an empty SYZYGY_PATH disables configuring them.

From the repository root:
```sh
corepack pnpm install --frozen-lockfile
corepack pnpm --filter @chessplain/engine build
```

Use the actual installed absolute node path in the service below. Create an unprivileged chessplain user and deploy the checkout at /opt/chessplain. Install the executable at /usr/local/bin/stockfish. Confirm it responds to uci/isready as that user before starting the service.

Set /etc/chessplain/engine.env, readable only by the service user/root:
```dotenv
NODE_ENV=production
PORT=8080
WEB_ORIGIN=https://getchessplain.com
TRUST_PROXY=loopback
ENGINE_PATH=/usr/local/bin/stockfish
ENGINE_POOL_SIZE=4
ENGINE_THREADS=1
ENGINE_HASH_MB=512
SYZYGY_PATH=
DISABLE_QUOTA=false
SUPABASE_URL=<staging-or-production-project-url>
SUPABASE_SERVICE_ROLE_KEY=<server-only-key>
LLM_API_BASE=<approved-provider-base-url>
LLM_API_KEY=<provider-key>
LLM_MODEL=<verified-available-model>
STRIPE_SECRET_KEY=<matching-mode-key>
STRIPE_WEBHOOK_SECRET=<webhook-signing-secret>
STRIPE_PRICE_MONTHLY=<verified-monthly-price>
STRIPE_PRICE_YEARLY=<verified-yearly-price>
POSTHOG_KEY=<project-key>
POSTHOG_HOST=https://eu.i.posthog.com
```

Use 2 engines for a 2-vCPU host. Do not put service-role or payment secrets in NEXT_PUBLIC_* variables. Billing can be unconfigured while analysis runs; the LLM and database still need working credentials.

## systemd service

Save as /etc/systemd/system/chessplain.service after adjusting paths:
```ini
[Unit]
Description=Chessplain engine API and queue worker
After=network-online.target
Wants=network-online.target

[Service]
Type=simple
User=chessplain
Group=chessplain
WorkingDirectory=/opt/chessplain/apps/engine
EnvironmentFile=/etc/chessplain/engine.env
ExecStart=/usr/bin/node /opt/chessplain/apps/engine/dist/http/server.js
Restart=on-failure
RestartSec=5
TimeoutStopSec=35
KillMode=control-group
NoNewPrivileges=true
PrivateTmp=true
MemoryHigh=8G
MemoryMax=12G
TasksMax=128

[Install]
WantedBy=multi-user.target
```

These memory bounds are conservative starting values for the example 4 × 512 MiB configuration. Measure resident memory and adjust for the actual workload; a memory kill restarts and retries work. Deploy with stop/start, not overlapping worker instances.

## Reverse proxy

Terminate TLS at nginx/Caddy and firewall port 8080 from public access. TRUST_PROXY=loopback is correct only when the direct proxy connection is local. For another trusted proxy use its exact IP/CIDR; never blindly trust arbitrary forwarded headers.

In the existing TLS server block for api.getchessplain.com:
```nginx
location / {
    proxy_pass http://127.0.0.1:8080;
    proxy_http_version 1.1;
    proxy_set_header Host $host;
    proxy_set_header X-Real-IP $remote_addr;
    proxy_set_header X-Forwarded-For $remote_addr;
    proxy_set_header X-Forwarded-Proto $scheme;
    proxy_set_header Connection "";
    proxy_buffering off;
    proxy_cache off;
    proxy_read_timeout 180s;
}
```

The application sends heartbeat events during analysis. Disable SSE buffering. Configure valid TLS separately. If another CDN sits before nginx, configure trusted real-IP handling explicitly; otherwise all users can appear to share the proxy's quota.

## Database, auth and billing

Verify the existing schema before applying migrations. The migration history contains destructive v2 drops; do not run it blindly against a live database. Required tables include profiles, source_games, game_analyses, analysis_cache, analysis_errors. Required queue fields include attempts, locked_at and next_attempt_at.

Confirm profiles has subscription_tier, stripe_customer_id, stripe_subscription_id and an auth-user provisioning trigger. Configure Supabase auth callback allowlists for the web origin's /auth/callback, including intended query parameters. Configure SMTP and test PKCE links in the requesting browser.

Point Stripe's endpoint to /api/billing/webhook for checkout.session.completed, customer.subscription.updated, and customer.subscription.deleted. Enable the Stripe customer portal including cancellation. Verify test/live price amounts, currencies, intervals, and mode against the prices shown in the UI.

Set the web app NEXT_PUBLIC_API_URL to the API origin. The frontend must be rebuilt when public environment settings change.

## Acceptance run before launch

Use a staging database and Stripe test mode:
1. Start service and verify /healthz, process count, and journal logs. Missing Stockfish should fail startup rather than present a healthy analysis service.
2. Submit a small PGN as White, then as Black; verify displayed perspective, move legality, final summary, and quota accounting.
3. Import a completed Chess.com game, simulate a transient retry, and confirm player identity remains unchanged.
4. Disconnect/reconnect the browser during analysis; reopen completed report after more than 60 seconds. No terminal report should regress to a stalled screen.
5. Restart during analysis and verify one recovery, no lost jobs, and eventual terminal state.
6. Test provider outage/credit exhaustion, database outage, dead engine process, invalid PGN, 402 quota, 429 limits, and malformed requests.
7. Exercise sign-in → checkout → webhook → premium submission; cancellation → webhook → free submission; failed payment and duplicate checkout.
8. Benchmark cold and warm games with short and long move lists. Record queue wait, first lesson, completion p50/p95, failures, CPU, RSS and provider cost. Only set a speed promise after these measurements.

Alert on old pending jobs, repeated failures, engine availability, database failures, and LLM fallback rate. /healthz alone is a shallow process check. Before scaling past a handful of replicas, add per-worker ownership (a locked_by column) and bounded admission — a time lease cannot tell a dead worker from a paused one.

## Standing up a fresh database (staging)

`supabase/migrations/` is self-sufficient as of `20260831000000_baseline_schema.sql`:
a new Supabase project reaches the current schema with `supabase db push` (or
`supabase db reset` locally). Two constraints to respect:

- All four v3 tables have RLS enabled with **no policies**. The engine reaches
  them with `SUPABASE_SERVICE_ROLE_KEY`; the browser must never query them
  directly. If a table returns zero rows for an authenticated user, that is RLS
  working as designed — route the read through the engine, do not add a policy.
- `profiles` rows are expected to exist for every auth user. If your project has
  no trigger creating them on signup, premium detection (`server.ts:136`) reads
  a missing row and treats the user as free.
