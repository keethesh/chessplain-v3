# Chessplain

Paste a chess game, get a short readable review of the few moments that actually
decided it — not a move-by-move engine dump.

This is a pnpm monorepo:

| Package | What it is | Stack |
|---|---|---|
| `apps/web` | The site people use | Next.js 16, React 19, Tailwind |
| `apps/engine` | HTTP API + analysis worker | Fastify, Stockfish (UCI), an LLM, Supabase |
| `supabase/migrations` | The database schema | SQL, applied with the Supabase CLI |

## Where things stand

**Status (2026-09-30):** live and ready for a public launch. Open owner items:
send the relaunch email (drafted in Resend) and set Stripe's public support
email; see section 0 of the launch checklist.

**Current code:** typecheck, **84 tests across 18 files**, and production
builds of the engine, the web app and the Cloudflare Worker pass; CI is green.

**Deployed (2026-09-30):**
- Engine commit `dcbe058` (prompt `2026-09-24.1`) on the production VPS,
  listening on `127.0.0.1` behind Caddy, analysing two games at once. The
  deployment verifier passes 25/25 checks.
- Web Worker version `11c40c11`.
- Checkout runs through Stripe Managed Payments (Onelink is the seller of
  record and handles tax), with tax-inclusive prices.

**LLM:** Production uses `openai/gpt-6-luna` through OpenRouter with
`reasoning_effort: none`, chosen from a 49-position benchmark; see
[`docs/ANALYSIS_QUALITY_ROADMAP.md`](docs/ANALYSIS_QUALITY_ROADMAP.md). The
OpenRouter credential expires on 2026-12-25; replace it before then with
`ssh london-ampere "chessplain-set-llm-key '<key>'"`.

**Web:** Next.js on Cloudflare Workers at `getchessplain.com`; deploy with
`pnpm --filter @chessplain/web build:worker && pnpm --filter @chessplain/web deploy:worker`.
Sign-in is passwordless: Continue with Google, or an email link sent through
Resend from `mail.getchessplain.com`.

Start with [`docs/LAUNCH_CHECKLIST.md`](docs/LAUNCH_CHECKLIST.md) for current
production evidence and the remaining steps. It distinguishes completed checks
from account-owner actions; do not use old implementation plans as launch status.

## Run it locally

Prerequisites: Node 22, pnpm 10, a Stockfish binary, a Supabase project, and an
LLM API key.

```bash
pnpm install
cp .env.example apps/engine/.env     # fill in: SUPABASE_*, LLM_API_KEY, ENGINE_PATH
cp .env.example apps/web/.env.local  # fill in: NEXT_PUBLIC_*

pnpm --filter @chessplain/engine dev   # API + worker on :8080
pnpm --filter @chessplain/web dev      # site on :3000
```

If the local engine uses the production Supabase project, set
`WORKER_ENABLED=false` in `apps/engine/.env` **before starting it**. Otherwise it
will compete with the deployed worker for real jobs. Use a separate database
when testing queue processing locally.

There are no default credentials on purpose — missing config fails at startup
rather than silently connecting to production.

## Commands

| Command | What it does |
|---|---|
| `pnpm typecheck` | `tsc --noEmit` in both packages |
| `pnpm test` | Engine unit tests (Vitest) |
| `pnpm build` | Production build of both packages |
| `pnpm --filter @chessplain/engine verify:20` | **The live acceptance gate.** Costs real LLM tokens. |
| `supabase db push` | Apply migrations only after checking target/history; production has legacy versions absent locally (see launch checklist) |

## Documentation

Read [`docs/README.md`](docs/README.md) for the index. In short:

- [`docs/LAUNCH_CHECKLIST.md`](docs/LAUNCH_CHECKLIST.md) — current production evidence, remaining launch blockers, and deployment checks
- [`docs/PRODUCT_REVIEW.md`](docs/PRODUCT_REVIEW.md) — positioning, monetization, what to validate and in what order
- [`docs/ANALYSIS_QUALITY_ROADMAP.md`](docs/ANALYSIS_QUALITY_ROADMAP.md) — implemented analysis-quality changes, benchmark results, and remaining work
- [`docs/ENGINE_DEPLOYMENT.md`](docs/ENGINE_DEPLOYMENT.md) — current VPS topology and repeatable engine deployment procedure
- [`apps/web/PRODUCT.md`](apps/web/PRODUCT.md) and [`apps/web/DESIGN.md`](apps/web/DESIGN.md) — product intent and the design system
- [`plans/README.md`](plans/README.md) — closed implementation plans retained as historical records
- `docs/archive/` — finished work records. History, not instructions.

When docs disagree with each other, the code wins; when they disagree about
product intent, `apps/web/PRODUCT.md` wins.
