import { Chess } from 'chess.js';

export const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL || 'https://api.getchessplain.com';

export interface SubmitReportPayload {
  pgn?: string;
  chesscom_username?: string;
  chesscom_game_url?: string;
  hero_variant?: string;
  player_color?: 'white' | 'black';
}

/** One of the player's recent Chess.com games, from their side. */
export interface ChessComGameSummary {
  url: string;
  endedAt: string;
  timeClass: string;
  playerColor: 'white' | 'black';
  outcome: 'win' | 'loss' | 'draw';
  playerRating: number | null;
  opponent: string;
  opponentRating: number | null;
}

export interface SubmitReportResponse {
  id: string;
  share_id: string;
  status: string;
}

export interface MomentReport {
  ply: number;
  move_number: number;
  played: string;
  probable_thought: string;
  what_actually_happens: string;
  /** Why the better move works. Absent on reports from before 2026-09-24. */
  why_better?: string;
  concept_name: string;
  concept_definition: string;
  takeaway: string;
  severity_label: 'Turning point' | 'Last chance' | 'Missed win' | 'Quiet drift';
  fen_before: string;
  fen_after: string;
  player_color: 'white' | 'black';
  best_move: string;
  refutation_line: string;
  eval_swing: number;
  /** Code-derived concept; null when no fixed concept fits. Absent on reports from before 2026-10-11. */
  concept_id?: ConceptId | null;
  /** Added by the API at read time from concept_id. */
  concept?: ConceptInfo | null;
}

export type ConceptId = 'hanging_piece' | 'double_attack' | 'missed_mate_threat' | 'weak_back_rank' | 'losing_exchange';

export interface ConceptInfo {
  id: ConceptId;
  name: string;
  gremlin: string;
  definition: string;
  habit: string;
}

export interface ScanTurningPoint {
  ply: number;
  move_number: number;
  san: string;
  best_move: string;
  eval_swing: number;
  concept_id: ConceptId | null;
}

export interface ScanGame {
  url: string;
  ended_at: string;
  time_class: 'rapid' | 'blitz' | 'daily';
  player_color: 'white' | 'black';
  outcome: 'win' | 'loss' | 'draw';
  opponent: string;
  opponent_rating: number | null;
  player_rating: number | null;
  analyzed: boolean;
  turning_points: ScanTurningPoint[];
}

export interface ScanResult {
  games_scanned: number;
  top: null | { concept: ConceptInfo; games_with_concept: number; recurring: boolean };
  concept_counts: Array<{ concept_id: ConceptId; games: number }>;
  example: null | { game_url: string; ply: number; concept_id: ConceptId | null };
  nothing_decisive: boolean;
}

export interface Checkin {
  concept_id: ConceptId;
  answer: 'remembered' | 'forgot' | 'did_not_come_up';
  at: string;
}

export interface ScanDetail {
  id: string;
  share_id: string;
  status: 'pending' | 'fetching' | 'analyzing' | 'completed' | 'failed';
  chesscom_username: string;
  progress: { done: number; total: number };
  games: ScanGame[];
  result: ScanResult | null;
  example_report_id: string | null;
  checkin: Checkin | null;
  previous: null | { scan_id: string; concept: ConceptInfo; scanned_at: string };
  created_at: string;
  completed_at: string | null;
}

export interface OpenIdea {
  scan_id: string;
  concept: ConceptInfo;
  games_with_concept: number;
  games_scanned: number;
  example_report_id: string | null;
  scanned_at: string;
  last_checkin: Checkin | null;
  chesscom_username: string;
}

export interface GameSummary {
  headline: string;
  story: string;
  focus_habit: string;
}

export interface ReportDetail {
  id: string;
  share_id: string;
  status: 'pending' | 'sweeping' | 'verifying' | 'explaining' | 'completed' | 'failed';
  user_id?: string | null;
  elo_band?: string;
  hero_variant?: string;
  player_name?: string;
  opponent_name?: string;
  player_color?: 'white' | 'black';
  result?: string;
  time_control?: string;
  move_count?: number;
  moments: MomentReport[];
  summary?: GameSummary | null;
  created_at: string;
  completed_at?: string | null;
  source_games?: {
    pgn?: string;
    chesscom_username?: string;
    player_color?: 'white' | 'black';
    white_player?: string;
    black_player?: string;
  };
}


export class ApiError extends Error {
  constructor(message: string, public status: number) { super(message); this.name = 'ApiError'; }
}

async function request<T>(path: string, options: RequestInit = {}): Promise<T> {
  let res: Response;
  try {
    res = await fetch(API_BASE_URL + path, { ...options, signal: options.signal || AbortSignal.timeout(20000) });
  } catch {
    throw new ApiError('We couldn’t reach Chessplain. Check your connection and try again.', 0);
  }
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const fallback = res.status === 404 ? 'We couldn’t find that report.' : res.status === 429 ? 'Too many requests. Please wait a little before trying again.' : 'Something went wrong. Please try again.';
    throw new ApiError(data.message || data.error || fallback, res.status);
  }
  return data as T;
}

export function normalizeReport(data: ReportDetail): ReportDetail {
  const source = data.source_games;
  const color = data.player_color || source?.player_color || data.moments?.[0]?.player_color;
  let headers: Record<string, string> = {};
  let moveCount: number | undefined;
  if (source?.pgn) {
    try {
      const game = new Chess();
      game.loadPgn(source.pgn);
      headers = game.getHeaders();
      moveCount = Math.ceil(game.history().length / 2);
    } catch { /* A report can still be read when its source PGN is unavailable. */ }
  }
  const white = source?.white_player || headers.White;
  const black = source?.black_player || headers.Black;
  return {
    ...data, moments: Array.isArray(data.moments) ? data.moments : [],
    player_color: color,
    player_name: data.player_name || (color === 'black' ? black : white),
    opponent_name: data.opponent_name || (color === 'black' ? white : black),
    result: data.result || headers.Result,
    move_count: data.move_count ?? moveCount,
  };
}

export function submitReport(payload: SubmitReportPayload, token?: string): Promise<SubmitReportResponse> {
  return request('/api/reports', { method: 'POST', headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: 'Bearer ' + token } : {}) }, body: JSON.stringify(payload) });
}
export async function listChessComGames(username: string): Promise<ChessComGameSummary[]> {
  return (await request<{ games: ChessComGameSummary[] }>('/api/chesscom/' + encodeURIComponent(username) + '/games', { cache: 'no-store' })).games;
}
export async function getReportById(id: string): Promise<ReportDetail> {
  return normalizeReport(await request<ReportDetail>('/api/reports/' + encodeURIComponent(id), { cache: 'no-store' }));
}
export async function getReportByShareId(shareId: string): Promise<ReportDetail> {
  return normalizeReport(await request<ReportDetail>('/api/reports/share/' + encodeURIComponent(shareId), { cache: 'no-store' }));
}
export function createCheckoutSession(params: { interval: 'month' | 'year'; token: string }): Promise<{ url: string }> {
  return request('/api/billing/checkout', { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + params.token }, body: JSON.stringify({ interval: params.interval }) });
}
export function createBillingPortal(token: string): Promise<{ url: string }> {
  return request('/api/billing/portal', { method: 'POST', headers: { Authorization: 'Bearer ' + token } });
}
export function claimReport(id: string, token: string): Promise<{ success: boolean; user_id: string }> {
  return request('/api/reports/' + encodeURIComponent(id) + '/claim', { method: 'POST', headers: { Authorization: 'Bearer ' + token } });
}
export interface MeReview {
  id: string;
  share_id: string;
  status: string;
  created_at: string;
  headline: string | null;
  moment_count: number;
  game_url: string | null;
  player_color: 'white' | 'black' | null;
  white_player: string | null;
  black_player: string | null;
}

export interface Allowance {
  limit: number;
  used: number;
  next_slot_at: string | null;
}

export interface Me {
  email: string | null;
  tier: 'free' | 'premium';
  /** Reviews; null for premium. */
  allowance: Allowance | null;
  /** Scans; null for premium. */
  scan_allowance: Allowance | null;
  chesscom_username: string | null;
  open_idea: OpenIdea | null;
  scans: Array<{ id: string; created_at: string; status: string; top_concept_id: ConceptId | null; games_with_concept: number }>;
  reviews: MeReview[];
  patterns: Array<{ concept: ConceptInfo; count: number }>;
}

export function getMe(token: string): Promise<Me> {
  return request('/api/me', { headers: { Authorization: 'Bearer ' + token }, cache: 'no-store' });
}

function authHeaders(token?: string | null): Record<string, string> {
  return token ? { Authorization: 'Bearer ' + token } : {};
}

export function startScan(username: string, token?: string | null): Promise<{ id: string; share_id: string; status: string }> {
  return request('/api/scans', { method: 'POST', headers: { 'Content-Type': 'application/json', ...authHeaders(token) }, body: JSON.stringify({ chesscom_username: username }) });
}
export function getScan(id: string): Promise<ScanDetail> {
  return request('/api/scans/' + encodeURIComponent(id), { cache: 'no-store' });
}
export function checkinScan(id: string, body: { concept_id: ConceptId; answer: Checkin['answer'] }, token?: string | null): Promise<{ checkin: Checkin }> {
  return request('/api/scans/' + encodeURIComponent(id) + '/checkin', { method: 'POST', headers: { 'Content-Type': 'application/json', ...authHeaders(token) }, body: JSON.stringify(body) });
}
export function claimScan(id: string, token: string): Promise<{ success: boolean }> {
  return request('/api/scans/' + encodeURIComponent(id) + '/claim', { method: 'POST', headers: authHeaders(token) });
}
