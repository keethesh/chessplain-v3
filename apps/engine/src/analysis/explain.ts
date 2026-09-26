import OpenAI from 'openai';
import { config } from '../config.js';
import { recordAnalysisError } from '../db/errors.js';
import { CandidateMoment, EloBand, GameSummary, MomentReport } from '../types.js';
import {
  MOMENT_SYSTEM_PROMPT,
  SUMMARY_SYSTEM_PROMPT,
  buildMomentPayload,
  cleanJsonString,
  validateMomentJson,
  validateSummaryJson,
} from './prompts.js';

const openai = new OpenAI({
  baseURL: config.llmApiBase,
  apiKey: config.llmApiKey,
  timeout: 25000,
  maxRetries: 2,
});

export function extractJsonString(choice?: OpenAI.Chat.Completions.ChatCompletion.Choice): string {
  if (!choice) return '{}';
  const content = choice.message?.content?.trim();
  if (content && content.length > 2) {
    return cleanJsonString(content);
  }

  const rawMsg = choice.message as { reasoning_content?: string };
  const reasoning = rawMsg.reasoning_content?.trim();
  if (reasoning && reasoning.length > 2) {
    return cleanJsonString(reasoning);
  }

  return '{}';
}

export function isCreditExhaustionError(err: unknown): boolean {
  if (!err) return false;
  const e = err as { status?: number; message?: string; error?: { message?: string } };
  if (e.status === 401) return true;
  const msg = String(e.message || '') + ' ' + String(e.error?.message || '');
  return /not enough credits|credits exhausted|insufficient credits/i.test(msg);
}

/**
 * The model explained nothing for a whole report: gateway outage, credit
 * exhaustion, or every moment failing validation twice on top of the SDK's own
 * retries. Such a report is a page of "the written explanation is unavailable"
 * prose, so the pipeline aborts instead of persisting it as `completed` and
 * spending one of the player's analyses on it. `worker.ts` turns the throw into
 * a retry, then a `failed` row that quota checks ignore.
 */
export class LlmUnavailableError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'LlmUnavailableError';
  }
}

/**
 * Per-run counters the pipeline threads through `explainMoment`. A single
 * moment keeps degrading quietly to fallback prose, so no return value can
 * carry that judgement — only the run-level totals can say whether the model
 * explained anything at all.
 */
export interface ExplainRunStats {
  /** Moments the model never explained, so fallback prose was returned. */
  unexplainedMoments: number;
  /** Gateway refused the account (401 / out of credits). Nothing recovers this run. */
  creditsExhausted: boolean;
}

async function createChatCompletion(
  params: OpenAI.Chat.Completions.ChatCompletionCreateParamsNonStreaming
): Promise<OpenAI.Chat.Completions.ChatCompletion> {
  const body = {
    ...params,
    reasoning_effort: 'none',
  } as unknown as OpenAI.Chat.Completions.ChatCompletionCreateParamsNonStreaming;

  // One retry on timeout, with a fresh budget. AbortSignal.timeout caps the
  // whole request including the SDK's own maxRetries, so a single slow
  // response otherwise becomes a hard failure and the reader gets generic
  // fallback prose. Observed at ~4% of moments on a 20-game live run.
  // Never retry a credit-exhaustion error: that fails every attempt and the
  // caller records it as a terminal condition.
  for (let attempt = 1; attempt <= 2; attempt++) {
    try {
      return await openai.chat.completions.create(body, {
        signal: AbortSignal.timeout(30000),
      });
    } catch (err) {
      const e = err as { name?: string; type?: string };
      const timedOut = e?.name === 'AbortError' || e?.type === 'aborted' || e?.name === 'TimeoutError';
      if (!timedOut || attempt === 2 || isCreditExhaustionError(err)) throw err;
      console.warn('[Explain] LLM request timed out after 30s — retrying once with a fresh budget');
    }
  }

  throw new Error('LLM request retry loop exited without a result');
}

export function createFallbackMoment(moment: CandidateMoment): MomentReport {
  return {
    ply: moment.ply,
    move_number: moment.moveNumber,
    played: moment.san,
    probable_thought: 'Your intention cannot be inferred from the moves alone.',
    what_actually_happens: `The written explanation is unavailable. ${moment.refutationLineSan ? `Explore this calculated continuation: ${moment.refutationLineSan}.` : 'Compare the played move with the suggested alternative on the board.'}`,
    why_better: `Compare ${moment.bestMoveSan} on the board.`,
    concept_name: 'Position to review',
    concept_definition: 'a position worth comparing with an alternative',
    takeaway: 'Before committing a piece forward, check all opponent forcing responses.',
    severity_label: moment.candidateType,
    fen_before: moment.fenBefore,
    fen_after: moment.fenAfter,
    player_color: moment.playerColor,
    best_move: moment.bestMoveSan,
    refutation_line: moment.refutationLineSan,
    eval_swing: moment.swing,
  };
}

export function createFallbackSummary(
  moments: MomentReport[],
  meta: {
    playerName?: string;
    opponentName?: string;
    moveCount?: number;
  }
): GameSummary {
  const first = moments[0];
  return {
    headline: first ? `Start your review at move ${first.move_number}.` : 'No clear turning point found in this review.',
    story: first ? 'The written game summary is unavailable. The selected positions and calculated alternatives are available to explore on the board.' : 'This review did not identify a clear moment to explain. That does not mean every move was best; try reviewing another game.',
    focus_habit: first?.takeaway || 'Before choosing a move, check your opponent’s checks, captures, and threats.',
  };
}

export async function explainMoment(
  moment: CandidateMoment,
  eloBand: EloBand,
  opponentName: string,
  analysisId?: string,
  stats?: ExplainRunStats
): Promise<MomentReport> {
  // Every unexplained moment goes through here, so the run-level count cannot
  // drift from the number of fallback moments actually returned.
  const fallback = (): MomentReport => {
    if (stats) stats.unexplainedMoments++;
    return createFallbackMoment(moment);
  };

  const inputPayload = buildMomentPayload(moment, eloBand, opponentName);

  const userContent = JSON.stringify(inputPayload);

  // Attempt 1
  try {
    const response = await createChatCompletion({
      model: config.llmModel,
      messages: [
        { role: 'system', content: MOMENT_SYSTEM_PROMPT },
        { role: 'user', content: userContent },
      ],
      response_format: { type: 'json_object' },
      temperature: 0.2,
      max_tokens: 500,
    });

    const rawJson = extractJsonString(response.choices[0]);
    let parsed: unknown = {};
    try {
      parsed = JSON.parse(rawJson);
    } catch {
      parsed = {};
    }
    const validation = validateMomentJson(parsed);

    if (validation.isValid && validation.parsed) {
      return {
        ...validation.parsed,
        played: moment.san,
        ply: moment.ply,
        move_number: moment.moveNumber,
        fen_before: moment.fenBefore,
        fen_after: moment.fenAfter,
        player_color: moment.playerColor,
        best_move: moment.bestMoveSan,
        refutation_line: moment.refutationLineSan,
        eval_swing: moment.swing,
      };
    }

    // Attempt 2: Retry quoting back errors
    console.warn(`[Explain] Moment validation failed on attempt 1: ${validation.errors.join('; ')}. Retrying...`);
    const retryUserContent = `${userContent}\n\nPREVIOUS ATTEMPT FAILED VALIDATION:\n${validation.errors.map((e) => `- ${e}`).join('\n')}\nFix these issues and return strict compliant JSON.`;

    const retryResponse = await createChatCompletion({
      model: config.llmModel,
      messages: [
        { role: 'system', content: MOMENT_SYSTEM_PROMPT },
        { role: 'user', content: retryUserContent },
      ],
      response_format: { type: 'json_object' },
      temperature: 0.1,
      max_tokens: 500,
    });

    const retryRawJson = extractJsonString(retryResponse.choices[0]);
    let retryParsed: unknown = {};
    try {
      retryParsed = JSON.parse(retryRawJson);
    } catch {
      retryParsed = {};
    }
    const retryValidation = validateMomentJson(retryParsed);

    if (retryValidation.isValid && retryValidation.parsed) {
      return {
        ...retryValidation.parsed,
        played: moment.san,
        ply: moment.ply,
        move_number: moment.moveNumber,
        fen_before: moment.fenBefore,
        fen_after: moment.fenAfter,
        player_color: moment.playerColor,
        best_move: moment.bestMoveSan,
        refutation_line: moment.refutationLineSan,
        eval_swing: moment.swing,
      };
    }

    console.error(`[Explain] Moment validation failed on retry: ${retryValidation.errors.join('; ')}`);
    if (analysisId) {
      await recordAnalysisError({
        analysisId,
        stage: 'explaining_moment',
        message: retryValidation.errors.join('; '),
        metadata: { moment, inputPayload, rawOutput: retryRawJson },
      });
    }

    return fallback();
  } catch (err) {
    if (isCreditExhaustionError(err)) {
      console.error('[Explain] Upstream gateway credit exhaustion (401). Aborting retries.');
      // Terminal for the whole run, not just this moment: the pipeline uses
      // this to abort instead of publishing a report nobody will see explained.
      if (stats) stats.creditsExhausted = true;
      if (analysisId) {
        await recordAnalysisError({
          analysisId,
          stage: 'llm_credits_exhausted',
          message: err instanceof Error ? err.message : String(err),
          metadata: { moment, inputPayload },
        });
      }
      return fallback();
    }
    console.error('[Explain] LLM call failed for moment:', err);
    if (analysisId) {
      await recordAnalysisError({
        analysisId,
        stage: 'explaining_moment',
        message: err instanceof Error ? err.message : String(err),
        metadata: { moment, inputPayload },
      });
    }
    return fallback();
  }
}

export async function explainSummary(
  moments: MomentReport[],
  meta: {
    result?: string;
    playerColor: 'white' | 'black';
    playerName: string;
    opponentName: string;
    moveCount: number;
    timeControl?: string;
  },
  analysisId?: string
): Promise<GameSummary> {
  // Derive the outcome rather than leaving the model to reconcile "1-0" with
  // player_color. It got that wrong in testing and told a player who had just
  // won by mate that their opponent "converted cleanly".
  const result = meta.result || '*';
  const outcome =
    result === '1/2-1/2'
      ? 'drew'
      : result === '1-0'
        ? meta.playerColor === 'white'
          ? 'won'
          : 'lost'
        : result === '0-1'
          ? meta.playerColor === 'black'
            ? 'won'
            : 'lost'
          : 'unknown';

  // None of the player's moves cleared the review thresholds. The summary prompt
  // requires the story to cite at least two moments by move number, so sending an
  // empty payload invites invented move numbers. Answer honestly instead, and skip
  // the LLM call. Only the player's moves are reviewed, so never claim that no
  // moment decided the game: the opponent's blunder may well have.
  if (moments.length === 0) {
    const scope = 'This review looks only at your moves, not your opponent’s.';
    return outcome === 'won'
      ? {
          headline: 'You won without a costly mistake.',
          story: `None of your moves gave away enough to single out, so there is no mistake of yours to study in this game. ${scope}`,
          focus_habit: 'Before choosing a move, check your opponent’s checks, captures, and threats.',
        }
      : {
          headline: 'None of your moves stands out as the one that cost you.',
          story: `No move of yours swung the position far enough to single it out. That can mean the game was decided gradually rather than at one turning point. It does not mean every move was the strongest available. ${scope}`,
          focus_habit: 'Before choosing a move, check your opponent’s checks, captures, and threats.',
        };
  }

  const inputPayload = {
    outcome,
    result: meta.result || '*',
    player_color: meta.playerColor,
    player_name: meta.playerName,
    opponent_name: meta.opponentName,
    move_count: meta.moveCount,
    time_control: meta.timeControl || 'unknown',
    moments: moments.map((m) => ({
      played: m.played,
      probable_thought: m.probable_thought,
      what_actually_happens: m.what_actually_happens,
      why_better: m.why_better,
      concept_name: m.concept_name,
      concept_definition: m.concept_definition,
      takeaway: m.takeaway,
      severity_label: m.severity_label,
    })),
  };

  const userContent = JSON.stringify(inputPayload);

  // Attempt 1
  try {
    const response = await createChatCompletion({
      model: config.llmModel,
      messages: [
        { role: 'system', content: SUMMARY_SYSTEM_PROMPT },
        { role: 'user', content: userContent },
      ],
      response_format: { type: 'json_object' },
      temperature: 0.2,
      max_tokens: 350,
    });

    const rawJson = extractJsonString(response.choices[0]);
    let parsed: unknown = {};
    try {
      parsed = JSON.parse(rawJson);
    } catch {
      parsed = {};
    }
    const validation = validateSummaryJson(parsed, outcome);

    if (validation.isValid && validation.parsed) {
      return validation.parsed;
    }

    // Attempt 2: Retry
    console.warn(`[Explain] Summary validation failed on attempt 1: ${validation.errors.join('; ')}. Retrying...`);
    const retryUserContent = `${userContent}\n\nPREVIOUS ATTEMPT FAILED VALIDATION:\n${validation.errors.map((e) => `- ${e}`).join('\n')}\nFix these issues and return strict compliant JSON.`;

    const retryResponse = await createChatCompletion({
      model: config.llmModel,
      messages: [
        { role: 'system', content: SUMMARY_SYSTEM_PROMPT },
        { role: 'user', content: retryUserContent },
      ],
      response_format: { type: 'json_object' },
      temperature: 0.1,
      max_tokens: 350,
    });

    const retryRawJson = extractJsonString(retryResponse.choices[0]);
    let retryParsed: unknown = {};
    try {
      retryParsed = JSON.parse(retryRawJson);
    } catch {
      retryParsed = {};
    }
    const retryValidation = validateSummaryJson(retryParsed, outcome);

    if (retryValidation.isValid && retryValidation.parsed) {
      return retryValidation.parsed;
    }

    if (analysisId) {
      await recordAnalysisError({
        analysisId,
        stage: 'explaining_summary',
        message: retryValidation.errors.join('; '),
        metadata: { inputPayload, rawOutput: retryRawJson },
      });
    }

    return createFallbackSummary(moments, meta);
  } catch (err) {
    if (isCreditExhaustionError(err)) {
      console.error('[Explain] Upstream gateway credit exhaustion (401). Aborting retries.');
      if (analysisId) {
        await recordAnalysisError({
        analysisId,
        stage: 'llm_credits_exhausted',
        message: err instanceof Error ? err.message : String(err),
        metadata: { inputPayload },
      });
      }
      return createFallbackSummary(moments, meta);
    }
    console.error('[Explain] LLM call failed for summary:', err);
    if (analysisId) {
      await recordAnalysisError({
        analysisId,
        stage: 'explaining_summary',
        message: err instanceof Error ? err.message : String(err),
        metadata: { inputPayload },
      });
    }
    return createFallbackSummary(moments, meta);
  }
}
