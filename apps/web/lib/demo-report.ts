import { Chess } from 'chess.js';
import type { ReportDetail } from './api';

// Illustrative teaching example, not a customer report: the Opera Game (Paul
// Morphy against the Duke of Brunswick and Count Isouard, Paris 1858), read
// from Black's side. Evaluations quoted below come from Stockfish 18 at depth
// 18-20 and are approximate.
const MOVES = 'e4 e5 Nf3 d6 d4 Bg4 dxe5 Bxf3 Qxf3 dxe5 Bc4 Nf6 Qb3 Qe7 Nc3 c6 Bg5 b5 Nxb5 cxb5 Bxb5+ Nbd7 O-O-O Rd8 Rxd7 Rxd7 Rd1 Qe6 Bxd7+ Nxd7 Qb8+ Nxb8 Rd8#'.split(' ');

function pgn(): string {
  return MOVES.map((san, i) => (i % 2 ? san : `${i / 2 + 1}. ${san}`)).join(' ') + ' 1-0';
}
export const DEMO_PGN = pgn();

/** The position before and after the half-move at `index` (0-based). */
function around(index: number) {
  const game = new Chess();
  for (const san of MOVES.slice(0, index)) game.move(san);
  const before = game.fen();
  game.move(MOVES[index]);
  return { before, after: game.fen() };
}

const nf6 = around(11);
const b5 = around(17);

export const DEMO_REPORT: ReportDetail = {
  id: 'demo', share_id: 'demo-sample',
  player_name: 'Duke and Count', opponent_name: 'Paul Morphy',
  player_color: 'black', move_count: 17, result: '1-0', status: 'completed',
  created_at: '2026-09-01T12:00:00Z', source_games: { pgn: DEMO_PGN },
  summary: {
    headline: 'Two natural moves, each one already outnumbered.',
    story: 'Move 6 developed a knight into a double attack from White’s queen. At move 9, a pawn push to b5 met three attackers against one defender. After that, White’s forcing sacrifices finished the game.',
    focus_habit: 'Before every move, count what your opponent’s pieces attack and what you defend.',
  },
  moments: [
    {
      ply: 12, move_number: 6, played: 'Nf6', fen_before: nf6.before, fen_after: nf6.after,
      player_color: 'black', best_move: 'Qf6', refutation_line: '7. Qb3 Bc5 8. Bxf7+ Ke7 9. Bc4', eval_swing: 148,
      severity_label: 'Turning point',
      probable_thought: 'The knight develops to f6 and attacks the pawn on e4.',
      what_actually_happens: 'After Qb3 the queen lines up behind the bishop on c4 against f7, and also hits the loose pawn on b7. Black cannot cover both: leaving f7 allows Bxf7+ with check, and defending it leaves b7 hanging.',
      why_better: 'Qf6 develops the queen and defends f7 directly, so Qb3 would only attack the pawn on b7.',
      concept_name: 'Double attack',
      concept_definition: 'one move making two threats',
      takeaway: 'Before you develop a piece, look for the square where the opponent’s queen could attack two things at once.',
    },
    {
      ply: 18, move_number: 9, played: 'b5', fen_before: b5.before, fen_after: b5.after,
      player_color: 'black', best_move: 'Kd8', refutation_line: '10. Nxb5 cxb5 11. Bxb5+ Nbd7 12. O-O-O Rd8', eval_swing: 171,
      severity_label: 'Last chance',
      probable_thought: 'The pawn advances to b5 and attacks the bishop on c4.',
      what_actually_happens: 'The pawn on b5 is attacked three times and defended once. After Nxb5 cxb5 Bxb5+, White has two pawns for the knight, with check, and the knight on f6 stays pinned by the bishop on g5.',
      why_better: 'Kd8 looks odd, but the king walks to c7, behind the b7 and c6 pawns, and the queenside stays closed instead of opening onto it.',
      concept_name: 'Attackers and defenders',
      concept_definition: 'pieces attacking a square versus defending it',
      takeaway: 'Before you push a pawn, count the pieces that attack its new square and the pieces that defend it.',
    },
  ],
};
