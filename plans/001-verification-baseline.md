# Plan 001: Establish a verification baseline (typecheck scripts + CI)

> **Executor instructions**: Follow this plan step by step. Run every
> verification command and confirm the expected result before moving to the
> next step. If anything in the "STOP conditions" section occurs, stop and
> report — do not improvise.
>
> **Drift check (run first)**: `git diff --stat d8a3a65..HEAD -- package.json apps/web/package.json apps/engine/package.json .github`
> If any of those changed since this plan was written, compare the "Current
> state" excerpts against the live code before proceeding; on a mismatch,
> treat it as a STOP condition.

## Status

- **Priority**: P1
- **Effort**: S
- **Risk**: LOW
- **Depends on**: none
- **Category**: dx
- **Planned at**: commit `d8a3a65`, 2026-09-09

## Why this matters

This repo has no CI and no working lint or typecheck script. Verification today
means a human remembering to run four commands by hand in two workspaces. The
web app's only quality script is `next lint`, which Next 16 removed — so it
fails outright, and the root `lint` script that fans out to it fails with it.
After this plan, one command per concern works locally and every push is
checked automatically, which is what makes the other plans in this directory
safe to execute.

## Current state

This is a pnpm workspace monorepo (`pnpm@10.28.2`, workspaces `apps/*`) with two
packages: `@chessplain/engine` (Fastify + TypeScript, Vitest) and
`@chessplain/web` (Next.js 16, React 19). There is **no `.github/` directory at
all** and **no ESLint config anywhere** in the repo.

`package.json` (root, complete file):

```json
{
  "name": "chessplain-monorepo",
  "private": true,
  "workspaces": [
    "apps/*"
  ],
  "scripts": {
    "build": "pnpm --filter ./apps/* build",
    "lint": "pnpm --filter ./apps/* lint"
  },
  "packageManager": "pnpm@10.28.2"
}
```

`apps/web/package.json:5-10`:

```json
  "scripts": {
    "dev": "next dev --turbopack",
    "build": "next build",
    "start": "next start",
    "lint": "next lint"
  },
```

`apps/engine/package.json:7-14`:

```json
  "scripts": {
    "build": "tsc",
    "start": "node dist/http/server.js",
    "dev": "tsx watch src/http/server.ts",
    "worker": "tsx src/queue/worker.ts",
    "test": "vitest run",
    "verify:20": "tsx scripts/verify-20-games.ts"
  },
```

Facts you need:

- `apps/web/tsconfig.json` already sets `"noEmit": true`, so `tsc --noEmit` is
  the correct typecheck invocation there.
- `apps/engine`'s `build` script is `tsc` (it emits to `dist/`), so its
  typecheck must be `tsc --noEmit` as a *separate* script — do not change `build`.
- `apps/web` has **no** `test` script and no test runner installed. `pnpm -r run test`
  skips packages without the script, so that is safe.
- `apps/engine` test files live in `apps/engine/test/*.test.ts` and run under Vitest
  with no config file (defaults).
- Node version: the repo targets ES2022 with `@types/node@^22`. Use Node 22 in CI.
- There is a `pnpm-lock.yaml` at the repo root — CI must use `--frozen-lockfile`.

## Commands you will need

| Purpose | Command | Expected on success |
|---|---|---|
| Install | `pnpm install` | exit 0 |
| Engine typecheck | `pnpm --filter @chessplain/engine exec tsc --noEmit` | exit 0, no output |
| Web typecheck | `pnpm --filter @chessplain/web exec tsc --noEmit` | exit 0, no output |
| Engine tests | `pnpm --filter @chessplain/engine test` | 18 passed |
| Web build | `pnpm --filter @chessplain/web build` | exit 0, "Compiled successfully" |
| Recursive typecheck (after step 1) | `pnpm -r run typecheck` | exit 0 for both packages |

## Scope

**In scope** (the only files you should modify or create):
- `package.json` (root)
- `apps/web/package.json`
- `apps/engine/package.json`
- `.github/workflows/ci.yml` (create)

**Out of scope** (do NOT touch):
- Any `.ts`/`.tsx` source file. If typecheck fails on existing code, that is a
  STOP condition, not something to fix here.
- `pnpm-lock.yaml` — no dependencies are added by this plan. If it changes,
  you have added a dependency; revert.
- Adding ESLint, Prettier, or any new dependency. Explicitly deferred.
- `apps/engine/tsconfig.json`, `apps/web/tsconfig.json`.

## Git workflow

Do not create branches, commit, or push. Leave all changes in the working tree
for review. (The reviewer handles version control.)

## Steps

### Step 1: Add `typecheck` scripts to both packages and fix the broken web `lint`

In `apps/engine/package.json`, add to `scripts` (keep `build` exactly as it is):

```json
    "typecheck": "tsc --noEmit",
```

In `apps/web/package.json`, **replace** the `"lint": "next lint"` line with:

```json
    "typecheck": "tsc --noEmit"
```

(`next lint` does not exist in Next 16 — it must be removed, not kept alongside.)

**Verify**: `pnpm -r run typecheck` → exit 0, runs in both `@chessplain/engine`
and `@chessplain/web`, no TypeScript errors reported.

### Step 2: Fix the root scripts

In root `package.json`, replace the `scripts` block with:

```json
  "scripts": {
    "build": "pnpm --filter ./apps/* build",
    "typecheck": "pnpm -r run typecheck",
    "test": "pnpm -r run test"
  },
```

The `lint` script is removed because both of its targets are gone (the engine
never had one and the web one was `next lint`). Keep `build` unchanged.

**Verify**: `pnpm run typecheck` → exit 0. `pnpm run test` → engine tests run,
18 passed, web is skipped without error.

### Step 3: Add the CI workflow

Create `.github/workflows/ci.yml`:

```yaml
name: CI

on:
  push:
    branches: [main]
  pull_request:

jobs:
  verify:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4

      - uses: pnpm/action-setup@v4
        with:
          version: 10.28.2

      - uses: actions/setup-node@v4
        with:
          node-version: 22
          cache: pnpm

      - run: pnpm install --frozen-lockfile

      - name: Typecheck
        run: pnpm run typecheck

      - name: Test
        run: pnpm run test

      - name: Build web
        run: pnpm --filter @chessplain/web build
        env:
          NEXT_PUBLIC_API_URL: https://api.example.invalid
          NEXT_PUBLIC_SUPABASE_URL: https://example.supabase.co
          NEXT_PUBLIC_SUPABASE_ANON_KEY: ci-placeholder-not-a-real-key

      - name: Build engine
        run: pnpm --filter @chessplain/engine build
```

Notes on why the web build gets placeholder env vars: the web app reads
`NEXT_PUBLIC_*` values at build time and currently falls back to production
values when they are unset (plan 003 changes that to fail fast). Passing
obvious placeholders keeps CI from ever touching production infrastructure and
keeps this workflow green after plan 003 lands.

**Verify**: `python -c "import yaml,sys; yaml.safe_load(open('.github/workflows/ci.yml'))"`
→ exit 0 (no output). If Python is unavailable, run
`node -e "require('fs').readFileSync('.github/workflows/ci.yml','utf8')"` and
visually confirm the file matches the block above exactly.

## Test plan

No new unit tests — this plan adds no runtime code. Its verification *is* the
new scripts running green:

- `pnpm run typecheck` exits 0 across both packages.
- `pnpm run test` exits 0 with the engine's 18 existing tests passing.
- `pnpm --filter @chessplain/web build` still exits 0.

## Done criteria

ALL must hold:

- [ ] `pnpm -r run typecheck` exits 0 and reports both packages
- [ ] `pnpm run test` exits 0; engine reports 18 passed
- [ ] `pnpm --filter @chessplain/web build` exits 0
- [ ] `pnpm --filter @chessplain/engine build` exits 0
- [ ] `rg -n "next lint" apps/ package.json` returns no matches
- [ ] `.github/workflows/ci.yml` exists and parses as valid YAML
- [ ] `git status --porcelain` lists only: `package.json`, `apps/web/package.json`, `apps/engine/package.json`, `.github/workflows/ci.yml`
- [ ] `git diff -- pnpm-lock.yaml` is empty

## STOP conditions

Stop and report back if:

- `tsc --noEmit` reports **any** pre-existing TypeScript error in either
  package. Report the errors verbatim; do not edit source to silence them.
- `pnpm install` wants to change `pnpm-lock.yaml`.
- The `scripts` blocks in the three `package.json` files do not match the
  excerpts in "Current state".
- A `.github/` directory already exists with workflows in it (this plan assumes
  none; report what is there instead of merging blindly).

## Maintenance notes

- ESLint is deliberately absent. When someone adopts it, it needs ESLint 9 flat
  config plus `eslint-config-next` for the web package, and a new `lint` step in
  the workflow between Typecheck and Test.
- The web `build` step in CI uses placeholder env vars on purpose. If plan 003
  lands and CI starts failing with a missing-env error, the fix is to add the
  newly-required variable to that step's `env:` block with a placeholder — never
  a real value.
- There is no live-pipeline job in CI, and there should not be: `pnpm verify:20`
  costs real LLM tokens and needs a Stockfish binary.
