# Plan 005: Delete dead code left by the report redesign

> **Executor instructions**: Follow this plan step by step. Run every
> verification command and confirm the expected result before moving to the
> next step. If anything in the "STOP conditions" section occurs, stop and
> report — do not improvise.
>
> **Drift check (run first)**: `git diff --stat d8a3a65..HEAD -- apps/web/components apps/web/lib/posthog.ts`
> If either changed since this plan was written, compare the "Current state"
> excerpts against the live code before proceeding; on a mismatch, treat it as
> a STOP condition.

## Status

- **Priority**: P3
- **Effort**: S
- **Risk**: LOW
- **Depends on**: none
- **Category**: tech-debt
- **Planned at**: commit `d8a3a65`, 2026-09-09

## Why this matters

The report redesign that landed in commit `d8a3a65` replaced the eval-sparkline
report layout and retired the rotating hero A/B test. Two artifacts survived
with zero call sites: a whole React component and an A/B bucketing helper. Dead
code with no importers is the kind of thing a future reader assumes is load
bearing, and the hero variant helper in particular implies an experiment is
running when none is. Deleting them costs nothing and makes the remaining
analytics code honest.

## Current state

Two dead symbols, both confirmed by full-repo search:

**1. `apps/web/components/EvalSparkline.tsx`** — an entire component file.
`rg -n "EvalSparkline" apps/web` matches only its own definition; nothing
imports it.

**2. `getDeterministicHeroVariant()` in `apps/web/lib/posthog.ts:40-50`** —
verbatim:

```ts
export function getDeterministicHeroVariant(): 'A' | 'B' | 'E' {
  const distinctId = getDistinctId();
  let hash = 0;
  for (let i = 0; i < distinctId.length; i++) {
    hash = (hash << 5) - hash + distinctId.charCodeAt(i);
    hash |= 0;
  }
  const index = Math.abs(hash) % 3;
  const variants: Array<'A' | 'B' | 'E'> = ['A', 'B', 'E'];
  return variants[index];
}
```

`rg -n "getDeterministicHeroVariant" apps/web` matches only this definition.

**What must survive.** These are related but live — do not touch them:

- `getDistinctId()` at `posthog.ts:34-38` is called by
  `getDeterministicHeroVariant()` **and** used elsewhere. It stays.
- The `hero_variant` field is still a real part of the data flow: the web app
  sends it on submit and the engine persists it
  (`apps/engine/src/http/server.ts:196`, selected back at `server.ts:222`). The
  *column and payload field stay*; only the client-side bucketing helper is
  dead. The homepage now sends a fixed variant string (`editorial_v1`) instead
  of a computed one.
- `apps/web/components/SharedReportInteractiveView.tsx` is the current report
  renderer and is live.

## Commands you will need

| Purpose | Command | Expected on success |
|---|---|---|
| Install | `pnpm install` | exit 0 |
| Web typecheck | `pnpm --filter @chessplain/web exec tsc --noEmit` | exit 0 |
| Web build | `pnpm --filter @chessplain/web build` | exit 0 |

## Scope

**In scope**:
- `apps/web/components/EvalSparkline.tsx` (delete)
- `apps/web/lib/posthog.ts` (remove one function)

**Out of scope** (do NOT touch):
- `getDistinctId()`, `initPostHog()`, `captureEvent()`, `identifyUser()`, or the
  `POSTHOG_KEY`/`POSTHOG_HOST` exports in `posthog.ts` — all live. Another plan
  may be editing lines 3-4 of this file; leave them exactly as you find them.
- Anything named `hero_variant` in either app, and the `hero_variant` column in
  `supabase/migrations/`. The field is live; only the bucketing helper is dead.
- `apps/web/components/SharedReportInteractiveView.tsx` and every other
  component. This plan deletes one file and one function, nothing else.
- Any other unused-looking export. If you find more dead code, report it in
  NOTES rather than deleting it — unscoped deletions fail review.

## Git workflow

Do not create branches, commit, or push. Leave changes in the working tree.

## Steps

### Step 1: Confirm both symbols are still dead

Run both searches and confirm each returns **only** the definition site:

```
rg -n "EvalSparkline" apps/
rg -n "getDeterministicHeroVariant" apps/
```

**Verify**: `EvalSparkline` appears only in
`apps/web/components/EvalSparkline.tsx`; `getDeterministicHeroVariant` appears
only in `apps/web/lib/posthog.ts`. If either has any other match, STOP.

### Step 2: Delete the component file

Delete `apps/web/components/EvalSparkline.tsx` entirely.

**Verify**: `rg -n "EvalSparkline" apps/` → no matches. Then
`pnpm --filter @chessplain/web exec tsc --noEmit` → exit 0.

### Step 3: Remove the dead helper

In `apps/web/lib/posthog.ts`, delete the `getDeterministicHeroVariant` function
(lines 40-50 in the current file) and nothing else. `getDistinctId()`
immediately above it must remain untouched, including its export.

**Verify**: `rg -n "getDeterministicHeroVariant" apps/` → no matches.
`rg -n "export function getDistinctId" apps/web/lib/posthog.ts` → one match.
`pnpm --filter @chessplain/web exec tsc --noEmit` → exit 0.

### Step 4: Confirm the app still builds

**Verify**: `pnpm --filter @chessplain/web build` → exit 0, "Compiled
successfully", and the route list still contains the report routes
(`/report/[id]`, `/r/[shareId]`), the homepage, and `/pricing`.

## Test plan

No new tests. This plan removes code with no call sites, so the regression
surface is the compiler and the bundler:

- `tsc --noEmit` exits 0 (nothing referenced the deleted symbols).
- `next build` exits 0 and still emits every route it emitted before.

Adding a test for deleted code would be inventing coverage for something that no
longer exists — do not.

## Done criteria

ALL must hold:

- [ ] `apps/web/components/EvalSparkline.tsx` does not exist
- [ ] `rg -n "EvalSparkline" apps/` returns no matches
- [ ] `rg -n "getDeterministicHeroVariant" apps/` returns no matches
- [ ] `rg -n "getDistinctId" apps/web/lib/posthog.ts` still returns its definition and its internal uses
- [ ] `rg -n "hero_variant" apps/` still returns matches (the live field survived)
- [ ] `pnpm --filter @chessplain/web exec tsc --noEmit` exits 0
- [ ] `pnpm --filter @chessplain/web build` exits 0
- [ ] `git status --porcelain` lists exactly two paths: the deleted component and `apps/web/lib/posthog.ts`

## STOP conditions

Stop and report back if:

- Either search in step 1 finds a real usage — the symbol is not dead and this
  plan is wrong.
- `tsc` or `next build` fails after a deletion (something referenced it
  dynamically, e.g. via a string-keyed import).
- Removing `getDeterministicHeroVariant` appears to require touching
  `getDistinctId` — it does not; if it seems to, you are editing the wrong lines.
- You find additional dead code. Report it; do not delete it in this plan.

## Maintenance notes

- If a hero A/B test is ever run again, the bucketing belongs in PostHog feature
  flags rather than a hand-rolled hash — the `hero_variant` field that reaches
  the database is already in place to record it.
- A reviewer should confirm the diff is purely deletions: two paths, no
  additions, no incidental reformatting of `posthog.ts`.
