export const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL || 'https://api.chessplain.com';

export interface SubmitReportPayload {
  pgn?: string;
  chesscom_username?: string;
  hero_variant?: string;
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
  };
}

export async function submitReport(payload: SubmitReportPayload, token?: string): Promise<SubmitReportResponse> {
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
  };
  if (token) {
    headers['Authorization'] = `Bearer ${token}`;
  }

  const res = await fetch(`${API_BASE_URL}/api/reports`, {
    method: 'POST',
    headers,
    body: JSON.stringify(payload),
  });

  if (res.status === 402) {
    const errData = await res.json();
    throw new Error(errData.message || 'Free quota exceeded');
  }

  if (!res.ok) {
    const errData = await res.json().catch(() => ({}));
    throw new Error(errData.error || 'Failed to submit report');
  }

  return res.json();
}

export async function getReportById(id: string): Promise<ReportDetail> {
  const res = await fetch(`${API_BASE_URL}/api/reports/${id}`, {
    cache: 'no-store',
  });
  if (!res.ok) {
    throw new Error('Report not found');
  }
  return res.json();
}

export async function getReportByShareId(shareId: string): Promise<ReportDetail> {
  const res = await fetch(`${API_BASE_URL}/api/reports/share/${shareId}`, {
    cache: 'no-store',
  });
  if (!res.ok) {
    throw new Error('Report not found');
  }
  return res.json();
}

export async function createCheckoutSession(params: {
  interval: 'month' | 'year';
  userId?: string;
  customerEmail?: string;
  returnUrl?: string;
}): Promise<{ url: string }> {
  const res = await fetch(`${API_BASE_URL}/api/billing/checkout`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      interval: params.interval,
      user_id: params.userId,
      customer_email: params.customerEmail,
      return_url: params.returnUrl,
    }),
  });

  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    throw new Error(data.error || 'Failed to create checkout session');
  }

  return res.json();
}

export async function claimReport(id: string, token: string): Promise<{ success: boolean; user_id: string }> {
  const res = await fetch(`${API_BASE_URL}/api/reports/${id}/claim`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${token}`,
    },
  });

  if (!res.ok) {
    throw new Error('Failed to claim report');
  }

  return res.json();
}
