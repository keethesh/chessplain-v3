# Plan 003: Fail fast on missing env instead of defaulting to production

> **Executor instructions**: Follow this plan step by step. Run every
> verification command and confirm the expected result before moving to the
> next step. If anything in the "STOP conditions" section occurs, stop and
> report — do not improvise.
>
> **Drift check (run first)**: `git diff --stat d8a3a65..HEAD -- apps/engine/src/config.ts apps/web/lib/supabase.ts apps/web/lib/posthog.ts`
> If any of those changed since this plan was written, compare the "Current
> state" excerpts against the live code before proceeding; on a mismatch,
> treat it as a STOP condition.

## Status

- **Priority**: P1
- **Effort**: S
- **Risk**: LOW (but touches startup — a mistake here stops the service booting)
- **Depends on**: none
- **Category**: security
- **Planned at**: commit `d8a3a65`, 2026-09-09

## Why this matters

The engine and the web app both hardcode the **production** Supabase project
URL, production PostHog project, and production Stripe price IDs as fallback
values for their environment variables. Anyone running the engine without an
env file silently connects to the production database; a misconfigured deploy
does the same instead of refusing to start. The credential *values* involved are
publishable by design (a Supabase anon key and a PostHog project key are meant
to ship to browsers) and need no rotation — the defect is the silent fallback to
live infrastructure. After this plan, missing configuration is a startup error
with a clear message.

## Current state

`apps/engine/src/config.ts` (complete, lines 1-34) — note that
`supabaseServiceRoleKey`, `llmApiKey`, `stripeSecretKey`, and
`stripeWebhookSecret` already correctly default to empty string, and
`positiveInteger()` at line 4 is the existing precedent for throwing on bad
config:

```ts
import dotenv from 'dotenv';
dotenv.config();

function positiveInteger(name: string, fallback: number): number {
  const value = Number(process.env[name] || fallback);
  if (!Number.isSafeInteger(value) || value < 1) throw new Error(`${name} must be a positive integer`);
  return value;
}

export const config = {
  port: parseInt(process.env.PORT || '8080', 10),
  nodeEnv: process.env.NODE_ENV || 'development',
  supabaseUrl: process.env.SUPABASE_URL || 'https://<production-project>.supabase.co',   // ← line 13, hardcoded prod URL
  supabaseServiceRoleKey: process.env.SUPABASE_SERVICE_ROLE_KEY || '',
  supabaseAnonKey: process.env.SUPABASE_ANON_KEY || '<hardcoded production anon JWT>',   // ← line 15
  llmApiBase: process.env.LLM_API_BASE || 'https://crof.ai/v1',
  llmApiKey: process.env.LLM_API_KEY || '',
  llmModel: process.env.LLM_MODEL || 'deepseek-v4-flash-0731',
  stripeSecretKey: process.env.STRIPE_SECRET_KEY || '',
  stripeWebhookSecret: process.env.STRIPE_WEBHOOK_SECRET || '',
  stripePriceMonthly: process.env.STRIPE_PRICE_MONTHLY || '<hardcoded live price id>',   // ← line 21
  stripePriceYearly: process.env.STRIPE_PRICE_YEARLY || '<hardcoded live price id>',     // ← line 22
  posthogKey: process.env.POSTHOG_KEY || '<hardcoded production project key>',           // ← line 23
  posthogHost: process.env.POSTHOG_HOST || 'https://eu.i.posthog.com',
  enginePath: process.env.ENGINE_PATH || (process.platform === 'win32' ? 'stockfish' : '/usr/local/bin/stockfish18_clang'),
  syzygyPath: process.env.SYZYGY_PATH || '/var/chess/syzygy',
  webOrigin: process.env.WEB_ORIGIN || 'https://getchessplain.com',
  disableQuota: process.env.DISABLE_QUOTA === 'true',
  enginePoolSize: positiveInteger('ENGINE_POOL_SIZE', 4),
  engineHashMb: positiveInteger('ENGINE_HASH_MB', 512),
  engineThreads: positiveInteger('ENGINE_THREADS', 1),
  // Trust forwarded IPs only from an explicitly configured reverse proxy.
  trustProxy: process.env.TRUST_PROXY || false,
};
```

The real values are in the file you will edit — **do not copy any of them into
new code, comments, test fixtures, or your report.**

`apps/web/lib/supabase.ts:1-8`:

```ts
import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://<production-project>.supabase.co';
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || '<hardcoded production anon JWT>';

export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true },
});
```

`apps/web/lib/posthog.ts:3-4` has the same shape for `POSTHOG_KEY` and
`POSTHOG_HOST`, but PostHog is optional telemetry that already no-ops on
localhost (`posthog.ts:11`) and is wrapped in try/catch — treat it differently
(see step 3).

Conventions: the engine throws plain `Error` from module scope for bad config
(`config.ts:6`). The web app is a Next.js 16 client bundle — a thrown error at
module scope in `lib/supabase.ts` would break the build, so it needs the
build-time-safe treatment in step 2, not a bare throw.

## Commands you will need

| Purpose | Command | Expected on success |
|---|---|---|
| Install | `pnpm install` | exit 0 |
| Engine typecheck | `pnpm --filter @chessplain/engine exec tsc --noEmit` | exit 0 |
| Web typecheck | `pnpm --filter @chessplain/web exec tsc --noEmit` | exit 0 |
| Engine tests | `pnpm --filter @chessplain/engine test` | 18 passed, then 20+ after step 4 |
| Web build | `pnpm --filter @chessplain/web build` | exit 0 |

## Scope

**In scope**:
- `apps/engine/src/config.ts`
- `apps/web/lib/supabase.ts`
- `apps/web/lib/posthog.ts`
- `apps/engine/test/config.test.ts` (create)
- `.env.example`

**Out of scope** (do NOT touch):
- `apps/engine/src/http/server.ts`, `apps/engine/src/queue/worker.ts`, or any
  other consumer of `config` — the exported shape must not change, only how
  values are obtained.
- `apps/web/lib/api.ts` and its `NEXT_PUBLIC_API_URL` default. A wrong API URL
  fails loudly at request time and does not touch the production database;
  leave it.
- `apps/engine/test/reliability.test.ts`, `chess-facts.test.ts`,
  `pipeline.test.ts` — another plan may be editing engine tests; put your test
  in the new file only.
- Rotating any credential, or removing the publishable keys from `.env.example`.

## Git workflow

Do not create branches, commit, or push. Leave changes in the working tree.

## Steps

### Step 1: Make the engine require its own configuration

In `apps/engine/src/config.ts`, add a `required()` helper next to
`positiveInteger()`, matching its style:

```ts
function required(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`${name} is required. Copy .env.example and fill it in — there is no default, on purpose: a fallback here would silently point this process at production.`);
  return value;
}
```

Then replace the hardcoded fallbacks:

- `supabaseUrl: required('SUPABASE_URL'),`
- `supabaseAnonKey: required('SUPABASE_ANON_KEY'),`
- `stripePriceMonthly: process.env.STRIPE_PRICE_MONTHLY || '',`
- `stripePriceYearly: process.env.STRIPE_PRICE_YEARLY || '',`
- `posthogKey: process.env.POSTHOG_KEY || '',`

Leave `posthogHost`, `llmApiBase`, `llmModel`, `enginePath`, `syzygyPath`,
`webOrigin`, `port`, `nodeEnv`, and every already-empty default exactly as they
are. Those defaults are either non-production-identifying (a host name, a model
name, a filesystem path) or already safe.

Stripe price IDs become empty strings rather than `required()` because the
engine must still boot without billing configured; the checkout route already
validates the price ID it receives.

**Verify**: `rg -n "jgtxprfulkbtzkcvinph|phc_|price_1" apps/engine/src/` → **no
matches**. Then `pnpm --filter @chessplain/engine exec tsc --noEmit` → exit 0.

### Step 2: Make the web app fail loudly but build safely

In `apps/web/lib/supabase.ts`, replace the two fallback literals so the values
come only from the environment, and throw when they are absent at runtime:

```ts
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseAnonKey) {
  throw new Error('NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY are required. Set them in .env.local (see .env.example) — there is no default, on purpose.');
}

export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true },
});
```

Keep the `createClient` options exactly as they are.

**Verify**: `pnpm --filter @chessplain/web exec tsc --noEmit` → exit 0, and
`pnpm --filter @chessplain/web build` → exit 0. The build must pass because
`apps/web/.env.local` supplies both variables. **If the build fails with the new
error message, that is a STOP condition** — it means a build-time code path
imports this module without env, and this approach needs rethinking.

### Step 3: Make PostHog opt-in rather than defaulting to the live project

In `apps/web/lib/posthog.ts`, change lines 3-4 to:

```ts
export const POSTHOG_KEY = process.env.NEXT_PUBLIC_POSTHOG_KEY || '';
export const POSTHOG_HOST = process.env.NEXT_PUBLIC_POSTHOG_HOST || 'https://eu.i.posthog.com';
```

Then in `initPostHog()`, after the existing localhost guard at line 11, add:

```ts
  if (!POSTHOG_KEY) return;
```

No throw — analytics is explicitly optional here ("Analytics is optional; never
block the product", `posthog.ts:19`). An unset key must mean "no telemetry", not
"telemetry to production".

**Verify**: `rg -n "phc_" apps/web/` → no matches. `pnpm --filter @chessplain/web exec tsc --noEmit`
→ exit 0.

### Step 4: Add a test for the required-config behaviour

Create `apps/engine/test/config.test.ts`. Model it on the existing suite's style
(Vitest, `describe`/`it`/`expect`, see `apps/engine/test/reliability.test.ts:1-15`).
`config.ts` reads `process.env` at import time, so the test must manipulate the
environment and use a dynamic import with a reset module registry:

```ts
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const REQUIRED = { SUPABASE_URL: 'https://test.supabase.co', SUPABASE_ANON_KEY: 'test-anon-key' };

describe('config', () => {
  let saved: NodeJS.ProcessEnv;
  beforeEach(() => { saved = { ...process.env }; vi.resetModules(); });
  afterEach(() => { process.env = saved; });

  it('throws when SUPABASE_URL is missing instead of defaulting to production', async () => {
    process.env = { ...saved, ...REQUIRED };
    delete process.env.SUPABASE_URL;
    await expect(import('../src/config.js')).rejects.toThrow(/SUPABASE_URL is required/);
  });

  it('throws when SUPABASE_ANON_KEY is missing', async () => {
    process.env = { ...saved, ...REQUIRED };
    delete process.env.SUPABASE_ANON_KEY;
    await expect(import('../src/config.js')).rejects.toThrow(/SUPABASE_ANON_KEY is required/);
  });

  it('does not embed a project-identifying default for optional analytics or billing', async () => {
    process.env = { ...saved, ...REQUIRED };
    delete process.env.POSTHOG_KEY;
    delete process.env.STRIPE_PRICE_MONTHLY;
    const { config } = await import('../src/config.js');
    expect(config.posthogKey).toBe('');
    expect(config.stripePriceMonthly).toBe('');
    expect(config.supabaseUrl).toBe('https://test.supabase.co');
  });
});
```

Note: `dotenv.config()` at `config.ts:2` will not repopulate the deleted
variables because there is no `.env` file in `apps/engine/`. If one exists in
your environment, that is a STOP condition — the test would be meaningless.

**Verify**: `pnpm --filter @chessplain/engine test` → all pass, including the 3
new tests (21 total).

### Step 5: Point `.env.example` at the new requirement

In `.env.example`, add this line directly under the existing header comment
block (do not remove or change any existing line):

```
# SUPABASE_URL and SUPABASE_ANON_KEY (engine) and NEXT_PUBLIC_SUPABASE_URL /
# NEXT_PUBLIC_SUPABASE_ANON_KEY (web) are REQUIRED — the code has no fallback
# and will refuse to start without them.
```

**Verify**: `rg -n "REQUIRED" .env.example` → one match.

## Test plan

- New file `apps/engine/test/config.test.ts` with three cases: missing
  `SUPABASE_URL` throws; missing `SUPABASE_ANON_KEY` throws; optional analytics
  and billing values are empty strings rather than production identifiers.
- Structural pattern: `apps/engine/test/reliability.test.ts`.
- Regression proof for the web side is the build: `pnpm --filter @chessplain/web build`
  must still exit 0 with `.env.local` present.
- Verification: `pnpm --filter @chessplain/engine test` → 21 passed.

## Done criteria

ALL must hold:

- [ ] `rg -n "jgtxprfulkbtzkcvinph" apps/` returns no matches
- [ ] `rg -n "phc_" apps/` returns no matches
- [ ] `rg -n "price_1" apps/` returns no matches
- [ ] `pnpm --filter @chessplain/engine exec tsc --noEmit` exits 0
- [ ] `pnpm --filter @chessplain/web exec tsc --noEmit` exits 0
- [ ] `pnpm --filter @chessplain/engine test` exits 0 with 21 passed
- [ ] `pnpm --filter @chessplain/web build` exits 0
- [ ] No credential value appears in `apps/engine/test/config.test.ts` (test uses `https://test.supabase.co` / `test-anon-key`)
- [ ] `git status --porcelain` lists only the five in-scope files

## STOP conditions

Stop and report back if:

- `pnpm --filter @chessplain/web build` fails with the new "are required" error
  — a build-time path imports `lib/supabase.ts` without env available, and the
  throw must move behind a lazy getter instead.
- An `apps/engine/.env` file exists (step 4's test would be void).
- Any consumer of `config` breaks typecheck — the exported shape was supposed to
  stay identical.
- You find a *secret* (service role key, Stripe secret key, LLM key) hardcoded
  anywhere in source. Report the `file:line` and credential type only, never the
  value, and note that it needs rotation — a committed secret is burned even
  after deletion.

## Maintenance notes

- Every new production identifier added to `config` should use `required()` or
  default to empty string. A convenience default that names live infrastructure
  is the exact bug this plan removes.
- `NEXT_PUBLIC_*` values are inlined into the browser bundle at build time, so
  the web app's requirement is enforced at build, not deploy. CI (plan 001)
  passes deliberate placeholders for this reason.
- A reviewer should check that no `.env.example` value was deleted — the
  publishable anon key living there is intentional and is what makes local setup
  a copy-paste.
