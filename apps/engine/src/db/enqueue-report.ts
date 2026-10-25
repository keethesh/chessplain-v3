import { nanoid } from 'nanoid';
import { supabase } from './supabase.js';
import { EloBand } from '../types.js';
import { wakeWorkers } from '../queue/wakeup.js';

export interface PendingReportInput {
  userId: string | null;
  ip: string | null;
  pgn: string | undefined;
  source: string;
  externalId: string | null;
  metadata: Record<string, unknown>;
  heroVariant?: string;
  eloBand?: EloBand;
  /** Attach the new analysis to this source game instead of inserting one. */
  sourceGameId?: string;
  playerColor?: 'white' | 'black';
  whitePlayer?: string;
  blackPlayer?: string;
}

export interface PendingReport {
  id: string;
  share_id: string;
  status: string;
  /** True when production's unique constraints already had this game. */
  reused: boolean;
}

interface ExistingAnalysis {
  id: string;
  share_id: string;
  status: string;
}

function fail(error: { message?: string } | null | undefined, fallback: string): never {
  throw new Error(error?.message || fallback);
}

// PostgREST embeds a one-to-one relation as an object and one-to-many as an array.
function firstAnalysis(embedded: unknown): ExistingAnalysis | undefined {
  const row = [embedded].flat()[0] as ExistingAnalysis | null | undefined;
  return row?.id ? row : undefined;
}

async function lookupOwned(userId: string, source: string, externalId: string) {
  const { data, error } = await supabase.from('source_games')
    .select('id, game_analyses(id, share_id, status)')
    .eq('user_id', userId).eq('source', source).eq('external_id', externalId)
    .maybeSingle();
  if (error) fail(error, 'Failed to look up source game');
  return data as { id: string; game_analyses: unknown } | null;
}

/**
 * Insert a pending report, or return the one production already has for this
 * user and game (UNIQUE user_id+source+external_id, UNIQUE source_game_id).
 * Does not requeue a failed row — callers that want a retry do that first.
 */
export async function enqueuePendingReport(input: PendingReportInput): Promise<PendingReport> {
  let sourceGameId = input.sourceGameId;

  if (!sourceGameId && input.userId && input.externalId) {
    const existing = await lookupOwned(input.userId, input.source, input.externalId);
    const prior = firstAnalysis(existing?.game_analyses);
    if (prior) return { ...prior, reused: true };
    if (existing?.id) sourceGameId = existing.id;
  }

  if (!sourceGameId) {
    const row: Record<string, unknown> = {
      user_id: input.userId,
      ip: input.ip,
      pgn: input.pgn,
      source: input.source,
      external_id: input.externalId,
      metadata: input.metadata,
    };
    if (input.playerColor) row.player_color = input.playerColor;
    if (input.whitePlayer) row.white_player = input.whitePlayer;
    if (input.blackPlayer) row.black_player = input.blackPlayer;

    const { data: sourceGame, error: sourceErr } = await supabase.from('source_games').insert(row).select('id').single();
    if (sourceErr?.code === '23505' && input.userId && input.externalId) {
      const existing = await lookupOwned(input.userId, input.source, input.externalId);
      const prior = firstAnalysis(existing?.game_analyses);
      if (prior) return { ...prior, reused: true };
      sourceGameId = existing?.id;
    } else if (!sourceErr) {
      sourceGameId = sourceGame?.id;
    }
    if (!sourceGameId) fail(sourceErr, 'Failed to insert source game');
  }

  const { data: analysis, error: analysisErr } = await supabase.from('game_analyses').insert({
    user_id: input.userId,
    source_game_id: sourceGameId,
    ip: input.ip,
    share_id: nanoid(8),
    hero_variant: input.heroVariant,
    elo_band: input.eloBand,
    status: 'pending',
  }).select('id, share_id, status').single();

  if (analysisErr?.code === '23505') {
    const { data: existing, error } = await supabase.from('game_analyses')
      .select('id, share_id, status').eq('source_game_id', sourceGameId).maybeSingle();
    if (error) fail(error, 'Failed to look up game analysis');
    const prior = existing as ExistingAnalysis | null;
    if (prior?.id) return { ...prior, reused: true };
  }
  if (analysisErr || !analysis) fail(analysisErr, 'Failed to insert game analysis');
  wakeWorkers();
  return { ...(analysis as ExistingAnalysis), reused: false };
}
