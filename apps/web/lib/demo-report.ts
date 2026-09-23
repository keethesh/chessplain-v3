import { Chess } from 'chess.js';
import type { ReportDetail } from './api';

// Illustrative teaching example, not a customer report or engine benchmark.
export const DEMO_PGN = '1. e4 e5 2. Bc4 Nc6 3. Qh5 Nf6 4. Qxf7# 1-0';
const game = new Chess();
for (const move of ['e4', 'e5', 'Bc4', 'Nc6', 'Qh5']) game.move(move);
const fenBefore = game.fen();
game.move('Nf6');

export const DEMO_REPORT: ReportDetail = {
  id: 'demo', share_id: 'demo-sample', player_name: 'Black', opponent_name: 'White',
  player_color: 'black', move_count: 4, result: '1-0', status: 'completed',
  created_at: '2026-09-01T12:00:00Z', source_games: { pgn: DEMO_PGN },
  summary: {
    headline: 'You attacked the queen. The threat was checkmate.',
    story: 'Developing a knight with an attack on the queen looks useful. But after 3…Nf6, White can ignore the attack: the queen takes on f7, supported by the bishop on c4, and delivers checkmate.',
    focus_habit: 'Before attacking a piece, check whether your opponent already has a check or a mating threat.',
  },
  moments: [{
    ply: 6, move_number: 3, played: 'Nf6', fen_before: fenBefore, fen_after: game.fen(),
    player_color: 'black', best_move: 'Qe7', refutation_line: '4. Qxf7#', eval_swing: 0,
    severity_label: 'Turning point',
    probable_thought: 'The knight develops to f6 and attacks the queen on h5.',
    what_actually_happens: 'White plays Qxf7#. The bishop on c4 protects the queen, so your king cannot capture it. The king has no safe escape and the adjacent queen check cannot be blocked.',
    concept_name: 'A threat comes first',
    concept_definition: 'An attack on a piece only gains time if your opponent needs to answer it.',
    takeaway: 'Check your opponent’s forcing moves before making a threat of your own.',
  }],
};
