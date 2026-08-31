import { fetchRecentChessComGame } from '../src/analysis/chesscom.js';
import { runAnalysisPipeline } from '../src/analysis/pipeline.js';
import { findBannedTokens } from '../src/analysis/prompts.js';
import { enginePool } from '../src/uci/engine-pool.js';

const TEST_USERNAMES = [
  'hikaru',
  'magnuscarlsen',
  'naroditsky',
  'firouzja2003',
  'erigaisi',
  'nihalsarin',
  'botez',
  'chessbrah',
  'gothamchess',
  'danyanyam',
  'alireza2003',
  'danielnaroditsky',
  'speedypawn',
  'ericrosen',
  'annacramling',
  'alexandrabotez',
  'andreabotez',
  'andrewtang',
  'hansontwitch',
  'fabianocaruana',
];

// Fallback sample PGNs in case of API rate limits or network issues
const SAMPLE_PGNS = [
  `[Event "Live Chess"]
[Site "Chess.com"]
[Date "2026.08.31"]
[White "Player1"]
[Black "Player2"]
[Result "0-1"]
[WhiteElo "1150"]
[BlackElo "1180"]
[TimeControl "600"]

1. e4 e5 2. Nf3 Nc6 3. Bc4 Bc5 4. c3 Nf6 5. d4 exd4 6. cxd4 Bb4+ 7. Bd2 Bxd2+ 8. Nbxd2 d5 9. exd5 Nxd5 10. Qb3 Nce7 11. O-O O-O 12. Rfe1 c6 13. Ne4 Nb6 14. Bd3 Ned5 15. Nc5 Rb8 16. Rad1 Bg4 17. Be4 Qf6 18. h3 Bh5 19. a4 Qd6 20. a5 Nd7 21. Nxd7 Qxd7 22. Ne5 Qd6 23. Bxf7+ Bxf7 24. Nxf7 Rxf7 25. Re5 Rbf8 26. f3 Kh8 27. Rde1 h6 28. Qc2 Nf4 29. R1e4 Qg6 30. Kh2 Rf5 31. Rd3 Nxd3 32. Qxd3 R5f6 33. Qe3 Rd6 34. Re7 Rf7 35. Re8+ Kh7 36. Ra8 a6 37. Qe8 Qf5 38. h4 Qf4+ 39. Kh3 Qf5+ 40. Kh2 Rxd4 0-1`,
];

async function main() {
  console.log('=== Starting Chessplain v3 20-Game Verification Gate ===');

  await enginePool.init();
  console.log(`Initialized Stockfish engine pool with ${enginePool.totalCount} workers.`);

  const latencies: number[] = [];
  let successful = 0;
  let failed = 0;
  const errors: string[] = [];

  for (let i = 0; i < 20; i++) {
    const user = TEST_USERNAMES[i % TEST_USERNAMES.length];
    console.log(`\n[Game ${i + 1}/20] Fetching game for '${user}'...`);

    let pgn = '';
    let eloBand: any = '1000_1400';
    let playerColor: 'white' | 'black' = 'white';

    try {
      const fetched = await fetchRecentChessComGame(user);
      pgn = fetched.pgn;
      eloBand = fetched.eloBand;
      playerColor = fetched.playerColor;
    } catch (err) {
      console.warn(`Could not fetch live game for ${user}, using fallback sample PGN:`, err);
      pgn = SAMPLE_PGNS[i % SAMPLE_PGNS.length];
    }

    try {
      const start = Date.now();
      const result = await runAnalysisPipeline({
        pgn,
        eloBand,
        analysisId: `verify-${i + 1}`,
      });
      const duration = Date.now() - start;
      latencies.push(duration);

      const report = result.report;

      // Assertions
      if (!report.summary?.headline) {
        throw new Error('Missing headline in summary');
      }
      if (report.moments.length < 1 || report.moments.length > 5) {
        throw new Error(`Invalid moments count: ${report.moments.length} (expected 1-5)`);
      }

      for (const m of report.moments) {
        const words = m.concept_definition.trim().split(/\s+/).length;
        if (words > 8) {
          throw new Error(`Concept definition exceeds 8 words (${words} words): "${m.concept_definition}"`);
        }
        const banned = [
          ...findBannedTokens(m.probable_thought),
          ...findBannedTokens(m.what_actually_happens),
          ...findBannedTokens(m.takeaway),
        ];
        if (banned.length > 0) {
          throw new Error(`Banned token found in moment: ${banned.join(', ')}`);
        }
      }

      if (report.summary) {
        const bannedSummary = [
          ...findBannedTokens(report.summary.headline),
          ...findBannedTokens(report.summary.story),
          ...findBannedTokens(report.summary.focus_habit),
        ];
        if (bannedSummary.length > 0) {
          throw new Error(`Banned token found in summary: ${bannedSummary.join(', ')}`);
        }
      }

      successful++;
      console.log(`✓ Game ${i + 1} passed in ${(duration / 1000).toFixed(1)}s (${report.moments.length} moments)`);
    } catch (err) {
      failed++;
      const msg = err instanceof Error ? err.message : String(err);
      errors.push(`Game ${i + 1} (${user}): ${msg}`);
      console.error(`✗ Game ${i + 1} failed:`, msg);
    }
  }

  latencies.sort((a, b) => a - b);
  const medianLatency = latencies.length > 0 ? latencies[Math.floor(latencies.length / 2)] : 0;

  console.log('\n================ VERIFICATION SUMMARY ================');
  console.log(`Success rate: ${successful}/20 (${(successful / 20) * 100}%)`);
  console.log(`Median Latency: ${(medianLatency / 1000).toFixed(2)}s (Target <= 30s)`);
  if (errors.length > 0) {
    console.log('\nFailures:\n' + errors.map((e) => `  - ${e}`).join('\n'));
  }

  await enginePool.shutdown();

  if (successful < 19) {
    console.error(`\nGATE FAILED: Success rate ${successful}/20 is below 19/20 requirement.`);
    process.exit(1);
  }

  console.log('\nGATE PASSED: Engine verification completed successfully!');
}

main().catch((err) => {
  console.error('Fatal verification script error:', err);
  process.exit(1);
});
