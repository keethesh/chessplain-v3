import type { EloBand } from '../src/types.js';

/** Embedded games tuned for the 600-1200 audience; shared by the verification gate and benchmark fixtures. */
export interface RepresentativeGame {
  /** stable key, also used for the analysis id */
  name: string;
  /** what the game is here to exercise */
  scenario: string;
  pgn: string;
  eloBand: EloBand;
}

export const REPRESENTATIVE_GAMES: RepresentativeGame[] = [
  {
    name: 'hanging-bishop-c4',
    scenario: 'Hanging minor piece in one move: White leaves the light bishop on c4 en prise to ...dxc4',
    eloBand: '1000_1400',
    pgn: `[Event "Casual rapid"]
[Site "chess.com"]
[Date "2026.03.14"]
[Round "-"]
[White "AvaRivera"]
[Black "mike_knight99"]
[Result "0-1"]

1. e4 e5 2. Nf3 Nc6 3. Bc4 Bc5 4. c3 Nf6 5. d4 exd4 6. cxd4 Bb4+ 7. Nc3 Nxe4 8. O-O Bxc3 9. bxc3 d5 10. Bg5 dxc4 11. Bxd8 Nxd8 12. Re1 Be6 13. Ne5 O-O 14. Nd3 Nd6 15. Re3 Rfe8 16. Qe2 b6 17. Rae1 Nf5 18. Rd1 Nxd4 19. Nf4 0-1`,
  },
  {
    name: 'knight-fork-c7',
    scenario: 'Royal knight fork: Nxc7+ forks the king on e8 and the rook on a8, and the knight is trapped afterwards',
    eloBand: '1000_1400',
    pgn: `[Event "Casual blitz"]
[Site "chess.com"]
[Date "2026.04.02"]
[Round "-"]
[White "dev_anika"]
[Black "PauliePushes"]
[Result "1-0"]

1. e4 e5 2. Nf3 Nc6 3. Bc4 Bc5 4. d3 Nf6 5. Nc3 d6 6. Bg5 h6 7. Bxf6 Qxf6 8. Nb5 a6 9. Nxc7+ Ke7 10. Nxa8 b6 11. c3 Bd7 12. Nb6 Bxb6 13. O-O Qe6 14. Re1 Kd8 15. Bd5 Qe7 16. Bb3 Na5 17. Nd4 Nxb3 18. axb3 Qe6 19. Nf3 1-0`,
  },
  {
    name: 'scholars-mate',
    scenario: "Scholar's mate / early queen sortie blunder: the f7 square is never defended",
    eloBand: 'under_1000',
    pgn: `[Event "Casual rapid"]
[Site "chess.com"]
[Date "2026.02.21"]
[Round "-"]
[White "new2chess88"]
[Black "TomRiddle2020"]
[Result "1-0"]

1. e4 e5 2. Qh5 Nc6 3. Bc4 Nf6 4. Qxf7# 1-0`,
  },
  {
    name: 'back-rank-net',
    scenario: 'Back-rank net blunder: White trades the g-pawn and never makes luft, so the king is mated on its own back rank',
    eloBand: 'under_1000',
    pgn: `[Event "Casual rapid"]
[Site "chess.com"]
[Date "2026.01.09"]
[Round "-"]
[White "sunday_player"]
[Black "ShillingFan"]
[Result "0-1"]

1. e4 e5 2. Nf3 Nc6 3. Bc4 Nd4 4. Nxe5 Qg5 5. Nxf7 Qxg2 6. Rf1 Qxe4+ 7. Be2 Nf3# 0-1`,
  },
  {
    name: 'queen-blunder-g6',
    scenario: 'Queen blunder: White snaps off the g6 pawn and loses the queen to the h-pawn',
    eloBand: 'under_1000',
    pgn: `[Event "Casual blitz"]
[Site "chess.com"]
[Date "2026.05.17"]
[Round "-"]
[White "pawnstorm_amy"]
[Black "quietKing"]
[Result "0-1"]

1. e4 e5 2. Qh5 Nc6 3. Bc4 g6 4. Qxg6 hxg6 5. Nf3 Bg7 6. O-O Nf6 7. d3 O-O 8. Nc3 d6 9. Bg5 Be6 10. Bb3 Qd7 11. Nd5 Bxd5 12. Bxd5 Rab8 13. c3 Ne7 14. Bxf6 Bxf6 15. Rac1 Nf5 16. Bb3 c6 17. h3 Rbe8 18. Rfe1 0-1`,
  },
  {
    name: 'missed-fork-win',
    scenario: 'Missed winning tactic: White castles instead of playing the winning Nxc7+ fork and drops a clean win',
    eloBand: '1000_1400',
    pgn: `[Event "Casual rapid"]
[Site "chess.com"]
[Date "2026.06.11"]
[Round "-"]
[White "castles_first"]
[Black "endgame_ella"]
[Result "0-1"]

1. e4 e5 2. Nf3 Nc6 3. Bc4 Bc5 4. d3 Nf6 5. Nc3 d6 6. Bg5 h6 7. Bxf6 Qxf6 8. Nb5 a6 9. O-O axb5 10. Bxb5 O-O 11. c3 Bg4 12. h3 Bxf3 13. Qxf3 Qxf3 14. gxf3 Bb6 15. d4 exd4 16. cxd4 Rad8 0-1`,
  },
  {
    name: 'opera-game-1858',
    scenario: 'Regression case: the Opera Game. Move 9...b5 starts a queen sacrifice, so no explanation may claim the queens were traded',
    eloBand: 'above_1400',
    pgn: `[Event "Opera Game"]
[Site "Paris FRA"]
[Date "1858.??.??"]
[Round "?"]
[White "Morphy, Paul"]
[Black "Duke Karl / Count Isouard"]
[Result "1-0"]

1. e4 e5 2. Nf3 d6 3. d4 Bg4 4. dxe5 Bxf3 5. Qxf3 dxe5 6. Bc4 Nf6 7. Qb3 Qe7 8. Nc3 c6 9. Bg5 b5 10. Nxb5 cxb5 11. Bxb5+ Nbd7 12. O-O-O Rd8 13. Rxd7 Rxd7 14. Rd1 Qe6 15. Bxd7+ Nxd7 16. Qb8+ Nxb8 17. Rd8# 1-0`,
  },
  {
    name: 'steady-draw',
    scenario: 'Steady game with no major swings: queens come off early and nothing swings past the moment threshold (zero moments is a valid report)',
    eloBand: '1000_1400',
    pgn: `[Event "Casual rapid"]
[Site "chess.com"]
[Date "2026.07.30"]
[Round "-"]
[White "slow_mover"]
[Black "trades_early"]
[Result "1/2-1/2"]

1. d4 d5 2. Nf3 Nf6 3. e3 e6 4. Bd3 c5 5. c3 Nc6 6. Nbd2 Bd6 7. O-O O-O 8. dxc5 Bxc5 9. e4 dxe4 10. Nxe4 Nxe4 11. Bxe4 Qxd1 12. Rxd1 Bd7 13. Kf1 Rac8 14. Ke2 Ne7 15. Bd2 Bb6 16. b4 h6 17. a4 Rfd8 18. a5 Bc7 19. h3 1/2-1/2`,
  },
];
