// In-process invalidation hints for report SSE streams. The database stays the
// source of truth: a notification only means "re-read the row now".
const listeners = new Map<string, Set<() => void>>();

export function notifyReportChanged(id: string): void {
  for (const callback of [...(listeners.get(id) ?? [])]) {
    try {
      callback();
    } catch (err) {
      console.error('[report-events] listener failed:', err);
    }
  }
}

export function subscribeReportChanges(id: string, callback: () => void): () => void {
  let set = listeners.get(id);
  if (!set) listeners.set(id, (set = new Set()));
  set.add(callback);
  return () => {
    set.delete(callback);
    if (set.size === 0 && listeners.get(id) === set) listeners.delete(id);
  };
}
