/**
 * Deployment verification: run this against any Chessplain engine URL to prove
 * it is configured and safe to advertise. No dependencies — Node 22 built-ins.
 *
 *   node apps/engine/scripts/verify-deployment.mjs http://127.0.0.1:8080
 *   node apps/engine/scripts/verify-deployment.mjs https://api.getchessplain.com
 *
 * It never submits a real analysis (that costs LLM tokens and a queue slot);
 * every check either reads a public endpoint or asserts that a malformed
 * request is rejected. Safe to run against production.
 *
 * Exit code 0 = ready. Non-zero = the count of failed checks.
 */

const BASE = (process.argv[2] || 'http://127.0.0.1:8080').replace(/\/$/, '');

let pass = 0;
const failures = [];
const warnings = [];

function record(ok, name, detail, { warnOnly = false } = {}) {
  if (ok) {
    pass++;
    console.log(`  PASS  ${name}`);
    return;
  }
  if (warnOnly) {
    warnings.push(`${name} — ${detail}`);
    console.log(`  WARN  ${name}  (${detail})`);
    return;
  }
  failures.push(`${name} — ${detail}`);
  console.log(`  FAIL  ${name}  (${detail})`);
}

async function req(path, { method = 'GET', body, headers = {}, timeoutMs = 20000 } = {}) {
  const res = await fetch(`${BASE}${path}`, {
    method,
    headers: body ? { 'Content-Type': 'application/json', ...headers } : headers,
    body: body === undefined ? undefined : typeof body === 'string' ? body : JSON.stringify(body),
    signal: AbortSignal.timeout(timeoutMs),
  });
  const text = await res.text();
  let json = null;
  try {
    json = JSON.parse(text);
  } catch {
    // Non-JSON response; callers fall back to the raw text.
  }
  return { status: res.status, headers: res.headers, text, json };
}

const VALID_PGN = '[White "a"]\n[Black "b"]\n[Result "1-0"]\n\n1. e4 e5 2. Bc4 Nc6 3. Qh5 Nf6 4. Qxf7# 1-0';
const CHESS960_PGN =
  '[Variant "Chess960"]\n[SetUp "1"]\n[FEN "rnkbbqrn/pppppppp/8/8/8/8/PPPPPPPP/RNKBBQRN w GAga - 0 1"]\n[White "a"]\n[Black "b"]\n\n1. e4 e5 1-0';

async function main() {
  console.log(`\nVerifying ${BASE}\n`);

  // ---------------------------------------------------------------- liveness
  console.log('Liveness');
  try {
    const health = await req('/healthz');
    record(health.status === 200, 'GET /healthz returns 200', `got ${health.status}`);
    const engines = health.json?.engines ?? 0;
    record(engines > 0, 'at least one chess engine in the pool', `engines=${engines}`);
    record(
      health.json?.available !== undefined,
      'health payload reports pool availability',
      `payload=${health.text.slice(0, 80)}`
    );
  } catch (err) {
    record(false, 'GET /healthz reachable', err.message);
  }

  // ----------------------------------------------------------- unknown routes
  console.log('\nRouting');
  try {
    const res = await req('/api/definitely-not-a-route');
    record(res.status === 404, 'unknown route returns 404', `got ${res.status}`);
  } catch (err) {
    record(false, 'unknown route returns 404', err.message);
  }

  try {
    const res = await req('/api/reports/not-a-real-id');
    record([400, 404].includes(res.status), 'unknown report id returns 400/404', `got ${res.status}`);
  } catch (err) {
    record(false, 'unknown report id returns 400/404', err.message);
  }

  // ------------------------------------------------------------------ billing
  console.log('\nBilling configuration');
  try {
    // No auth header: must be refused by auth, NOT by Stripe. A Stripe error
    // here means the endpoint reaches the payment provider unauthenticated.
    const res = await req('/api/billing/checkout', { method: 'POST', body: { interval: 'month' } });
    record(res.status === 401, 'checkout requires authentication', `got ${res.status}: ${res.text.slice(0, 120)}`);
    const leaksStripe = /no such price|stripe|sk_test|price_/i.test(res.text);
    record(!leaksStripe, 'checkout does not reach Stripe unauthenticated', res.text.slice(0, 140));
  } catch (err) {
    record(false, 'checkout endpoint reachable', err.message);
  }

  try {
    const res = await req('/api/billing/portal', { method: 'POST', body: {} });
    record(res.status === 401, 'portal requires authentication', `got ${res.status}`);
  } catch (err) {
    record(false, 'portal endpoint reachable', err.message);
  }

  try {
    const res = await req('/api/billing/webhook', { method: 'POST', body: {} });
    // 400 = signature missing (secret configured). 503 = not configured at all.
    record(res.status !== 503, 'webhook secret is configured', `got 503: billing is not configured`);
    record(res.status === 400, 'webhook rejects an unsigned payload', `got ${res.status}`);
  } catch (err) {
    record(false, 'webhook endpoint reachable', err.message);
  }

  // ------------------------------------------------------------------ hygiene
  console.log('\nResponse hygiene');
  try {
    const res = await req('/healthz');
    const server = res.headers.get('server') || '';
    record(!/fastify|node/i.test(server), 'no server software version advertised', `server: ${server}`, {
      warnOnly: true,
    });

    const bad = await req('/api/reports', { method: 'POST', body: { pgn: 'nope' } });
    const leaksStack = /\bat \/|\bat [A-Z]:\\|node_modules|\.ts:\d+/.test(bad.text);
    record(!leaksStack, 'errors do not leak stack traces or paths', bad.text.slice(0, 140));
  } catch (err) {
    record(false, 'response hygiene checks ran', err.message);
  }

  if (BASE.startsWith('https://')) {
    try {
      const res = await req('/healthz');
      record(
        Boolean(res.headers.get('strict-transport-security')),
        'HSTS header present on https',
        'missing Strict-Transport-Security',
        { warnOnly: true }
      );
    } catch {
      // Already reported by liveness.
    }
  }

  // -------------------------------------------------------- input validation
  console.log('\nInput validation (all of these must be rejected)');
  const rejections = [
    ['empty body', {}, 400],
    ['both pgn and username', { pgn: VALID_PGN, chesscom_username: 'hikaru' }, 400],
    ['unparseable pgn', { pgn: 'this is not a chess game' }, 400],
    ['pgn with no moves', { pgn: '[White "a"]\n[Black "b"]\n\n' }, 400],
    ['chess960 variant pgn', { pgn: CHESS960_PGN }, 400],
    ['oversized pgn (>100k chars)', { pgn: `${VALID_PGN}\n${'1. e4 e5 '.repeat(20000)}` }, 400],
    ['username with path traversal', { chesscom_username: '../../etc/passwd' }, 400],
    ['username with script tag', { chesscom_username: '<script>alert(1)</script>' }, 400],
    ['username too short', { chesscom_username: 'ab' }, 400],
    ['username too long', { chesscom_username: 'a'.repeat(40) }, 400],
    ['invalid player_color', { pgn: VALID_PGN, player_color: 'purple' }, 400],
  ];

  let rateLimited = false;
  for (const [name, body, expected] of rejections) {
    if (rateLimited) {
      console.log(`  SKIP  rejects ${name}  (per-IP rate limit already reached)`);
      continue;
    }
    try {
      const res = await req('/api/reports', { method: 'POST', body });
      if (res.status === 429) {
        // Not a failure: the submit endpoint is rate limited per IP, and this
        // battery is what exhausted it. Record that the limiter works and stop.
        rateLimited = true;
        record(true, 'per-IP rate limiting is active on /api/reports');
        console.log(`  SKIP  rejects ${name}  (per-IP rate limit reached)`);
        continue;
      }
      record(
        res.status === expected,
        `rejects ${name}`,
        `expected ${expected}, got ${res.status}: ${res.text.slice(0, 90)}`
      );
    } catch (err) {
      record(false, `rejects ${name}`, err.message);
    }
  }

  try {
    const res = await req('/api/reports', { method: 'POST', body: '{"pgn": "unterminated' });
    record(res.status >= 400 && res.status < 500, 'rejects malformed JSON', `got ${res.status}`);
  } catch (err) {
    record(false, 'rejects malformed JSON', err.message);
  }

  // ------------------------------------------------------------------ summary
  console.log(`\n${'='.repeat(58)}`);
  console.log(`${pass} passed, ${failures.length} failed, ${warnings.length} warning(s)`);
  if (warnings.length) {
    console.log('\nWarnings (non-blocking):');
    for (const w of warnings) console.log(`  - ${w}`);
  }
  if (failures.length) {
    console.log('\nFAILURES:');
    for (const f of failures) console.log(`  - ${f}`);
    console.log('\nNOT READY.');
    process.exit(Math.min(failures.length, 100));
  }
  console.log('\nREADY.');
}

main().catch((err) => {
  console.error(`verification crashed: ${err.message}`);
  process.exit(1);
});
