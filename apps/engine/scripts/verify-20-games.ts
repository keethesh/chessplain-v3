import { fetchRecentChessComGame } from '../src/analysis/chesscom.js';
import { runAnalysisPipeline } from '../src/analysis/pipeline.js';
import { findBannedTokens } from '../src/analysis/prompts.js';
import { enginePool } from '../src/uci/engine-pool.js';

const TEST_USERNAMES = [
  'hikaru',
  'magnuscarlsen',
  'firouzja2003',
  'nihalsarin',
  'gothamchess',
  'alexandrabotez',
  'andreabotez',
  'andrewtang',
  'hansontwitch',
  'fabianocaruana',
  'danielnaroditsky',
  'anishgiri',
  'wonderfultime',
  'levonaronian',
  'viditchess',
  'agadmator',
  'chessnetwork',
  'thechesswebsite',
  'erik',
  'samshankchess',
];

const VALID_SAMPLE_PGNS = [
  `[Event "F/S Return Match"]
[Site "Belgrade, Serbia JUG"]
[Date "1992.11.04"]
[Round "29"]
[White "Fischer, Robert J."]
[Black "Spassky, Boris V."]
[Result "1/2-1/2"]

1. e4 e5 2. Nf3 Nc6 3. Bb5 a6 4. Ba4 Nf6 5. O-O Be7 6. Re1 b5 7. Bb3 d6 8. c3 O-O 9. h3 Nb8 10. d4 Nbd7 11. c4 c6 12. cxb5 axb5 13. Nc3 Bb7 14. Bg5 b4 15. Nb1 h6 16. Bh4 c5 17. dxe5 Nxe4 18. Bxe7 Qxe7 19. exd6 Qf6 20. Nbd2 Nxd6 21. Nc4 Nxc4 22. Bxc4 Nb6 23. Ne5 Rae8 24. Bxf7+ Rxf7 25. Nxf7 Rxe1+ 26. Qxe1 Kxf7 27. Qe3 Qg5 28. Qxg5 hxg5 29. b3 Ke6 30. a3 Kd6 31. axb4 cxb4 32. Ra5 Nd5 33. f3 Bc8 34. Kf2 Bf5 35. Ra7 g6 36. Ra6+ Kc5 37. Ke1 Nf4 38. g3 Nxh3 39. Kd2 Kb5 40. Rd6 Kc5 41. Ra6 Nf2 42. g4 Bd3 43. Re6 1/2-1/2`,
  `[Event "World Championship 28th"]
[Site "Reykjavik ISL"]
[Date "1972.07.23"]
[Round "6"]
[White "Fischer, Robert J."]
[Black "Spassky, Boris V."]
[Result "1-0"]

1. c4 e6 2. Nf3 d5 3. d4 Nf6 4. Nc3 Be7 5. Bg5 O-O 6. e3 h6 7. Bh4 b6 8. cxd5 Nxd5 9. Bxe7 Qxe7 10. Nxd5 exd5 11. Rc1 Be6 12. Qa4 c5 13. Qa3 Rc8 14. Bb5 a6 15. dxc5 bxc5 16. O-O Ra7 17. Be2 Nd7 18. Nd4 Qf8 19. Nxe6 fxe6 20. e4 d4 21. f4 Qe7 22. e5 Rb8 23. Bc4 Kh8 24. Qh3 Nf8 25. b3 a5 26. f5 exf5 27. Rxf5 Nh7 28. Rcf1 Qd8 29. Qg3 Re7 30. h4 Rbb7 31. e6 Rbc7 32. Qe5 Qe8 33. a4 Qd8 34. R1f2 Qe8 35. R2f3 Qd8 36. Bd3 Qe8 37. Qe4 Nf6 38. Rxf6 gxf6 39. Rxf6 Kg8 40. Bc4 Kh8 41. Qf4 1-0`,
  `[Event "Opera Game"]
[Site "Paris FRA"]
[Date "1858.??.??"]
[Round "?"]
[White "Morphy, Paul"]
[Black "Duke Karl / Count Isouard"]
[Result "1-0"]

1. e4 e5 2. Nf3 d6 3. d4 Bg4 4. dxe5 Bxf3 5. Qxf3 dxe5 6. Bc4 Nf6 7. Qb3 Qe7 8. Nc3 c6 9. Bg5 b5 10. Nxb5 cxb5 11. Bxb5+ Nbd7 12. O-O-O Rd8 13. Rxd7 Rxd7 14. Rd1 Qe6 15. Bxd7+ Nxd7 16. Qb8+ Nxb8 17. Rd8# 1-0`,
];

async function main() {
  console.log('=== Starting Chessplain v3 20-Game Verification Gate ===');

  await enginePool.init();
  console.log(`Initialized Stockfish engine pool with ${enginePool.totalCount} workers.`);

  const latencies: number[] = [];
  let successful = 0;
  let failed = 0;
  let usedSamples = 0;
  const errors: string[] = [];

  for (let i = 0; i < 20; i++) {
    const user = TEST_USERNAMES[i % TEST_USERNAMES.length];
    console.log(`\n[Game ${i + 1}/20] Fetching game for '${user}'...`);

    let pgn = '';
    let eloBand: any = '1000_1400';

    try {
      const fetched = await fetchRecentChessComGame(user);
      pgn = fetched.pgn;
      eloBand = fetched.eloBand;
    } catch (err) {
      console.warn(`Live game fetch for ${user} unavailable, using fallback sample game:`, err instanceof Error ? err.message : err);
      usedSamples++;
      pgn = VALID_SAMPLE_PGNS[i % VALID_SAMPLE_PGNS.length];
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
  console.log(`Sample fallbacks used: ${usedSamples}/20`);
  if (errors.length > 0) {
    console.log('\nFailures:\n' + errors.map((e) => `  - ${e}`).join('\n'));
  }

  await enginePool.shutdown();

  if (successful < 19) {
    console.error(`\nGATE FAILED: Success rate ${successful}/20 is below 19/20 requirement.`);
    process.exit(1);
  }
  if (usedSamples > 2) {
    console.error(`\nGATE FAILED: ${usedSamples}/20 games used bundled samples — live chess.com fetching is broken.`);
    process.exit(1);
  }
  if (medianLatency > 30_000) {
    console.error(`\nGATE FAILED: Median latency ${(medianLatency / 1000).toFixed(2)}s exceeds the 30s target.`);
    process.exit(1);
  }

  console.log('\nGATE PASSED: Engine verification completed successfully!');
}

main().catch((err) => {
  console.error('Fatal verification script error:', err);
  process.exit(1);
});
