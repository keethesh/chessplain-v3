import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { chmodSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { EnginePool } from '../src/uci/engine-pool.js';
import type { EngineEvalResult } from '../src/types.js';

// The tests pass enginePath per pool; this keeps the module from requiring a real .env.
vi.mock('../src/config.js', () => ({
  config: { enginePoolSize: 1, enginePath: '', engineHashMb: 16, engineThreads: 1, syzygyPath: '' },
}));

/**
 * A search that outlives sendCommand used to drop its listener, clear busy,
 * and return to the pool still thinking. The next game then ate the stale
 * bestmove or timed out too. These drive a fake engine through that sequence.
 */

const FEN = '8/8/8/8/8/8/4K3/7k w - - 0 1';

const FAKE = `#!/usr/bin/env node
const fs = require('fs');
const readline = require('readline');

const mode = process.env.FAKE_UCI_MODE || 'healthy';
const statePath = process.env.FAKE_UCI_STATE;
let invocation = 1;
if (statePath) {
  const prior = fs.existsSync(statePath) ? Number(fs.readFileSync(statePath, 'utf8')) : 0;
  invocation = (Number.isFinite(prior) ? prior : 0) + 1;
  fs.writeFileSync(statePath, String(invocation));
}

if (mode === 'dead' && invocation > 1) process.exit(1);

const say = (line) => fs.writeSync(1, line + String.fromCharCode(10));
let goCount = 0;

const rl = readline.createInterface({ input: process.stdin });
rl.on('line', (line) => {
  const cmd = line.trim();
  if (cmd === 'uci') {
    say('uciok');
    return;
  }
  if (cmd === 'isready') {
    say('readyok');
    return;
  }
  if (cmd === 'quit') process.exit(0);
  if (cmd.startsWith('go')) {
    goCount += 1;
    if (invocation === 1 && goCount === 1 && mode !== 'healthy') return;
    say('info depth 2 score cp 20 pv d2d4');
    say('bestmove d2d4');
    return;
  }
  if (cmd === 'stop' && mode === 'stop') {
    say('info depth 1 score cp 99 pv a2a3');
    say('bestmove a2a3');
  }
});
`;

function message(result: PromiseSettledResult<unknown>): string {
  if (result.status !== 'rejected') return '';
  return result.reason instanceof Error ? result.reason.message : String(result.reason);
}

describe('UCI search timeout recovery', () => {
  let root = '';
  let script = '';
  let pool: EnginePool | undefined;

  beforeAll(() => {
    root = mkdtempSync(join(tmpdir(), 'uci-fake-'));
    script = join(root, 'fake-uci.js');
    writeFileSync(script, FAKE);
    chmodSync(script, 0o755);
  });

  afterEach(async () => {
    await pool?.shutdown();
    pool = undefined;
    delete process.env.FAKE_UCI_MODE;
    delete process.env.FAKE_UCI_STATE;
  });

  afterAll(() => {
    rmSync(root, { recursive: true, force: true });
  });

  async function start(mode: string, searchTimeoutMs: number, stopGraceMs: number): Promise<string> {
    const state = join(root, `state-${mode}`);
    process.env.FAKE_UCI_MODE = mode;
    process.env.FAKE_UCI_STATE = state;
    pool = new EnginePool(1, {
      enginePath: script,
      searchTimeoutMs,
      stopGraceMs,
      hashMb: 16,
      threads: 1,
      syzygyPath: '',
    });
    await pool.init();
    return state;
  }

  it('returns a search that finishes before the deadline', async () => {
    const state = await start('healthy', 1_000, 200);
    const first = await pool!.evaluate(FEN, { depth: 1 });
    const second = await pool!.evaluate(FEN, { nodes: 1 });
    expect(first.bestMove).toBe('d2d4');
    expect(first.evalPawns).toBeCloseTo(0.2);
    expect(second.bestMove).toBe('d2d4');
    expect(readFileSync(state, 'utf8')).toBe('1');
    expect(pool!.availableCount).toBe(1);
    expect(pool!.totalCount).toBe(1);
  });

  it('fails the timed-out search, drops the stale bestmove, and serves the next one', async () => {
    const state = await start('stop', 100, 2_000);
    const first = pool!.evaluate(FEN, { depth: 60 });
    const second = pool!.evaluate(FEN, { nodes: 1000 });
    const [timedOut, next] = await Promise.allSettled([first, second]);

    expect(timedOut.status).toBe('rejected');
    expect(message(timedOut)).toMatch(/timed out/);
    expect(next.status).toBe('fulfilled');
    const value = (next as PromiseFulfilledResult<EngineEvalResult>).value;
    expect(value.bestMove).toBe('d2d4');
    expect(value.evalPawns).toBeCloseTo(0.2);
    expect(readFileSync(state, 'utf8')).toBe('1');
    expect(pool!.totalCount).toBe(1);
    expect(pool!.availableCount).toBe(1);
  }, 10_000);

  it('restarts when stop is ignored and the next search succeeds', async () => {
    const state = await start('ignore', 100, 100);
    const first = pool!.evaluate(FEN, { depth: 60 });
    const second = pool!.evaluate(FEN, { nodes: 1000 });
    const [timedOut, next] = await Promise.allSettled([first, second]);

    expect(message(timedOut)).toMatch(/timed out/);
    expect(next.status).toBe('fulfilled');
    expect((next as PromiseFulfilledResult<EngineEvalResult>).value.bestMove).toBe('d2d4');
    expect(readFileSync(state, 'utf8')).toBe('2');
    expect(pool!.availableCount).toBe(1);
  }, 10_000);

  it('does not hand a dead engine to a waiter or leave that waiter pending', async () => {
    const state = await start('dead', 100, 100);
    const first = pool!.evaluate(FEN, { depth: 60 });
    const second = pool!.evaluate(FEN, { nodes: 1000 });
    const [timedOut, queued] = await Promise.allSettled([first, second]);

    expect(message(timedOut)).toMatch(/timed out/);
    expect(message(queued)).toMatch(/No usable UCI engines/);
    expect(readFileSync(state, 'utf8')).toBe('2');
    expect(pool!.totalCount).toBe(0);
    expect(pool!.availableCount).toBe(0);
    await expect(pool!.evaluate(FEN, { depth: 1 })).rejects.toThrow(/No usable UCI engines/);
  }, 10_000);
});
