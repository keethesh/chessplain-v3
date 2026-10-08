import { describe, expect, it, vi } from 'vitest';
import { Chess } from 'chess.js';
import { parsePgn } from '../src/analysis/pgn.js';
import { validateMomentJson, validateSummaryJson } from '../src/analysis/prompts.js';
import { DEMO_REPORT, DEMO_PGN } from '../../web/lib/demo-report.js';
import type { CandidateMoment, MomentReport } from '../src/types.js';

const mocks = vi.hoisted(() => ({
  sweep: vi.fn(), select: vi.fn(), verify: vi.fn(), moment: vi.fn(), summary: vi.fn(),
}));
vi.mock('../src/analysis/sweep.js', () => ({ sweepPositions: mocks.sweep }));
vi.mock('../src/analysis/select.js', () => ({ selectCandidateMoments: mocks.select }));
vi.mock('../src/analysis/verify.js', () => ({ verifyCandidates: mocks.verify }));
vi.mock('../src/analysis/explain.js', () => ({ explainMoment: mocks.moment, explainSummary: mocks.summary }));
import { runAnalysisPipeline } from '../src/analysis/pipeline.js';

describe('Game perspective and sample truth', () => {
  it('reviews Black when a target player is supplied for stored PGN', () => {
    const pgn = '[White "WhitePlayer"]\n[Black "BlackPlayer"]\n\n1. e4 e5 2. Nf3 Nc6 *';
    const game = parsePgn(pgn, 'blackplayer');
    expect(game.playerColor).toBe('black');
    expect(game.positions.filter(p => p.isPlayerMove).map(p => p.san)).toEqual(['1...e5', '2...Nc6']);
  });
  it('replays a custom starting position with its actual move number', () => {
    const fen = '8/8/4k3/8/8/4K3/4P3/8 w - - 0 34';
    const parsed = parsePgn('[SetUp "1"]\n[FEN "' + fen + '"]\n\n34. Kd4 *');
    expect(parsed.positions[0].fenBefore).toBe(fen);
    expect(parsed.positions[0].san).toBe('34.Kd4');
  });
  it('each sample moment replays from its board, and the sample matches its PGN', () => {
    const full = new Chess();
    full.loadPgn(DEMO_PGN);
    expect(full.isCheckmate()).toBe(true);
    const mainLine = full.history();
    for (const moment of DEMO_REPORT.moments) {
      const board = new Chess(moment.fen_before);
      expect(board.move(moment.played)?.san).toBe(moment.played);
      expect(board.fen()).toBe(moment.fen_after);
      // ply is 1-based, so the move played at that ply sits at index ply - 1.
      expect(mainLine[moment.ply - 1]).toBe(moment.played);
      for (const san of moment.refutation_line.replace(/\d+\.+\s*/g, '').split(/\s+/)) expect(board.move(san)?.san).toBe(san);
      expect(new Chess(moment.fen_before).move(moment.best_move)?.san).toBe(moment.best_move);
      // The sample must pass the same contract real LLM output does (word limits, no first person).
      const verdict = validateMomentJson(moment);
      expect(verdict.errors).toEqual([]);
    }
  });
  it('the sample summary passes the same contract as real summaries', () => {
    expect(validateSummaryJson(DEMO_REPORT.summary, 'lost').errors).toEqual([]);
  });
});

describe('Report publication', () => {
  it('serializes snapshots and leaves completed publication to the database owner', async () => {
    const candidate = { ply: 1 } as CandidateMoment;
    const momentA = { ply: 1, takeaway: 'Check threats' } as MomentReport;
    const momentB = { ply: 3, takeaway: 'Check captures' } as MomentReport;
    mocks.sweep.mockResolvedValue(new Map());
    mocks.select.mockReturnValue([candidate, { ply: 3 }]);
    mocks.verify.mockResolvedValue([candidate, { ply: 3 }]);
    mocks.moment.mockImplementation(async (c: CandidateMoment) => c.ply === 1 ? momentA : momentB);
    mocks.summary.mockResolvedValue({ headline: 'A lesson', story: 'Read the board.', focus_habit: 'Check threats.' });
    const stages: string[] = [];
    const snapshots: number[][] = [];
    let inFlight = 0;
    let maxInFlight = 0;
    const result = await runAnalysisPipeline({
      pgn: '1. e4 e5 2. Nf3 Nc6 *',
      onStageChange: stage => { stages.push(stage); },
      onMomentReady: async (_moment, all) => {
        maxInFlight = Math.max(maxInFlight, ++inFlight);
        await new Promise(resolve => setTimeout(resolve, 5));
        snapshots.push(all.map(m => m.ply));
        inFlight--;
      },
    });
    expect(stages).toEqual(['sweeping', 'verifying', 'explaining']);
    expect(maxInFlight).toBe(1);
    expect(snapshots).toEqual([[1], [1, 3]]);
    expect(result.report.summary?.headline).toBe('A lesson');
    expect(result.report.status).toBe('completed');
  });
});
