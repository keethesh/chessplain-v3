// In-process wakeups for idle queue loops. The database stays the source of
// truth; a wake is only a hint to look now instead of at the next 30 s poll.
export const RECOVERY_POLL_MS = 30_000;

let generation = 0;
const waiters = new Set<() => void>();

/** Capture BEFORE querying the queue; pass to waitForWake after an empty result. */
export function wakeGeneration(): number {
  return generation;
}

/** Call after a durable write that makes work available (or on shutdown). */
export function wakeWorkers(): void {
  generation++;
  for (const wake of [...waiters]) wake();
}

/**
 * Resolve on the next wake or after `ms`. Resolves at once when a wake landed
 * since `since`, so a signal sent during the queue query is never lost.
 */
export function waitForWake(since: number, ms = RECOVERY_POLL_MS): Promise<void> {
  if (generation !== since) return Promise.resolve();
  return new Promise((resolve) => {
    const done = () => {
      clearTimeout(timer);
      waiters.delete(done);
      resolve();
    };
    const timer = setTimeout(done, ms);
    waiters.add(done);
  });
}
