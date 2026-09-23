import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { CandidateMoment } from '../src/types.js';

/**
 * A total LLM outage must not produce a `completed` report.
 *
 * `explainMoment` degrades one moment at a time — honest but generic prose — so
 * a gateway outage, an exhausted credit balance or persistent 5xx used to return
 * a full report of "the written explanation is unavailable", marked `completed`,
 * spending one of the player's analyses and looking to monitoring like a
 * success. The pipeline now aborts when nothing was explained; worker.ts turns
 * that throw into a retry, then a `failed` row that quota checks ignore.
 *
 * Partial success still completes: one bad moment among good ones is a worse
 * report, one unexplained report is not a report.
 */

const mocks = vi.hoisted(() => ({
  sweep: vi.fn(),
  select: vi.fn(),
  verify: vi.fn(),
  create: vi.fn(),
}));

vi.mock('../src/config.js', () => ({
  config: {
    llmApiBase: 'https://llm.test.invalid/v1',
    llmApiKey: 'test-llm-key',
    llmModel: 'test-model',
    supabaseUrl: 'https://test.supabase.co',
    supabaseAnonKey: 'test-anon-key',
    supabaseServiceRoleKey: '',
    posthogKey: '',
    posthogHost: 'https://posthog.test.invalid',
  },
}));

vi.mock('../src/db/supabase.js', () => ({
  supabase: { from: () => ({ insert: () => Promise.resolve({ error: null }) }) },
}));

vi.mock('openai', () => ({
  default: class {
    chat = { completions: { create: mocks.create } };
  },
}));

vi.mock('../src/analysis/sweep.js', () => ({ sweepPositions: mocks.sweep }));
vi.mock('../src/analysis/select.js', () => ({ selectCandidateMoments: mocks.select }));
vi.mock('../src/analysis/verify.js', () => ({ verifyCandidates: mocks.verify }));

import { runAnalysisPipeline } from '../src/analysis/pipeline.js';

const ABORT_MESSAGE =
  'LLM explanation failed for all moments; aborting to prevent degraded completed report';

const goodMomentJson = JSON.stringify({
  played: '15.Bxd7+',
  severity_label: 'Turning point',
  probable_thought: 'You wanted to trade into a calmer position after the pressure built up on the file.',
  what_actually_happens: 'The recapture arrives with tempo and the loose piece on the far side drops next move.',
  concept_name: 'Loose piece',
  concept_definition: 'an undefended piece inviting capture',
  takeaway: 'Before trading, check which of your pieces is left undefended afterwards.',
});

const reply = (content: string) => ({ choices: [{ message: { content } }] });

const candidate = (ply: number, moveNumber: number): CandidateMoment => ({
  ply,
  moveNumber,
  san: '15.Bxd7+',
  uci: 'b5d7',
  fenBefore: '4kb1r/p2r1ppp/4qn2/1B2p1B1/4P3/1Q6/PPP2PPP/2KR4 w k - 2 15',
  fenAfter: '4kb1r/p2B1ppp/4qn2/4p1B1/4P3/1Q6/PPP2PPP/2KR4 b k - 0 15',
  playerColor: 'white',
  evalBefore: 3.0,
  evalAfter: 1.0,
  swing: -2.0,
  bestMoveSan: 'Rxd7',
  bestMoveUci: 'd1d7',
  refutationLineSan: 'Rxd7 Qxd7',
  bestLineSan: 'Rxd7 Qxd7',
  phase: 'middlegame',
  materialNote: '',
  candidateType: 'Turning point',
});

const PGN = '1. e4 e5 2. Nf3 Nc6 3. Bc4 Bc5 *';

const withCandidates = (candidates: CandidateMoment[]) => {
  mocks.select.mockReturnValue(candidates);
  mocks.verify.mockResolvedValue(candidates);
};

describe('Pipeline aborts instead of publishing an unexplained report', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    mocks.sweep.mockReset();
    mocks.select.mockReset();
    mocks.verify.mockReset();
    mocks.create.mockReset();
    mocks.sweep.mockResolvedValue(new Map());
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    vi.spyOn(console, 'error').mockImplementation(() => {});
  });

  afterEach(() => vi.restoreAllMocks());

  it('throws when every candidate moment falls back', async () => {
    withCandidates([candidate(29, 15), candidate(31, 16)]);
    mocks.create.mockRejectedValue(new Error('503 Service Unavailable'));

    await expect(runAnalysisPipeline({ pgn: PGN })).rejects.toThrow(ABORT_MESSAGE);
  });

  it('throws on credit exhaustion even after the gateway answered an earlier moment', async () => {
    withCandidates([candidate(29, 15), candidate(31, 16)]);
    mocks.create
      .mockResolvedValueOnce(reply(goodMomentJson))
      .mockRejectedValue(new Error('not enough credits to complete this request'));

    await expect(runAnalysisPipeline({ pgn: PGN })).rejects.toThrow(ABORT_MESSAGE);
  });

  it('completes when only some moments fall back', async () => {
    withCandidates([candidate(29, 15), candidate(31, 16)]);
    mocks.create
      .mockResolvedValueOnce(reply(goodMomentJson))
      .mockRejectedValue(new Error('503 Service Unavailable'));

    const result = await runAnalysisPipeline({ pgn: PGN });

    expect(result.report.status).toBe('completed');
    expect(result.momentsCount).toBe(2);
    expect(result.report.moments[0].concept_name).toBe('Loose piece');
    expect(result.report.moments[1].probable_thought).toContain('cannot be inferred');
  });

  it('completes a clean game with no candidates without calling the LLM', async () => {
    withCandidates([]);

    const result = await runAnalysisPipeline({ pgn: PGN });

    expect(result.report.status).toBe('completed');
    expect(result.momentsCount).toBe(0);
    expect(result.report.summary?.headline).toBe('No single moment decided this game.');
    expect(mocks.create, 'summarised a momentless game with the LLM').not.toHaveBeenCalled();
  });
});
