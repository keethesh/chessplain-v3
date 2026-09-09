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

**Working and verified locally:** typecheck, 25 unit tests, and production
builds for both packages are green (`pnpm typecheck && pnpm test && pnpm build`).
CI runs all three on every push.

**Not yet proven:** the full pipeline has never been run end to end — real
Stockfish, real LLM, real database — in any session. `apps/engine/scripts/verify-20-games.ts`
is the gate that would prove it (20 real games, asserts ≥19 succeed, p50 ≤30s).
It has not been run because it needs a Stockfish binary and secrets.

**That gate is the next milestone.** Until it passes, treat every claim about
report quality and latency as untested.

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

There are no default credentials on purpose — missing config fails at startup
rather than silently connecting to production.

## Commands

| Command | What it does |
|---|---|
| `pnpm typecheck` | `tsc --noEmit` in both packages |
| `pnpm test` | Engine unit tests (Vitest) |
| `pnpm build` | Production build of both packages |
| `pnpm --filter @chessplain/engine verify:20` | **The live acceptance gate.** Costs real LLM tokens. |
| `supabase db push` | Apply migrations to a fresh or existing project |

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
