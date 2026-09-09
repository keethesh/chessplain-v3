import { describe, expect, it, vi, beforeEach } from 'vitest';

/**
 * Error telemetry must actually reach the database, and a refused write must be
 * loud.
 *
 * Until 2026-09-09 every call site inserted `{ analysis_id, stage, message,
 * metadata }` into a v2-era analysis_errors table that had no analysis_id
 * column and required `source` and `severity` (with a CHECK constraint on
 * source that rejected the v3 stage names). Supabase returns those failures in
 * `{ error }` rather than throwing, and nothing inspected it — so production
 * held 0 error rows while serving live traffic. Engine crashes, moment
 * validation failures and LLM credit exhaustion were all recorded nowhere.
 */

const { insert } = vi.hoisted(() => ({ insert: vi.fn() }));

vi.mock('../src/db/supabase.js', () => ({
  supabase: { from: () => ({ insert }) },
}));

describe('recordAnalysisError', () => {
  beforeEach(() => {
    insert.mockReset();
    insert.mockResolvedValue({ error: null });
    vi.restoreAllMocks();
  });

  it('sends the columns the table actually requires', async () => {
    const { recordAnalysisError } = await import('../src/db/errors.js');

    await recordAnalysisError({
      analysisId: 'abc-123',
      stage: 'engine',
      message: 'stockfish died',
      metadata: { attempts: 2 },
    });

    expect(insert).toHaveBeenCalledTimes(1);
    const row = insert.mock.calls[0][0];
    // The three fields whose absence made every historical write fail.
    expect(row).toHaveProperty('analysis_id', 'abc-123');
    expect(row).toHaveProperty('source', 'engine');
    expect(row).toHaveProperty('severity', 'error');
    expect(row).toMatchObject({ stage: 'engine', message: 'stockfish died' });
    expect(row.metadata).toEqual({ attempts: 2 });
  });

  it('logs loudly when the database refuses the write', async () => {
    const { recordAnalysisError } = await import('../src/db/errors.js');
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {});
    insert.mockResolvedValue({ error: { code: 'PGRST204', message: "Could not find the 'analysis_id' column" } });

    await recordAnalysisError({ analysisId: 'x', stage: 'engine', message: 'original failure text' });

    expect(consoleError).toHaveBeenCalled();
    const logged = consoleError.mock.calls.flat().join(' ');
    expect(logged).toContain('PGRST204');
    // The original failure must survive in the log, or the real error is lost.
    expect(logged).toContain('original failure text');
  });

  it('never throws, so telemetry cannot fail an analysis', async () => {
    const { recordAnalysisError } = await import('../src/db/errors.js');
    vi.spyOn(console, 'error').mockImplementation(() => {});
    insert.mockRejectedValue(new Error('network down'));

    await expect(
      recordAnalysisError({ analysisId: 'x', stage: 'explaining_moment', message: 'boom' })
    ).resolves.toBeUndefined();
  });

  it('accepts a custom severity and omits a missing analysis id', async () => {
    const { recordAnalysisError } = await import('../src/db/errors.js');

    await recordAnalysisError({ stage: 'llm_credits_exhausted', message: 'no credits', severity: 'fatal' });

    const row = insert.mock.calls[0][0];
    expect(row.severity).toBe('fatal');
    expect(row.analysis_id).toBeNull();
  });

  it('truncates very long messages rather than risking a column limit', async () => {
    const { recordAnalysisError } = await import('../src/db/errors.js');

    await recordAnalysisError({ stage: 'engine', message: 'x'.repeat(9000) });

    expect(insert.mock.calls[0][0].message.length).toBe(4000);
  });
});
