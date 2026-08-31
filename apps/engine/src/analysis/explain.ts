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
});

export async function explainMoment(
  moment: CandidateMoment,
  eloBand: EloBand,
  opponentName: string,
  analysisId?: string
): Promise<MomentReport | null> {
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

    const rawText = response.choices[0]?.message?.content || '{}';
    const parsed = JSON.parse(rawText);
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

    const retryRaw = retryResponse.choices[0]?.message?.content || '{}';
    const retryParsed = JSON.parse(retryRaw);
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

    // Log to analysis_errors table
    console.error(`[Explain] Moment validation failed on retry: ${retryValidation.errors.join('; ')}`);
    if (analysisId) {
      await supabase.from('analysis_errors').insert({
        analysis_id: analysisId,
        stage: 'explaining_moment',
        error_message: retryValidation.errors.join('; '),
        context: { moment, inputPayload, rawOutput: retryRaw },
      });
    }

    return null;
  } catch (err) {
    console.error('[Explain] LLM call failed for moment:', err);
    if (analysisId) {
      await supabase.from('analysis_errors').insert({
        analysis_id: analysisId,
        stage: 'explaining_moment',
        error_message: err instanceof Error ? err.message : String(err),
        context: { moment, inputPayload },
      });
    }
    return null;
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
): Promise<GameSummary | null> {
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

    const rawText = response.choices[0]?.message?.content || '{}';
    const parsed = JSON.parse(rawText);
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

    const retryRaw = retryResponse.choices[0]?.message?.content || '{}';
    const retryParsed = JSON.parse(retryRaw);
    const retryValidation = validateSummaryJson(retryParsed);

    if (retryValidation.isValid && retryValidation.parsed) {
      return retryValidation.parsed;
    }

    if (analysisId) {
      await supabase.from('analysis_errors').insert({
        analysis_id: analysisId,
        stage: 'explaining_summary',
        error_message: retryValidation.errors.join('; '),
        context: { inputPayload, rawOutput: retryRaw },
      });
    }

    return null;
  } catch (err) {
    console.error('[Explain] LLM call failed for summary:', err);
    if (analysisId) {
      await supabase.from('analysis_errors').insert({
        analysis_id: analysisId,
        stage: 'explaining_summary',
        error_message: err instanceof Error ? err.message : String(err),
        context: { inputPayload },
      });
    }
    return null;
  }
}
