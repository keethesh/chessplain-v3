import { supabase } from './supabase.js';

export type ErrorStage = 'engine' | 'explaining_moment' | 'explaining_summary' | 'llm_credits_exhausted';

/**
 * Record a pipeline failure for later inspection.
 *
 * Until 2026-09-09 every call site wrote `{ analysis_id, stage, message,
 * metadata }` directly, and every one of those inserts failed: the table had no
 * analysis_id column and required `source` and `severity`. Nothing surfaced the
 * rejection, so production accumulated 0 error rows while serving real traffic.
 * Migration 20260831000007 adds the column and the defaults; this helper sends
 * the required fields explicitly and, critically, logs when a write is refused
 * so the next schema drift is visible within one request instead of never.
 *
 * Never throws: telemetry must not be able to fail an analysis.
 */
export async function recordAnalysisError(entry: {
  analysisId?: string;
  stage: ErrorStage;
  message: string;
  metadata?: Record<string, unknown>;
  severity?: 'info' | 'warning' | 'error' | 'fatal';
}): Promise<void> {
  try {
    const { error } = await supabase.from('analysis_errors').insert({
      analysis_id: entry.analysisId ?? null,
      source: 'engine',
      severity: entry.severity ?? 'error',
      stage: entry.stage,
      message: entry.message.slice(0, 4000),
      metadata: entry.metadata ?? {},
    });

    if (error) {
      console.error(
        `[Telemetry] Could not record ${entry.stage} error (${error.code ?? 'no code'}): ${error.message}. ` +
          `Original failure: ${entry.message.slice(0, 200)}`
      );
    }
  } catch (err) {
    console.error('[Telemetry] Error recording threw:', err instanceof Error ? err.message : err);
  }
}
