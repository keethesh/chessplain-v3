import { subscribeReportChanges } from '../queue/report-events.js';

export interface ReportRow {
  id: string;
  status: string;
  moments: unknown;
  summary?: unknown;
  completed_at?: unknown;
}

export const PING_MS = 15_000;
export const RECOVERY_MS = 30_000;

/**
 * Drives one report SSE stream: an initial snapshot, a re-read on every
 * in-process change hint, and a slow recovery re-read in case a hint was missed
 * (e.g. another process wrote the row). Returns a disposer for client disconnect.
 */
export function streamReport(opts: {
  id: string;
  fetchRow: () => Promise<{ data: ReportRow | null; error: unknown }>;
  write: (chunk: string) => void;
  end: () => void;
}): () => void {
  const { id, fetchRow, write, end } = opts;
  const send = (event: object) => write(`data: ${JSON.stringify(event)}\n\n`);
  let lastStatus = '';
  const sentPlies = new Set<number>();
  let closed = false;
  let running = false;
  let dirty = false;

  const dispose = () => {
    if (closed) return;
    closed = true;
    unsubscribe();
    clearInterval(ping);
    clearInterval(recovery);
  };
  const finish = () => {
    dispose();
    end();
  };

  async function refresh(): Promise<void> {
    // A hint that lands mid-fetch could describe a write the in-flight read
    // missed, so remember it and read again before going idle.
    if (running) { dirty = true; return; }
    running = true;
    try {
      do {
        dirty = false;
        let result;
        try {
          result = await fetchRow();
        } catch (err) {
          console.error('[SSE] Refresh error:', err);
          return;
        }
        if (closed) return;
        const { data: analysis, error } = result;
        if (error || !analysis) {
          send({ type: 'error', error: 'Report not found' });
          finish();
          return;
        }
        if (analysis.status !== lastStatus) {
          lastStatus = analysis.status;
          send({ type: 'stage', status: analysis.status });
        }
        const moments = Array.isArray(analysis.moments) ? analysis.moments : [];
        for (const moment of moments) {
          if (sentPlies.has(moment.ply)) continue;
          send({ type: 'moment', moment, count: moments.length });
          sentPlies.add(moment.ply);
        }
        if (analysis.status === 'completed') {
          send({ type: 'done', report: analysis });
          finish();
          return;
        }
        if (analysis.status === 'failed') {
          send({ type: 'failed', error: 'Analysis processing failed' });
          finish();
          return;
        }
      } while (dirty && !closed);
    } catch (err) {
      console.error('[SSE] Refresh error:', err);
    } finally {
      running = false;
    }
  }

  const request = () => { void refresh(); };
  // Subscribe before the first read so a change in between is not lost.
  const unsubscribe = subscribeReportChanges(id, request);
  // Progress event (not an SSE comment): re-arms the client's 60s stall
  // watchdog during long silent stages and keeps proxies from idling.
  const ping = setInterval(() => {
    try { if (!closed) write('data: {"type":"ping"}\n\n'); } catch { /* socket gone; close handler disposes */ }
  }, PING_MS);
  const recovery = setInterval(request, RECOVERY_MS);
  request();
  return dispose;
}
