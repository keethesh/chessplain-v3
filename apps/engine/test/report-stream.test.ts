import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { streamReport, type ReportRow } from '../src/http/report-stream.js';
import { notifyReportChanged } from '../src/queue/report-events.js';

type SseEvent = { type: string; moment?: { ply: number }; error?: string };

const row = (status: string, plies: number[] = []): ReportRow => ({
  id: 'r1',
  status,
  moments: plies.map((ply) => ({ ply })),
  summary: null,
  completed_at: null,
});

const parse = (chunk: string): SseEvent => JSON.parse(chunk.slice('data: '.length));
const types = (out: SseEvent[]) => out.map((e) => e.type);

function setup(initial: ReportRow | null) {
  let current = initial;
  const fetchRow = vi.fn(async () => ({ data: current, error: current ? null : { message: 'nope' } }));
  const out: SseEvent[] = [];
  const end = vi.fn();
  const dispose = streamReport({ id: 'r1', fetchRow, write: (chunk) => out.push(parse(chunk)), end });
  return { fetchRow, out, end, dispose, set: (r: ReportRow | null) => { current = r; } };
}

describe('streamReport', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it('replays a completed report from the persisted row and closes', async () => {
    const s = setup(row('completed', [3, 5]));
    await vi.advanceTimersByTimeAsync(0);
    expect(types(s.out)).toEqual(['stage', 'moment', 'moment', 'done']);
    expect(s.end).toHaveBeenCalledTimes(1);
    notifyReportChanged('r1');
    await vi.advanceTimersByTimeAsync(0);
    expect(s.fetchRow).toHaveBeenCalledTimes(1);
  });

  it('reads again when a signal lands during an in-flight fetch', async () => {
    const { promise: gate, resolve: release } = Promise.withResolvers<void>();
    let current = row('sweeping');
    const fetchRow = vi.fn(async () => {
      const snapshot = current;
      if (fetchRow.mock.calls.length === 1) await gate;
      return { data: snapshot, error: null };
    });
    const out: SseEvent[] = [];
    const end = vi.fn();
    streamReport({ id: 'r1', fetchRow, write: (c) => out.push(parse(c)), end });
    await vi.advanceTimersByTimeAsync(0);
    current = row('completed', [7]); // written after the first read started
    notifyReportChanged('r1');
    release();
    await vi.advanceTimersByTimeAsync(0);
    expect(fetchRow).toHaveBeenCalledTimes(2);
    expect(types(out)).toEqual(['stage', 'stage', 'moment', 'done']);
    expect(end).toHaveBeenCalledTimes(1);
  });

  it('streams moments once and does not poll while idle', async () => {
    const s = setup(row('analyzing', [2]));
    await vi.advanceTimersByTimeAsync(0);
    s.set(row('analyzing', [2, 4]));
    await vi.advanceTimersByTimeAsync(10_000);
    expect(s.fetchRow).toHaveBeenCalledTimes(1);
    notifyReportChanged('r1');
    await vi.advanceTimersByTimeAsync(0);
    expect(s.out.filter((e) => e.type === 'moment').map((e) => e.moment?.ply)).toEqual([2, 4]);
    s.dispose();
  });

  it('pings every 15s and recovers by re-reading every 30s', async () => {
    const s = setup(row('analyzing'));
    await vi.advanceTimersByTimeAsync(0);
    s.set(row('failed'));
    await vi.advanceTimersByTimeAsync(30_000);
    expect(types(s.out).filter((t) => t === 'ping')).toHaveLength(2);
    expect(types(s.out).slice(-1)).toEqual(['failed']);
    expect(s.end).toHaveBeenCalledTimes(1);
    expect(s.fetchRow).toHaveBeenCalledTimes(2);
  });

  it('reports a missing report with the old error payload', async () => {
    const s = setup(null);
    await vi.advanceTimersByTimeAsync(0);
    expect(s.out).toEqual([{ type: 'error', error: 'Report not found' }]);
    expect(s.end).toHaveBeenCalledTimes(1);
  });

  it('stops fetching and writing after disconnect', async () => {
    const s = setup(row('analyzing'));
    await vi.advanceTimersByTimeAsync(0);
    s.dispose();
    notifyReportChanged('r1');
    await vi.advanceTimersByTimeAsync(60_000);
    expect(s.fetchRow).toHaveBeenCalledTimes(1);
    expect(types(s.out)).toEqual(['stage']);
  });
});
