import { runAnalysisPipeline } from '../src/analysis/pipeline.js';
import { findBannedTokens } from '../src/analysis/prompts.js';
import { enginePool } from '../src/uci/engine-pool.js';
import type { GameAnalysisReport, MomentReport } from '../src/types.js';
import { REPRESENTATIVE_GAMES, type RepresentativeGame } from './representative-games.js';

/**
 * Representative-game verification gate.
 *
 * Unlike verify-20-games.ts, this script never touches the chess.com public
 * API: every PGN is embedded in representative-games.ts, so a run is deterministic and cannot be
 * derailed by rate limits or deleted handles. The set is tuned for the
 * product's audience (600-1200 Elo adult casual players), so each entry is a
 * scenario that actually shows up in their games.
 */

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
