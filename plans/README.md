# Implementation plans (closed archive)

These plans were generated on 2026-09-09 against commit `d8a3a65` and are
complete historical execution records. They are not current launch status or
an instruction to rerun migrations. Current production evidence lives in
[`docs/LAUNCH_CHECKLIST.md`](../docs/LAUNCH_CHECKLIST.md); current analysis
work lives in [`docs/ANALYSIS_QUALITY_ROADMAP.md`](../docs/ANALYSIS_QUALITY_ROADMAP.md).

All six plans below are DONE. Read an individual plan only when investigating
the historical change it records.

## Execution order & status

| Plan | Title | Priority | Effort | Depends on | Status |
|------|-------|----------|--------|------------|--------|
| 001 | Establish a verification baseline (typecheck scripts + CI) | P1 | S | — | DONE (reviewed 2026-09-09) |
| 002 | Make the schema bootstrappable on a fresh database | P1 | M | — | DONE (reviewed 2026-09-09) |
| 003 | Fail fast on missing env instead of defaulting to production | P1 | S | — | DONE (reviewed 2026-09-09) |
| 004 | Requeue only stale jobs so a second worker replica is safe | P2 | S | — | DONE (reviewed 2026-09-09) |
| 005 | Delete dead code left by the report redesign | P3 | S | — | DONE (reviewed 2026-09-09) |
| 006 | Count free quota per user, not per IP, for signed-in users | P3 | S | — | DONE (reviewed 2026-09-09) |

Executed 2026-09-09 by six executor subagents in two waves (wave 1: 001, 002,
003, 006 — wave 2: 004, 005, which touch files wave 1 had already edited).
All changes are uncommitted in the working tree, reviewed and verified:
`pnpm run typecheck` exit 0, `pnpm run test` 25/25 passed, `pnpm run build`
exit 0 for both packages.

Deviations accepted at review:
- 004 moved the row count into `.update(values, { count: 'exact' })`; the plan's
  `.select('id', { count })` form does not typecheck against supabase-js 2.112.4.
  Plan intent (a populated count) preserved.
- 004 assigned to the module-scope `reclaimTimer` rather than redeclaring it
  inside `startWorker()` — the plan's snippet would have shadowed the handle and
  left `stopWorker()` clearing nothing.
- 004 also corrected a second, contradictory single-replica claim further down
  `docs/ENGINE_DEPLOYMENT.md`.
- 002 applied its migrations to a throwaway local Postgres 18.4 cluster using the
  `auth.users` stub (Docker unavailable, so `supabase db reset` was not possible).
- 003 skipped `pnpm install` because siblings were editing `package.json` files
  concurrently; dependency presence was proven by green tsc/vitest/next runs.

Status values: TODO | IN PROGRESS | DONE | BLOCKED (one-line reason) | REJECTED (one-line rationale)

## Dependency notes

- All six plans touch disjoint file sets and may run in parallel.
- 001 lands the `typecheck` scripts that every other plan's done criteria
  would ideally use. Executors of 002–006 must not assume `pnpm typecheck`
  exists; each plan states the raw command to use instead.
- 002 is a prerequisite for standing up a *staging* Supabase project, which is
  in turn a prerequisite for running the live acceptance gate
  (`apps/engine: pnpm verify:20`). That gate is not a plan here — it needs
  secrets and a Stockfish binary that this environment does not have.

## Findings considered and rejected

- **Job claim race between workers**: not a finding. `apps/engine/src/queue/worker.ts:56-67`
  already claims via compare-and-swap (`.eq('status','pending')` on the update),
  which is correct for multiple workers. Only the boot-time requeue is unsafe
  (that is plan 004).
- **Committed Supabase anon key / PostHog project key** (`.env.example`,
  `apps/web/lib/supabase.ts:3-4`): these credential types are publishable by
  design and need no rotation. The actual defect is the silent fallback to the
  production project, which is plan 003.
- **Adding ESLint**: deliberately deferred out of plan 001. `next lint` was
  removed in Next 16 and there is no ESLint config in the repo; adopting flat
  config plus `eslint-config-next` is its own dependency decision. Typecheck +
  tests + build is the honest verification gate for now.
