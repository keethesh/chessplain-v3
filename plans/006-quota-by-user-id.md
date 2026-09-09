# Plan 006: Count free quota per user, not per IP, for signed-in users

> **Executor instructions**: Follow this plan step by step. Run every
> verification command and confirm the expected result before moving to the
> next step. If anything in the "STOP conditions" section occurs, stop and
> report — do not improvise.
>
> **Drift check (run first)**: `git diff --stat d8a3a65..HEAD -- apps/engine/src/http/server.ts`
> If it changed since this plan was written, compare the "Current state"
> excerpt against the live code before proceeding; on a mismatch, treat it as
> a STOP condition.

## Status

- **Priority**: P3
- **Effort**: S
- **Risk**: LOW (a mistake here either over- or under-counts free reports; no data loss)
- **Depends on**: none
- **Category**: bug
- **Planned at**: commit `d8a3a65`, 2026-09-09

## Why this matters

The free-report quota is counted by submitter IP for every non-premium user —
including users who are signed in and whose identity is known. Two consequences:
a signed-in free user behind shared NAT (university, office, mobile carrier, or
one household) can be refused their first report because strangers used the
allowance, and conversely a signed-in user can reset their own allowance by
changing networks. Counting by `user_id` when a user is authenticated fixes both
directions and is a two-line change, because the row already stores `user_id`
and the quota query already exists.

## Current state

`apps/engine/src/http/server.ts:121-166` — the authentication block that resolves
`userId`, followed by the quota check that ignores it:

```ts
      const clientIp = request.ip;

      // Extract auth token if provided
      const authHeader = request.headers.authorization;
      let userId: string | null = null;
      let isPremium = false;

      if (authHeader && authHeader.startsWith('Bearer ')) {
        const token = authHeader.substring(7);
        const { data: userData } = await supabase.auth.getUser(token);
        if (!userData?.user) return reply.status(401).send({ error: 'Please sign in again before submitting this game.' });
        if (userData?.user) {
          userId = userData.user.id;
          const { data: profile } = await supabase
            .from('profiles')
            .select('subscription_tier')
            .eq('id', userId)
            .single();
          if (profile?.subscription_tier === 'premium') {
            isPremium = true;
          }
        }
      }

      // Check quota for free/anon users (2 reports in 7 days per IP)
      // ponytail: exemption is env-gated, not IP-matched — the old 127.0.0.1 check
      // was spoofable via X-Forwarded-For with trustProxy enabled. If NAT collisions
      // bite, use the plan's fallback (email OTP before report 2).
      const quotaEnforced = config.nodeEnv === 'production' && !config.disableQuota;
      if (!isPremium && clientIp && quotaEnforced) {
        const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();
        const { count, error: countErr } = await supabase
          .from('game_analyses')
          .select('id', { count: 'exact', head: true })
          .eq('ip', clientIp)
          .neq('status', 'failed') // abandoned/failed runs don't consume quota
          .gte('created_at', sevenDaysAgo);

        if (countErr) return reply.status(503).send({ error: 'quota_unavailable', message: 'We could not check your report allowance. Please try again shortly.' });
        if (typeof count === 'number' && count >= 2) {
          return reply.status(402).send({
            error: 'quota_exceeded',
            message: 'Free quota reached (2 free reports per 7 days). Upgrade to Premium for unlimited reports.',
          });
        }
      }
```

Facts you need:

- `userId` is trustworthy: it comes from `supabase.auth.getUser(token)`, i.e.
  server-side token verification, not a client-supplied field.
- Rows carry both identifiers — `user_id` and `ip` are both written on insert at
  `server.ts:190-197`, so switching the count key needs no schema change.
- `clientIp` is `request.ip`, which honours `config.trustProxy`. The existing
  `ponytail:` comment documents that the *exemption* is env-gated because
  `X-Forwarded-For` is spoofable. That reasoning is why anonymous users must
  keep the IP key: it is the only identifier they have.
- The `ip` column is type `inet` (see `supabase/migrations/20260831000003_v3_pipeline.sql`).
- The guard `!isPremium && clientIp && quotaEnforced` currently skips the quota
  entirely when `clientIp` is falsy. Once a signed-in user is counted by
  `user_id`, that `clientIp` condition must no longer gate their check.

## Commands you will need

| Purpose | Command | Expected on success |
|---|---|---|
| Install | `pnpm install` | exit 0 |
| Engine typecheck | `pnpm --filter @chessplain/engine exec tsc --noEmit` | exit 0 |
| Engine tests | `pnpm --filter @chessplain/engine test` | 18 passed, then 20 after step 2 |

## Scope

**In scope**:
- `apps/engine/src/http/server.ts` (the quota block only, lines ~145-166)
- `apps/engine/test/quota.test.ts` (create)

**Out of scope** (do NOT touch):
- The auth block at `server.ts:123-143`. It is correct; `userId` and `isPremium`
  already hold what you need.
- The insert at `server.ts:169-200`, the report/SSE routes, or anything billing.
- The quota *limit* (2) and the 7-day window. This plan changes the counting
  **key**, not the policy.
- `config.nodeEnv === 'production'` gating and `config.disableQuota`. Leave the
  enforcement condition's env logic exactly as it is.
- `apps/engine/test/reliability.test.ts` and the other existing test files —
  another plan may be editing engine tests. Put yours in the new file only.
- `supabase/migrations/` — no schema change is needed.

## Git workflow

Do not create branches, commit, or push. Leave changes in the working tree.

## Steps

### Step 1: Key the quota on the strongest available identifier

Replace the quota block (from the `// Check quota for free/anon users` comment
through the closing brace of the `if`) with a version that counts by `user_id`
when signed in and by `ip` otherwise. Preserve the existing `ponytail:` comment
about the env-gated exemption — it still applies to the anonymous path — and
keep the `.neq('status', 'failed')` and `.gte('created_at', ...)` filters, the
503 on `countErr`, and the exact 402 response body.

Target shape:

```ts
      // Check quota for free/anon users (2 reports in 7 days).
      // Signed-in users are counted by user_id: an IP key punishes everyone
      // behind shared NAT for a stranger's usage, and resets when they change
      // network. Anonymous users have no identifier but the IP.
      // ponytail: exemption is env-gated, not IP-matched — the old 127.0.0.1 check
      // was spoofable via X-Forwarded-For with trustProxy enabled. If NAT collisions
      // bite on the anonymous path, use the plan's fallback (email OTP before report 2).
      const quotaEnforced = config.nodeEnv === 'production' && !config.disableQuota;
      const quotaKey = userId ? { column: 'user_id', value: userId } : (clientIp ? { column: 'ip', value: clientIp } : null);
      if (!isPremium && quotaKey && quotaEnforced) {
        const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();
        const { count, error: countErr } = await supabase
          .from('game_analyses')
          .select('id', { count: 'exact', head: true })
          .eq(quotaKey.column, quotaKey.value)
          .neq('status', 'failed') // abandoned/failed runs don't consume quota
          .gte('created_at', sevenDaysAgo);

        if (countErr) return reply.status(503).send({ error: 'quota_unavailable', message: 'We could not check your report allowance. Please try again shortly.' });
        if (typeof count === 'number' && count >= 2) {
          return reply.status(402).send({
            error: 'quota_exceeded',
            message: 'Free quota reached (2 free reports per 7 days). Upgrade to Premium for unlimited reports.',
          });
        }
      }
```

Note the deliberate behaviour change in the guard: a signed-in free user is now
quota-checked even if `clientIp` is empty, because their identity no longer
depends on the IP. An anonymous request with no IP is still skipped — there is
nothing to key on.

**Verify**: `pnpm --filter @chessplain/engine exec tsc --noEmit` → exit 0.
`rg -n "quotaKey" apps/engine/src/http/server.ts` → 3 matches.

### Step 2: Test both keying paths

Create `apps/engine/test/quota.test.ts`, following the mocking style of
`apps/engine/test/reliability.test.ts:1-14` (Vitest, `vi.hoisted` + `vi.mock`;
never a real database or a real Fastify listen). Assert on the **query the
handler builds**:

1. **Signed-in free user** → the count query filters `.eq('user_id', <uid>)`
   and **not** `.eq('ip', ...)`.
2. **Anonymous user** → the count query filters `.eq('ip', <ip>)`.

Build the test so it fails against the old code. The old code always filtered by
`ip`, so test 1 is the regression guard; a test that merely asserts "a count
query happened" would pass either way and is worthless.

To exercise the handler you need `config.nodeEnv === 'production'` and
`config.disableQuota === false` (otherwise the block is skipped entirely) — mock
`../src/config.js` rather than mutating `process.env`, so the test does not
depend on ambient environment. Mock `supabase.auth.getUser` to return a user for
case 1 and no user for case 2.

If wiring the full Fastify route proves to need out-of-scope changes, assert at
the narrowest reachable seam instead and say so in NOTES — but the two filter
assertions above must still be what is proven.

**Verify**: `pnpm --filter @chessplain/engine test` → all pass, 2 new tests
(20 total). Then prove the tests are real: temporarily change `quotaKey` back to
always `{ column: 'ip', value: clientIp }`, re-run, confirm the signed-in test
**fails**, then restore and confirm it passes. Report both results.

## Test plan

- New file `apps/engine/test/quota.test.ts`, 2 tests: signed-in free user counted
  by `user_id`; anonymous user counted by `ip`.
- Structural pattern: `apps/engine/test/reliability.test.ts`.
- Red-green proof required for the signed-in case (both outputs reported).
- Premium users are already covered by the `!isPremium` guard and need no new
  test — that path is unchanged by this plan.

## Done criteria

ALL must hold:

- [ ] `apps/engine/src/http/server.ts` selects the quota key from `userId` first, `clientIp` second
- [ ] The 402 response body and the 2-report / 7-day policy are byte-identical to before
- [ ] `.neq('status', 'failed')` and the `.gte('created_at', ...)` filters survive
- [ ] `pnpm --filter @chessplain/engine exec tsc --noEmit` exits 0
- [ ] `pnpm --filter @chessplain/engine test` exits 0 with 20 passed
- [ ] Red-green verified for the signed-in test (both outputs reported)
- [ ] `git status --porcelain` lists only `apps/engine/src/http/server.ts` and `apps/engine/test/quota.test.ts`

## STOP conditions

Stop and report back if:

- The quota block does not match the excerpt in "Current state".
- Testing the handler requires modifying `apps/engine/src/db/*`, the auth block,
  or any other out-of-scope file.
- The signed-in test cannot be made to fail against the old IP-only behaviour.
- You conclude the quota policy itself (2 per 7 days) should change. That is a
  product decision, not this plan's; report the reasoning instead.

## Maintenance notes

- The anonymous path still keys on a spoofable-if-misconfigured IP. That is
  accepted at this scale and documented by the surviving `ponytail:` comment;
  the named upgrade path is requiring an email OTP before a second anonymous
  report.
- A signed-in user who used their two free reports anonymously first still gets
  two more after signing in — the keys are independent. Closing that requires
  claiming anonymous rows onto the account at signup; deliberately out of scope.
- If plan 002 lands, an index on `(ip, created_at)` exists; a signed-in-heavy
  workload will also want one on `(user_id, created_at)`. Add it when the query
  shows up slow, not before.
- A reviewer should scrutinize that the `clientIp` condition was removed from
  the guard *only* for the signed-in path, and that premium users still skip the
  check entirely.
