import { describe, expect, it, vi } from 'vitest';
import { conceptInfo } from '../src/analysis/concepts.js';
import { aggregate, analyzedScanGames, recordScanGame, type ScanGame, type ScanTurningPoint } from '../src/analysis/scan.js';

vi.mock('../src/config.js', () => ({
  config: { nodeEnv: 'test', staleLeaseMinutes: 15, llmModel: 'm', enginePoolSize: 1, engineHashMb: 16, engineThreads: 1 },
}));
vi.mock('../src/db/supabase.js', () => ({ supabase: { from: () => ({}) } }));
vi.mock('../src/uci/engine-pool.js', () => ({
  enginePool: { evaluate: async () => { throw new Error('unused'); }, init: async () => {}, shutdown: async () => {}, totalCount: 0, availableCount: 0 },
}));

const tp = (concept_id: ScanTurningPoint['concept_id'], eval_swing: number, ply = 8): ScanTurningPoint => ({
  ply, move_number: 4, san: 'Nf3', best_move: 'Qh5', eval_swing, concept_id,
});

function game(url: string, turning_points: ScanTurningPoint[]): ScanGame {
  return {
    url, ended_at: '2026-01-01T00:00:00.000Z', time_class: 'blitz', player_color: 'white',
    outcome: 'loss', opponent: 'opp', opponent_rating: 1200, player_rating: 1100,
    analyzed: true, turning_points,
  };
}

describe('aggregate', () => {
  it('counts a concept once per game and marks it recurring from the second game', () => {
    const result = aggregate([
      game('https://chess.com/a', [tp('hanging_piece', -2, 10), tp('hanging_piece', -1, 20)]),
      game('https://chess.com/b', [tp('hanging_piece', -3)]),
      game('https://chess.com/c', [tp('double_attack', -4)]),
    ]);
    expect(result.games_scanned).toBe(3);
    expect(result.nothing_decisive).toBe(false);
    expect(result.top).toEqual({
      concept: conceptInfo('hanging_piece'),
      games_with_concept: 2,
      recurring: true,
    });
    expect(result.concept_counts).toEqual([
      { concept_id: 'hanging_piece', games: 2 },
      { concept_id: 'double_attack', games: 1 },
    ]);
    expect(result.concept_counts.find(c => c.concept_id === 'double_attack')?.games).toBe(1);
    expect(result.top?.recurring).toBe(true);
  });

  it('breaks a game-count tie by total absolute eval swing', () => {
    const result = aggregate([
      game('https://chess.com/a', [tp('hanging_piece', -1)]),
      game('https://chess.com/b', [tp('hanging_piece', -1)]),
      game('https://chess.com/c', [tp('double_attack', -4)]),
      game('https://chess.com/d', [tp('double_attack', -4)]),
    ]);
    expect(result.top?.concept.id).toBe('double_attack');
    expect(result.top?.games_with_concept).toBe(2);
    expect(result.concept_counts[0].concept_id).toBe('double_attack');
  });

  it('picks the top concept’s largest swing, not a bigger swing of another concept', () => {
    const result = aggregate([
      game('https://chess.com/a', [tp('hanging_piece', -1, 12)]),
      game('https://chess.com/b', [tp('hanging_piece', -2.5, 30), tp('double_attack', -9, 40)]),
    ]);
    expect(result.example).toEqual({ game_url: 'https://chess.com/b', ply: 30, concept_id: 'hanging_piece' });
  });

  it('keeps the first equal swing, which is the earlier game in the list', () => {
    const result = aggregate([
      game('https://chess.com/newer', [tp('hanging_piece', -3, 10)]),
      game('https://chess.com/older', [tp('hanging_piece', 3, 22)]),
    ]);
    expect(result.example).toEqual({ game_url: 'https://chess.com/newer', ply: 10, concept_id: 'hanging_piece' });
  });

  it('uses the largest swing when turning points have no concept', () => {
    const result = aggregate([
      game('https://chess.com/a', [tp(null, -1, 6)]),
      game('https://chess.com/b', [tp(null, -4, 14)]),
    ]);
    expect(result.top).toBeNull();
    expect(result.concept_counts).toEqual([]);
    expect(result.nothing_decisive).toBe(false);
    expect(result.example).toEqual({ game_url: 'https://chess.com/b', ply: 14, concept_id: null });
  });

  it('keeps a failed game on the list and counts only games that were read', () => {
    const point = tp('hanging_piece', -2);
    const read = Array.from({ length: 9 }, (_, i) => recordScanGame(game(`https://chess.com/${i}`, []), [point]));
    const failed = recordScanGame(game('https://chess.com/bad', [point]), { error: true });
    const games = [...read, failed];

    expect(games).toHaveLength(10);
    expect(failed).toMatchObject({ analyzed: false, turning_points: [], error: true });
    const result = aggregate(analyzedScanGames(games));
    expect(result.games_scanned).toBe(9);
    expect(result.top?.games_with_concept).toBe(9);
    expect(result.example?.game_url).not.toBe('https://chess.com/bad');
  });

  it('is nothing decisive when no game has a turning point', () => {
    const result = aggregate([game('https://chess.com/a', []), game('https://chess.com/b', [])]);
    expect(result).toMatchObject({
      games_scanned: 2,
      top: null,
      concept_counts: [],
      example: null,
      nothing_decisive: true,
    });
  });
});
