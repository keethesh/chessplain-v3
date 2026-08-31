import OpenAI from 'openai';
import { config } from '../config.js';
import { supabase } from '../db/supabase.js';
import { CandidateMoment, EloBand, GameSummary, MomentReport } from '../types.js';
import {
  MOMENT_SYSTEM_PROMPT,
  SUMMARY_SYSTEM_PROMPT,
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

function cleanJsonString(str: string): string {
  const unquoted = str
    .replace(/^```json\s*/i, '')
    .replace(/^```\s*/, '')
    .replace(/\s*```$/, '')
    .trim();
  const match = unquoted.match(/\{[\s\S]*\}/);
  return match ? match[0] : unquoted;
}

export function createFallbackMoment(moment: CandidateMoment): MomentReport {
  return {
    ply: moment.ply,
    move_number: moment.moveNumber,
    played: moment.san,
    probable_thought: 'I was looking to improve my piece activity and create active play.',
    what_actually_happens: `This move gave away the initiative. ${moment.refutationLineSan ? `The reply ${moment.refutationLineSan} created decisive counterplay.` : 'The position became difficult to defend.'}`,
    concept_name: moment.candidateType === 'Missed win' ? 'Missed tactic' : 'Tactical oversight',
    concept_definition: 'overlooking an opponent counter-threat',
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
    headline: first ? `Move ${first.move_number} was where the outcome changed.` : 'A hard-fought game decided in the middlegame.',
    story: `The game was decided in the tactical transitions. ${first ? `Move ${first.move_number} was the critical moment where the balance shifted.` : ''} After that, ${meta.opponentName || 'your opponent'} converted the advantage cleanly.`,
    focus_habit: first?.takeaway || 'Before capturing a pawn, trace where your piece lands and how it returns.',
  };
}

export async function explainMoment(
  moment: CandidateMoment,
  eloBand: EloBand,
  opponentName: string,
  analysisId?: string
): Promise<MomentReport> {
  const inputPayload = {
    position_before_fen: moment.fenBefore,
    played_move: moment.san,
    player_color: moment.playerColor,
    player_elo_band: eloBand,
    eval_before_pawns: parseFloat(moment.evalBefore.toFixed(2)),
    eval_after_pawns: parseFloat(moment.evalAfter.toFixed(2)),
    best_move: moment.bestMoveSan,
    refutation_line: moment.refutationLineSan,
    material_note: moment.materialNote,
    phase: moment.phase,
    opponent_name: opponentName,
  };

  const userContent = JSON.stringify(inputPayload);

  // Attempt 1
  try {
    const response = await openai.chat.completions.create({
      model: config.llmModel,
      messages: [
        { role: 'system', content: MOMENT_SYSTEM_PROMPT },
        { role: 'user', content: userContent },
      ],
      response_format: { type: 'json_object' },
      temperature: 0.2,
      max_tokens: 450,
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

    const retryResponse = await openai.chat.completions.create({
      model: config.llmModel,
      messages: [
        { role: 'system', content: MOMENT_SYSTEM_PROMPT },
        { role: 'user', content: retryUserContent },
      ],
      response_format: { type: 'json_object' },
      temperature: 0.1,
      max_tokens: 450,
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
      await supabase.from('analysis_errors').insert({
        analysis_id: analysisId,
        stage: 'explaining_moment',
        message: retryValidation.errors.join('; '),
        metadata: { moment, inputPayload, rawOutput: retryRawJson },
      });
    }

    return createFallbackMoment(moment);
  } catch (err) {
    console.error('[Explain] LLM call failed for moment:', err);
    if (analysisId) {
      await supabase.from('analysis_errors').insert({
        analysis_id: analysisId,
        stage: 'explaining_moment',
        message: err instanceof Error ? err.message : String(err),
        metadata: { moment, inputPayload },
      });
    }
    return createFallbackMoment(moment);
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
  const inputPayload = {
    result: meta.result || '0-1',
    player_color: meta.playerColor,
    player_name: meta.playerName,
    opponent_name: meta.opponentName,
    move_count: meta.moveCount,
    time_control: meta.timeControl || '10+0',
    moments: moments.map((m) => ({
      played: m.played,
      probable_thought: m.probable_thought,
      what_actually_happens: m.what_actually_happens,
      concept_name: m.concept_name,
      concept_definition: m.concept_definition,
      takeaway: m.takeaway,
      severity_label: m.severity_label,
    })),
  };

  const userContent = JSON.stringify(inputPayload);

  // Attempt 1
  try {
    const response = await openai.chat.completions.create({
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
    const validation = validateSummaryJson(parsed);

    if (validation.isValid && validation.parsed) {
      return validation.parsed;
    }

    // Attempt 2: Retry
    console.warn(`[Explain] Summary validation failed on attempt 1: ${validation.errors.join('; ')}. Retrying...`);
    const retryUserContent = `${userContent}\n\nPREVIOUS ATTEMPT FAILED VALIDATION:\n${validation.errors.map((e) => `- ${e}`).join('\n')}\nFix these issues and return strict compliant JSON.`;

    const retryResponse = await openai.chat.completions.create({
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
    const retryValidation = validateSummaryJson(retryParsed);

    if (retryValidation.isValid && retryValidation.parsed) {
      return retryValidation.parsed;
    }

    if (analysisId) {
      await supabase.from('analysis_errors').insert({
        analysis_id: analysisId,
        stage: 'explaining_summary',
        message: retryValidation.errors.join('; '),
        metadata: { inputPayload, rawOutput: retryRawJson },
      });
    }

    return createFallbackSummary(moments, meta);
  } catch (err) {
    console.error('[Explain] LLM call failed for summary:', err);
    if (analysisId) {
      await supabase.from('analysis_errors').insert({
        analysis_id: analysisId,
        stage: 'explaining_summary',
        message: err instanceof Error ? err.message : String(err),
        metadata: { inputPayload },
      });
    }
    return createFallbackSummary(moments, meta);
  }
}
