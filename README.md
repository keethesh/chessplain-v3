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

**Current code:** typecheck, 56 unit tests, and production builds for both packages
pass. GitHub CI passed at `d01c697`. The engine is deployed to the production VPS.

**Live checks:** a Black-side report completed on the deployed engine; the API
smoke suite passes 25 checks; authenticated live monthly/yearly Stripe Checkout
sessions were created and expired without payment. The earlier real-game
acceptance gate passed 20/20 (p50 13.89s). These checks do not prove every
explanation correct or the full paid lifecycle.

**Not ready to advertise:** Vercel has blocked the account for exceeded CPU usage,
so the website returns HTTP 402. Restore hosting and the Git connection, finish
the real subscription/portal test, enable production quotas, verify the support
mailbox, and rotate previously exposed credentials.

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

- [`docs/LAUNCH_CHECKLIST.md`](docs/LAUNCH_CHECKLIST.md) — ordered pre-launch steps, env blocks, and what is verified vs still blocking
- [`docs/PRODUCT_REVIEW.md`](docs/PRODUCT_REVIEW.md) — positioning, monetization, what to validate and in what order
- [`docs/ENGINE_DEPLOYMENT.md`](docs/ENGINE_DEPLOYMENT.md) — how to deploy the engine to a VPS
- [`apps/web/PRODUCT.md`](apps/web/PRODUCT.md) and [`apps/web/DESIGN.md`](apps/web/DESIGN.md) — product intent and the design system
- [`plans/README.md`](plans/README.md) — implementation plans, with status
- `docs/archive/` — finished work records. History, not instructions.

When docs disagree with each other, the code wins; when they disagree about
product intent, `apps/web/PRODUCT.md` wins.
