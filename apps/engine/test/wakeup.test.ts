import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { RECOVERY_POLL_MS, waitForWake, wakeGeneration, wakeWorkers } from '../src/queue/wakeup.js';

describe('queue wakeups', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  const track = (p: Promise<void>) => {
    const state = { done: false };
    void p.then(() => { state.done = true; });
    return state;
  };

  it('does not lose a wake that lands between the queue query and the wait', async () => {
    const seen = wakeGeneration();
    wakeWorkers(); // insert committed while the empty query was in flight
    const waiting = track(waitForWake(seen));
    await vi.advanceTimersByTimeAsync(0);
    expect(waiting.done).toBe(true);
  });

  it('wakes every waiting loop and drops their timers', async () => {
    const seen = wakeGeneration();
    const loops = [track(waitForWake(seen)), track(waitForWake(seen)), track(waitForWake(seen))];
    await vi.advanceTimersByTimeAsync(1000);
    expect(loops.map((l) => l.done)).toEqual([false, false, false]);
    wakeWorkers();
    await vi.advanceTimersByTimeAsync(0);
    expect(loops.map((l) => l.done)).toEqual([true, true, true]);
    expect(vi.getTimerCount()).toBe(0);
  });

  it('recovers on its own after the 30 s poll when no wake arrives', async () => {
    const waiting = track(waitForWake(wakeGeneration()));
    await vi.advanceTimersByTimeAsync(RECOVERY_POLL_MS - 1);
    expect(waiting.done).toBe(false);
    await vi.advanceTimersByTimeAsync(1);
    expect(waiting.done).toBe(true);
    expect(vi.getTimerCount()).toBe(0);
  });
});
