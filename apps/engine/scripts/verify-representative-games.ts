import { runAnalysisPipeline } from '../src/analysis/pipeline.js';
import { findBannedTokens } from '../src/analysis/prompts.js';
import { enginePool } from '../src/uci/engine-pool.js';
import type { EloBand, GameAnalysisReport, MomentReport } from '../src/types.js';

/**
 * Representative-game verification gate.
 *
 * Unlike verify-20-games.ts, this script never touches the chess.com public
 * API: every PGN is embedded below, so a run is deterministic and cannot be
 * derailed by rate limits or deleted handles. The set is tuned for the
 * product's audience (600-1200 Elo adult casual players), so each entry is a
 * scenario that actually shows up in their games.
 */
interface RepresentativeGame {
  /** stable key, also used for the analysis id */
  name: string;
  /** what the game is here to exercise */
  scenario: string;
  pgn: string;
  eloBand: EloBand;
}

const REPRESENTATIVE_GAMES: RepresentativeGame[] = [
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

/** Phrases no explanation may use about a queen sacrifice like the Opera Game. */
const FORBIDDEN_QUEEN_TRADE_PATTERNS = [/traded queens/i, /queen trade/i];

function momentText(moment: MomentReport): string {
  return [
    moment.played,
    moment.probable_thought,
    moment.what_actually_happens,
    moment.concept_name,
    moment.concept_definition,
    moment.takeaway,
  ].join('\n');
}

function reportText(report: GameAnalysisReport): string {
  const summary = report.summary;
  return [summary?.headline ?? '', summary?.story ?? '', summary?.focus_habit ?? '', ...report.moments.map(momentText)].join(
    '\n'
  );
}

function checkReport(game: RepresentativeGame, report: GameAnalysisReport): void {
  if (!report.summary) {
    throw new Error('Report has no summary');
  }
  if (!report.summary.headline?.trim()) {
    throw new Error('Summary headline is missing');
  }
  if (!report.summary.story?.trim()) {
    throw new Error('Summary story is missing');
  }
  // 0 moments is a valid outcome: selection needs a -1.5 pawn swing (or a
  // missed win), so a steadily played game legitimately produces none. What
  // must never happen is more moments than the report is designed to show.
  if (report.moments.length > 5) {
    throw new Error(`Invalid moments count: ${report.moments.length} (expected 0-5)`);
  }

  for (const moment of report.moments) {
    const words = moment.concept_definition.trim().split(/\s+/).filter(Boolean).length;
    if (words > 8) {
      throw new Error(`Concept definition exceeds 8 words (${words}): "${moment.concept_definition}"`);
    }
    const banned = [
      ...findBannedTokens(moment.probable_thought),
      ...findBannedTokens(moment.what_actually_happens),
      ...findBannedTokens(moment.takeaway),
    ];
    if (banned.length > 0) {
      throw new Error(`Banned token in moment: ${[...new Set(banned)].join(', ')}`);
    }
  }

  const bannedSummary = [
    ...findBannedTokens(report.summary.headline),
    ...findBannedTokens(report.summary.story),
    ...findBannedTokens(report.summary.focus_habit),
  ];
  if (bannedSummary.length > 0) {
    throw new Error(`Banned token in summary: ${[...new Set(bannedSummary)].join(', ')}`);
  }

  if (game.name === 'opera-game-1858') {
    const text = reportText(report);
    const hallucinated = FORBIDDEN_QUEEN_TRADE_PATTERNS.filter((pattern) => pattern.test(text)).map((p) => p.source);
    if (hallucinated.length > 0) {
      throw new Error(`Opera Game explanation invented a queen trade (matched: ${hallucinated.join(', ')})`);
    }
  }
}

async function main() {
  console.log('=== Chessplain representative-game verification gate (600-1200 Elo) ===');

  await enginePool.init();
  console.log(`Initialized Stockfish engine pool with ${enginePool.totalCount} workers.`);

  const durations: number[] = [];
  const errors: string[] = [];
  let successful = 0;
  let zeroMomentReports = 0;
  let totalMoments = 0;

  try {
    for (let i = 0; i < REPRESENTATIVE_GAMES.length; i++) {
      const game = REPRESENTATIVE_GAMES[i];
      console.log(`\n[Game ${i + 1}/${REPRESENTATIVE_GAMES.length}] ${game.name} — ${game.scenario}`);

      try {
        const start = Date.now();
        const result = await runAnalysisPipeline({
          pgn: game.pgn,
          eloBand: game.eloBand,
          analysisId: `verify-representative-${game.name}`,
        });
        const duration = Date.now() - start;
        durations.push(duration);

        checkReport(game, result.report);

        if (result.report.moments.length === 0) {
          zeroMomentReports++;
        }
        totalMoments += result.report.moments.length;
        successful++;
        console.log(
          `  PASS in ${(duration / 1000).toFixed(1)}s — ${result.report.moments.length} moments (${result.momentsCount} reported)`
        );
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        errors.push(`${game.name}: ${message}`);
        console.error(`  FAIL: ${message}`);
      }
    }
  } finally {
    await enginePool.shutdown();
  }

  const total = REPRESENTATIVE_GAMES.length;
  const sorted = [...durations].sort((a, b) => a - b);
  const median = sorted.length > 0 ? sorted[Math.floor(sorted.length / 2)] : 0;
  const slowest = sorted.length > 0 ? sorted[sorted.length - 1] : 0;

  console.log('\n================ VERIFICATION SUMMARY ================');
  console.log(`Games passed: ${successful}/${total}`);
  console.log(`Median duration: ${(median / 1000).toFixed(2)}s | Slowest: ${(slowest / 1000).toFixed(2)}s`);
  console.log(`Moments explained: ${totalMoments}`);
  console.log(`Zero-moment reports: ${zeroMomentReports}/${total} (valid outcome for the steady game)`);
  if (errors.length > 0) {
    console.log('\nFailures:\n' + errors.map((e) => `  - ${e}`).join('\n'));
    console.error(`\nGATE FAILED: ${errors.length}/${total} representative games failed.`);
    process.exit(1);
  }

  console.log('\nGATE PASSED: Every representative game produced a clean explanation.');
}

main().catch((err) => {
  console.error('Fatal verification script error:', err);
  process.exit(1);
});
