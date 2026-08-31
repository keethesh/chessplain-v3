export type EloBand = 'under_1000' | '1000_1400' | 'above_1400';
export type SeverityLabel = 'Turning point' | 'Last chance' | 'Missed win' | 'Quiet drift';
export type GamePhase = 'opening' | 'middlegame' | 'endgame';

export interface MultiPvInfo {
  multipv: number;
  depth: number;
  scoreCp?: number;
  scoreMate?: number;
  evalPawns: number;
  pv: string;
  bestMove: string;
}

export interface EngineEvalResult {
  fen: string;
  evalPawns: number; // in White's perspective
  bestMove: string;
  pv: string;
  multipv: MultiPvInfo[];
  depth?: number;
  nodes?: number;
}

export interface PositionInfo {
  ply: number;
  moveNumber: number;
  san: string;
  uci: string;
  fenBefore: string;
  fenAfter: string;
  playerColor: 'white' | 'black';
  isPlayerMove: boolean;
}

export interface CandidateMoment {
  ply: number;
  moveNumber: number;
  san: string; // e.g. "23.Bxf7+"
  fenBefore: string;
  fenAfter: string;
  playerColor: 'white' | 'black';
  evalBefore: number; // in player's perspective
  evalAfter: number;  // in player's perspective
  swing: number;      // evalAfter - evalBefore (negative for mistake)
  bestMoveSan: string;
  bestMoveUci: string;
  refutationLineSan: string;
  phase: GamePhase;
  materialNote: string;
  candidateType: SeverityLabel;
  verified?: boolean;
}

export interface MomentExplanation {
  played: string;
  probable_thought: string;
  what_actually_happens: string;
  concept_name: string;
  concept_definition: string;
  takeaway: string;
  severity_label: SeverityLabel;
}

export interface GameSummary {
  headline: string;
  story: string;
  focus_habit: string;
}

export interface MomentReport extends MomentExplanation {
  ply: number;
  move_number: number;
  fen_before: string;
  fen_after: string;
  player_color: 'white' | 'black';
  best_move: string;
  refutation_line: string;
  eval_swing: number;
}

export interface GameAnalysisReport {
  id: string;
  share_id: string;
  status: 'pending' | 'sweeping' | 'verifying' | 'explaining' | 'completed' | 'failed';
  user_id?: string | null;
  elo_band?: EloBand;
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
}
