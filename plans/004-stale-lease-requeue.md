# Plan 004: Requeue only stale jobs so a second worker replica is safe

> **Executor instructions**: Follow this plan step by step. Run every
> verification command and confirm the expected result before moving to the
> next step. If anything in the "STOP conditions" section occurs, stop and
> report — do not improvise.
>
> **Drift check (run first)**: `git diff --stat d8a3a65..HEAD -- apps/engine/src/queue/worker.ts`
> If it changed since this plan was written, compare the "Current state"
> excerpt against the live code before proceeding; on a mismatch, treat it as
> a STOP condition.

## Status

- **Priority**: P2
- **Effort**: S
- **Risk**: MED (touches crash recovery — get it wrong and interrupted jobs stay stuck, or live jobs get stolen)
- **Depends on**: none (but see maintenance notes re: plan 002)
- **Category**: tech-debt
- **Planned at**: commit `d8a3a65`, 2026-09-09

## Why this matters

`requeueInterruptedJobs()` runs on worker boot and flips **every** job in a
mid-flight state back to `pending`, with no filter on age or owner. With one
worker that is correct crash recovery. With two, the second replica's startup
steals whatever the first is actively analysing: the row goes back to `pending`,
another worker claims it, and two Stockfish pools burn CPU on the same game
while the first worker's eventual write lands on a row someone else owns. That
is a hard one-replica ceiling on a pipeline whose whole cost profile is CPU.

The fix is small because the groundwork exists: the job claim is already a
correct compare-and-swap, and every claim already stamps `locked_at`. Filtering
the boot sweep to *stale* leases turns crash recovery into a lease reclaim, and
horizontal scaling stops being dangerous.

## Current state

`apps/engine/src/queue/worker.ts:225-234` — the function to change, verbatim:

```ts
// ponytail: blunt crash recovery — anything mid-flight when the process died
// (deploy restarts, OOM) would sit in a non-pending state forever; requeue on boot
async function requeueInterruptedJobs(): Promise<void> {
  const { error, count } = await supabase
    .from('game_analyses')
    .update({ status: 'pending', locked_at: null })
    .in('status', ['sweeping', 'verifying', 'explaining']);
  if (error) console.error('[Worker] Failed to requeue interrupted jobs:', error.message);
  else if (count) console.log(`[Worker] Requeued ${count} interrupted job(s) from a previous run`);
}
```

Its only caller, `worker.ts:236-242`:

```ts
export async function startWorker(): Promise<void> {
  if (isRunning) return;
  isRunning = true;

  await enginePool.init();
  await requeueInterruptedJobs();
```

The claim, `worker.ts:56-67` (already safe — do not change it). The
`.eq('status', 'pending')` on the *update* is the compare-and-swap that makes
concurrent claims correct:

```ts
    .update({
      status: 'sweeping',
      attempts: (analysis.attempts || 0) + 1,
      next_attempt_at: null,
      locked_at: new Date().toISOString(),
    })
    .eq('id', analysis.id)
    .eq('status', 'pending')
    .select()
```

`locked_at` is also cleared on completion (`worker.ts:165`) and on failure or
retry (`worker.ts:196`), so a non-null `locked_at` on a mid-flight row always
means "some worker claimed this at that time".

Facts you need:

- Statuses considered mid-flight: `'sweeping'`, `'verifying'`, `'explaining'`.
  These are fixed by a CHECK constraint in
  `supabase/migrations/20260831000003_v3_pipeline.sql`; do not invent new ones.
- A full analysis is expected to take well under a minute (the acceptance gate
  in `apps/engine/scripts/verify-20-games.ts` targets a p50 of 30s and treats
  120s as the per-game timeout).
- The engine's config style for tunables is `positiveInteger('NAME', default)`
  in `apps/engine/src/config.ts:4-8`, which throws on a non-integer.
- The repo marks deliberate simplifications with a `ponytail:` comment naming
  the ceiling and the upgrade path — the comment you are replacing is one.
  Follow that convention if you leave a corner cut.

## Commands you will need

| Purpose | Command | Expected on success |
|---|---|---|
| Install | `pnpm install` | exit 0 |
| Engine typecheck | `pnpm --filter @chessplain/engine exec tsc --noEmit` | exit 0 |
| Engine tests | `pnpm --filter @chessplain/engine test` | 18 passed, then 20 after step 3 |

## Scope

**In scope**:
- `apps/engine/src/queue/worker.ts`
- `apps/engine/src/config.ts` (add one tunable, nothing else)
- `apps/engine/test/worker-recovery.test.ts` (create)
- `.env.example` (document the new tunable)
- `docs/ENGINE_DEPLOYMENT.md` (correct the single-worker warning)

**Out of scope** (do NOT touch):
- The claim logic at `worker.ts:38-77`. It is already correct; changing it is
  out of scope and high risk.
- `apps/engine/test/reliability.test.ts` and the other existing test files —
  another plan may be editing engine tests. Put yours in the new file only.
- `supabase/migrations/` — the `locked_at` column and its index are another
  plan's job (plan 002). Assume the column exists; it is already written by the
  code you are reading.
- Any change that adds a worker id / owner column. A time-based lease is
  sufficient and needs no schema change.

## Git workflow

Do not create branches, commit, or push. Leave changes in the working tree.

## Steps

### Step 1: Add a lease-timeout tunable

In `apps/engine/src/config.ts`, add one entry to the `config` object next to the
other `positiveInteger` tunables (`enginePoolSize`, `engineHashMb`,
`engineThreads`):

```ts
  staleLeaseMinutes: positiveInteger('STALE_LEASE_MINUTES', 15),
```

15 minutes is far longer than any healthy run (p50 target 30s, per-game timeout
120s), so a lease that old means the owner is genuinely dead.

**Verify**: `pnpm --filter @chessplain/engine exec tsc --noEmit` → exit 0.

### Step 2: Reclaim only stale leases

In `apps/engine/src/queue/worker.ts`, replace the whole
`requeueInterruptedJobs()` function (lines 225-234, quoted above) with:

```ts
// Reclaim leases whose owner died. Every claim stamps locked_at (see the
// compare-and-swap above), so a mid-flight row whose lease is older than
// STALE_LEASE_MINUTES has no live worker behind it. Filtering by lease age is
// what makes running more than one replica safe: an unfiltered sweep would
// requeue jobs another worker is actively running.
async function reclaimStaleLeases(): Promise<void> {
  const cutoff = new Date(Date.now() - config.staleLeaseMinutes * 60_000).toISOString();
  const { error, count } = await supabase
    .from('game_analyses')
    .update({ status: 'pending', locked_at: null })
    .in('status', ['sweeping', 'verifying', 'explaining'])
    .or(`locked_at.is.null,locked_at.lt.${cutoff}`)
    .select('id', { count: 'exact', head: true });
  if (error) console.error('[Worker] Failed to reclaim stale leases:', error.message);
  else if (count) console.log(`[Worker] Reclaimed ${count} stale job lease(s)`);
}
```

Two details that matter:

- The `locked_at.is.null` branch is required, not defensive padding: rows that
  entered a mid-flight state before `locked_at` was ever written have a NULL
  lease and would otherwise be stranded forever.
- `.select('id', { count: 'exact', head: true })` is needed to make `count`
  populated on an update — the existing code reads `count` without it and
  therefore always logs nothing. Match the counting pattern already used at
  `apps/engine/src/http/server.ts:153-157`.

Confirm `config` is already imported in this file (it is used for other
settings). If it is not, add the import matching the file's existing style.

Then update the call site at `worker.ts:241` from `await requeueInterruptedJobs();`
to `await reclaimStaleLeases();`.

Finally, make the sweep periodic rather than boot-only — a stale lease created
*after* boot (the common case for a long-lived replica) needs reclaiming too.
In `startWorker()`, inside the `while (isRunning)` loop's `catch`-free path, do
**not** add a call per iteration (that would hammer the database once a second).
Instead, add a timer next to the existing loop:

```ts
  await enginePool.init();
  await reclaimStaleLeases();
  const reclaimTimer = setInterval(() => { void reclaimStaleLeases(); }, config.staleLeaseMinutes * 60_000);
  reclaimTimer.unref();
```

and clear it in `stopWorker()`:

```ts
export function stopWorker(): void {
  isRunning = false;
  if (reclaimTimer) { clearInterval(reclaimTimer); reclaimTimer = undefined; }
}
```

which requires hoisting the handle to module scope beside the existing
`isRunning` flag:

```ts
let reclaimTimer: NodeJS.Timeout | undefined;
```

**Verify**: `rg -n "requeueInterruptedJobs" apps/engine/src/` → no matches.
`rg -n "reclaimStaleLeases" apps/engine/src/queue/worker.ts` → 4 matches
(definition, boot call, timer call, and none stray). `pnpm --filter @chessplain/engine exec tsc --noEmit`
→ exit 0.

### Step 3: Test that a fresh lease is left alone and a stale one is reclaimed

Create `apps/engine/test/worker-recovery.test.ts`. The suite mocks Supabase, so
follow the mocking style in `apps/engine/test/reliability.test.ts:7-14`
(`vi.hoisted` + `vi.mock`). The assertion that matters is on the **query the
code builds**, not on a real database: capture the filter arguments and prove
that (a) the status filter is the three mid-flight states, and (b) the `or`
clause contains a `locked_at.lt.<timestamp>` whose timestamp is
`staleLeaseMinutes` in the past, and (c) a `locked_at.is.null` branch is present.

Structure it so the test fails if the age filter is removed — that is the
regression this plan exists to prevent. A test that only asserts "update was
called" would pass against the old broken code and is worthless here.

Sketch (adapt to the real module shape; `startWorker` also inits the engine pool,
so call the exported reclaim path or drive it via `startWorker` with the pool
mocked — whichever the module allows without spawning Stockfish):

```ts
import { describe, expect, it, vi, beforeEach } from 'vitest';

const captured: Record<string, unknown[]> = {};
// mock @supabase/supabase-js so .from().update().in().or().select() records its args
// then assert:
//   - the .in() call received ['sweeping','verifying','explaining']
//   - the .or() string matches /locked_at\.is\.null,locked_at\.lt\.\d{4}-/
//   - the cutoff parsed out of the .or() string is ~15 minutes before now
//     (allow a few seconds of slack)
```

If `reclaimStaleLeases` is not exported, export it — that is an acceptable,
in-scope change for testability, and matches `processNextJob` already being
exported at `worker.ts:38`.

**Verify**: `pnpm --filter @chessplain/engine test` → all pass, 2 new tests
(20 total). Then prove the test is real: temporarily delete the `.or(...)` line
from `worker.ts`, re-run, confirm the new test **fails**, then restore it and
confirm it passes again. Report both results.

### Step 4: Document the tunable and correct the deployment warning

In `.env.example`, add under the existing engine tunables (near
`# ENGINE_THREADS=1`):

```
# Minutes before a mid-flight job's lease is considered dead and requeued.
# Must exceed your worst-case single-game analysis time.
# STALE_LEASE_MINUTES=15
```

In `docs/ENGINE_DEPLOYMENT.md`, find the text stating that only one worker
replica may run (it describes the boot-time requeue as the reason). Replace that
warning with an accurate description: multiple replicas are safe because jobs
are claimed by compare-and-swap and only leases older than
`STALE_LEASE_MINUTES` are reclaimed; the remaining limit is CPU
(`ENGINE_POOL_SIZE` × `ENGINE_THREADS` per replica must fit the host's cores).
If no such warning exists, add the two-sentence version instead and say so.

**Verify**: `rg -n "STALE_LEASE_MINUTES" .env.example docs/ENGINE_DEPLOYMENT.md`
→ at least one match in each.

## Test plan

- New file `apps/engine/test/worker-recovery.test.ts`, 2 tests:
  1. the reclaim query filters to the three mid-flight statuses **and** an age
     cutoff derived from `staleLeaseMinutes`;
  2. rows with a NULL `locked_at` are still included (the stranded-row branch).
- Structural pattern: `apps/engine/test/reliability.test.ts` (Vitest,
  `vi.hoisted` mocks, no real Supabase).
- Red-green proof required: with the `.or(...)` filter removed the new test must
  fail. Report the failing output and the restored passing output.

## Done criteria

ALL must hold:

- [ ] `rg -n "requeueInterruptedJobs" apps/` returns no matches
- [ ] `apps/engine/src/queue/worker.ts` reclaim query contains both `locked_at.is.null` and `locked_at.lt.`
- [ ] `config.staleLeaseMinutes` exists and is used by the worker
- [ ] `pnpm --filter @chessplain/engine exec tsc --noEmit` exits 0
- [ ] `pnpm --filter @chessplain/engine test` exits 0 with 20 passed
- [ ] Red-green verified for the new age-filter test (both outputs reported)
- [ ] `git status --porcelain` lists only the five in-scope files

## STOP conditions

Stop and report back if:

- `requeueInterruptedJobs()` does not match the excerpt in "Current state".
- The claim logic at `worker.ts:56-67` no longer has `.eq('status', 'pending')`
  on the update — the whole premise that claims are already safe would be false.
- Mocking Supabase for this test requires changing `apps/engine/src/db/*` or any
  file outside scope.
- The new test cannot be made to fail when the age filter is removed. A test
  that passes either way proves nothing; report rather than shipping it.

## Maintenance notes

- Plan 002 adds the `locked_at` column to `supabase/migrations/` and an index on
  `(status, created_at)`. This plan's query filters on `status` + `locked_at`;
  if the reclaim sweep ever shows up slow, that is the index to extend.
- `STALE_LEASE_MINUTES` must stay comfortably above the worst-case analysis
  time. If per-game timeouts are ever raised above 15 minutes, this default
  becomes a job-stealing bug — hence the `.env.example` note.
- Still deliberately absent: per-worker ownership. A time lease cannot tell
  "worker died" from "worker paused 15 minutes", which is fine at this scale. If
  replicas ever exceed single digits, add a `locked_by` column and reclaim by
  owner liveness instead.
- A reviewer should scrutinize the timer: it must be `unref()`d (so it never
  holds the process open) and cleared in `stopWorker()` (so tests do not leak it).
