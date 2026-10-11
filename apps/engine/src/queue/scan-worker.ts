import { config } from '../config.js';
import { supabase } from '../db/supabase.js';
import { enqueuePendingReport } from '../db/enqueue-report.js';
import { ChessComInputError, fetchScanGames, type ChessComScanGame } from '../analysis/chesscom.js';
import { aggregate, analyzeScanGame, type ScanGame } from '../analysis/scan.js';

interface ScanRow {
  id: string;
  user_id: string | null;
  ip: string | null;
  chesscom_username: string;
  attempts?: number;
  example_report_id?: string | null;
}

/** Another worker reclaimed this scan, or the row left fetching/analyzing. */
class LostLease extends Error {
  constructor() { super('Scan lease lost'); this.name = 'LostLease'; }
}

const IN_FLIGHT = ['fetching', 'analyzing'];

function errorMessage(err: unknown): string {
  if (err instanceof Error) return err.message;
  if (err && typeof err === 'object' && 'message' in err && typeof (err as { message: unknown }).message === 'string') {
    return (err as { message: string }).message;
  }
  return String(err);
}

function toStored(game: ChessComScanGame): ScanGame {
  return {
    url: game.url,
    ended_at: game.endedAt,
    time_class: game.timeClass,
    player_color: game.playerColor,
    outcome: game.outcome,
    opponent: game.opponent,
    opponent_rating: game.opponentRating,
    player_rating: game.playerRating,
    analyzed: false,
    turning_points: [],
  };
}

/** Update only while this attempt still holds the lease. Heartbeat refreshes locked_at. */
async function patchOwned(id: string, attempts: number, row: Record<string, unknown>, heartbeat = true): Promise<void> {
  const { data, error } = await supabase.from('scans')
    .update(heartbeat ? { ...row, locked_at: new Date().toISOString() } : row)
    .eq('id', id)
    .eq('attempts', attempts)
    .in('status', IN_FLIGHT)
    .select('id');
  if (error) throw error;
  const rows = Array.isArray(data) ? data : [];
  if (rows.length === 0) throw new LostLease();
}

/** Claim one pending scan, analyze it, enqueue its example report. No LLM. */
export async function processNextScan(): Promise<boolean> {
  const { data: candidate, error: fetchErr } = await supabase
    .from('scans')
    .select('id, user_id, ip, chesscom_username, attempts, example_report_id')
    .eq('status', 'pending')
    .or(`next_attempt_at.is.null,next_attempt_at.lte.${new Date().toISOString()}`)
    .order('created_at', { ascending: true })
    .limit(1)
    .maybeSingle();

  if (fetchErr || !candidate) return false;
  const scan = candidate as ScanRow;
  const priorAttempts = scan.attempts || 0;

  const { data: locked, error: lockErr } = await supabase
    .from('scans')
    .update({
      status: 'fetching',
      attempts: priorAttempts + 1,
      next_attempt_at: null,
      locked_at: new Date().toISOString(),
      error_message: null,
    })
    .eq('id', scan.id)
    .eq('status', 'pending')
    .select('id')
    .single();

  if (lockErr || !locked) return false;
  const attempts = priorAttempts + 1;
  console.log(`[Worker] Started scan ${scan.id}`);

  try {
    const fetched = await fetchScanGames(scan.chesscom_username);
    if (fetched.length === 0) throw new ChessComInputError('No eligible games to scan.', 'no_games');

    const stored = fetched.map(toStored);
    await patchOwned(scan.id, attempts, {
      status: 'analyzing',
      games: stored,
      progress: { done: 0, total: stored.length },
    });

    for (let i = 0; i < fetched.length; i++) {
      const game = fetched[i];
      stored[i] = {
        ...stored[i],
        analyzed: true,
        turning_points: await analyzeScanGame(game.pgn, { username: scan.chesscom_username, color: game.playerColor }),
      };
      await patchOwned(scan.id, attempts, { games: stored, progress: { done: i + 1, total: stored.length } });
    }

    const result = aggregate(stored);
    let exampleReportId: string | null = scan.example_report_id ?? null;
    if (result.example && !exampleReportId) {
      const sample = fetched.find((g) => g.url === result.example!.game_url);
      if (!sample) throw new Error(`Scan ${scan.id} example game is not in the fetched set`);
      // Claim can land after we started; the report must belong to whoever owns the scan now.
      const { data: fresh, error: freshErr } = await supabase.from('scans')
        .select('user_id, example_report_id')
        .eq('id', scan.id)
        .eq('attempts', attempts)
        .in('status', IN_FLIGHT)
        .maybeSingle();
      if (freshErr) throw freshErr;
      if (!fresh || typeof fresh !== 'object') throw new LostLease();
      // Row shape from the select above; PostgREST types this client as any.
      const owner = fresh as { user_id: string | null; example_report_id: string | null };
      exampleReportId = owner.example_report_id;
      if (!exampleReportId) {
        const username = scan.chesscom_username;
        const enqueued = await enqueuePendingReport({
          userId: owner.user_id,
          ip: scan.ip,
          pgn: sample.pgn,
          source: 'chesscom',
          externalId: sample.url,
          metadata: { chesscom_username: username },
          heroVariant: 'scan',
          eloBand: sample.eloBand,
          playerColor: sample.playerColor,
          whitePlayer: sample.playerColor === 'white' ? username : sample.opponent,
          blackPlayer: sample.playerColor === 'black' ? username : sample.opponent,
        });
        exampleReportId = enqueued.id;
      }
    }

    await patchOwned(scan.id, attempts, {
      status: 'completed',
      games: stored,
      progress: { done: stored.length, total: stored.length },
      result,
      example_report_id: exampleReportId,
      completed_at: new Date().toISOString(),
      locked_at: null,
      error_message: null,
    }, false);
    console.log(`[Worker] Scan ${scan.id} completed (${stored.length} games, example ${exampleReportId ?? 'none'})`);
    return true;
  } catch (err) {
    if (err instanceof LostLease) {
      console.warn(`[Worker] Scan ${scan.id} lost its lease; leaving the row alone`);
      return true;
    }
    const message = errorMessage(err);
    console.error(`[Worker] Scan ${scan.id} failed:`, message);
    const attempts = priorAttempts + 1;
    // A bad username or an empty archive will not change on retry.
    const shouldRetry = !(err instanceof ChessComInputError) && attempts < 3;
    const { data, error } = await supabase.from('scans').update({
      status: shouldRetry ? 'pending' : 'failed',
      locked_at: null,
      error_message: message.slice(0, 4000),
      next_attempt_at: shouldRetry ? new Date(Date.now() + attempts * 60_000).toISOString() : null,
    }).eq('id', scan.id).eq('attempts', attempts).in('status', IN_FLIGHT).select('id');
    if (error) console.error(`[Worker] Scan ${scan.id} failure update failed:`, error.message);
    else if (!Array.isArray(data) || data.length === 0) console.warn(`[Worker] Scan ${scan.id} lost its lease before the failure write`);
    return true;
  }
}

/** Same lease rule as report jobs: mid-flight rows older than staleLeaseMinutes go back to pending. */
export async function reclaimStaleScanLeases(): Promise<void> {
  const cutoff = new Date(Date.now() - config.staleLeaseMinutes * 60_000).toISOString();
  const { error, count } = await supabase
    .from('scans')
    .update({ status: 'pending', locked_at: null }, { count: 'exact' })
    .in('status', ['fetching', 'analyzing'])
    .or(`locked_at.is.null,locked_at.lt.${cutoff}`)
    .select('id');
  if (error) console.error('[Worker] Failed to reclaim stale scan leases:', error.message);
  else if (count) console.log(`[Worker] Reclaimed ${count} stale scan lease(s)`);
}
