import { mkdirSync, writeFileSync } from 'node:fs';
import { parsePgn } from '../src/analysis/pgn.js';
import { sweepPositions } from '../src/analysis/sweep.js';
import { selectCandidateMoments } from '../src/analysis/select.js';
import { verifyCandidates } from '../src/analysis/verify.js';
import { enginePool } from '../src/uci/engine-pool.js';
import { supabase } from '../src/db/supabase.js';
import type { CandidateMoment, EloBand } from '../src/types.js';
import { REPRESENTATIVE_GAMES } from './representative-games.js';

/**
 * Freezes verified candidate moments (the Stockfish half of the pipeline) into
 * benchmark/fixtures.json. Model benchmarks then run anywhere, cost only LLM
 * tokens, and every model sees byte-identical input.
 *
 * Needs Stockfish and the database, so run it on the VPS:
 *   pnpm --filter @chessplain/engine benchmark:fixtures -- --production 20
 *
 * Production games contribute positions and moves only — player names are not
 * written, and the benchmark substitutes a neutral opponent name.
 */
export interface BenchmarkFixture {
  id: string;
  source: string;
  eloBand: EloBand;
  candidate: CandidateMoment;
}

const flag = process.argv.indexOf('--production');
const productionLimit = flag === -1 ? 20 : Number(process.argv[flag + 1]);

interface Game {
  source: string;
  pgn: string;
  eloBand: EloBand;
  targetPlayer?: string;
}

async function productionGames(limit: number): Promise<Game[]> {
  if (limit <= 0) return [];
  const { data, error } = await supabase
    .from('game_analyses')
    .select('id, elo_band, source_games(pgn, player_color, white_player, black_player)')
    .eq('status', 'completed')
    .order('created_at', { ascending: false })
    .limit(limit);
  if (error) throw error;
  type Row = {
    id: string;
    elo_band: EloBand | null;
    source_games: { pgn: string | null; player_color: string | null; white_player: string | null; black_player: string | null } | null;
  };
  return (data as unknown as Row[])
    .filter((row) => row.source_games?.pgn)
    .map((row) => {
      const src = row.source_games!;
      return {
        source: `prod-${row.id.slice(0, 8)}`,
        pgn: src.pgn!,
        eloBand: row.elo_band ?? '1000_1400',
        targetPlayer: (src.player_color === 'black' ? src.black_player : src.white_player) ?? undefined,
      };
    });
}

async function main() {
  const games: Game[] = [
    ...REPRESENTATIVE_GAMES.map((g) => ({ source: `rep-${g.name}`, pgn: g.pgn, eloBand: g.eloBand })),
    ...(await productionGames(productionLimit)),
  ];

  await enginePool.init();
  const fixtures: BenchmarkFixture[] = [];
  try {
    for (const game of games) {
      const parsed = parsePgn(game.pgn, game.targetPlayer);
      const evals = await sweepPositions(parsed.positions);
      const verified = await verifyCandidates(selectCandidateMoments(parsed.positions, evals, parsed.playerColor));
      for (const candidate of verified) {
        fixtures.push({ id: `${game.source}:${candidate.ply}`, source: game.source, eloBand: game.eloBand, candidate });
      }
      console.log(`${game.source}: ${verified.length} moments`);
    }
  } finally {
    await enginePool.shutdown();
  }

  mkdirSync(new URL('../benchmark/', import.meta.url), { recursive: true });
  writeFileSync(new URL('../benchmark/fixtures.json', import.meta.url), JSON.stringify(fixtures, null, 1) + '\n');
  console.log(`Wrote ${fixtures.length} fixtures from ${games.length} games.`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
