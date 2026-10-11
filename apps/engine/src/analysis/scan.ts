import { conceptInfo, classifyMoment, type ConceptId, type ConceptInfo } from './concepts.js';
import { parsePgn } from './pgn.js';
import { selectCandidateMoments } from './select.js';
import { sweepPositions } from './sweep.js';
import { verifyCandidates } from './verify.js';

export type Outcome = 'win' | 'loss' | 'draw';

export interface ScanTurningPoint {
  ply: number;
  move_number: number;
  san: string;
  best_move: string;
  eval_swing: number;
  concept_id: ConceptId | null;
}

export interface ScanGame {
  url: string;
  ended_at: string;
  time_class: 'rapid' | 'blitz' | 'daily';
  player_color: 'white' | 'black';
  outcome: Outcome;
  opponent: string;
  opponent_rating: number | null;
  player_rating: number | null;
  analyzed: boolean;
  turning_points: ScanTurningPoint[];
}

export interface ScanResult {
  games_scanned: number;
  top: null | { concept: ConceptInfo; games_with_concept: number; recurring: boolean };
  concept_counts: Array<{ concept_id: ConceptId; games: number }>;
  example: null | { game_url: string; ply: number; concept_id: ConceptId | null };
  nothing_decisive: boolean;
}

export interface Checkin {
  concept_id: ConceptId;
  answer: 'remembered' | 'forgot' | 'did_not_come_up';
  at: string;
}

/** One game: sweep, select without the quiet-drift fallback, verify, classify. No LLM. */
export async function analyzeScanGame(
  pgn: string,
  player: { username: string; color: 'white' | 'black' },
): Promise<ScanTurningPoint[]> {
  let parsed = parsePgn(pgn, player.username);
  if (parsed.playerColor !== player.color) {
    const name = player.color === 'white' ? parsed.headers['White'] : parsed.headers['Black'];
    parsed = parsePgn(pgn, name);
  }
  const evalMap = await sweepPositions(parsed.positions);
  const picked = selectCandidateMoments(parsed.positions, evalMap, parsed.playerColor, { quietDriftFallback: false });
  const verified = await verifyCandidates(picked);
  return verified.filter((c) => c.candidateType !== 'Quiet drift').map((c) => ({
    ply: c.ply,
    move_number: c.moveNumber,
    san: c.san.replace(/^\d+\.(\.\.)?/, ''), // candidate san carries "26." / "26..."; the UI formats move numbers itself
    best_move: c.bestMoveSan,
    eval_swing: c.swing,
    concept_id: classifyMoment(c),
  }));
}

/**
 * Top concept is the one present in the most games (once per game). Ties go to
 * the larger total |eval swing|, then concept id. The example is that concept's
 * biggest swing, or the biggest swing of any turning point when nothing classified.
 */
export function aggregate(games: ScanGame[]): ScanResult {
  const stats = new Map<ConceptId, { games: number; swing: number }>();
  const bestOf = new Map<ConceptId, { game_url: string; ply: number; concept_id: ConceptId; abs: number }>();
  let any = false;
  let largest: { game_url: string; ply: number; concept_id: ConceptId | null; abs: number } | null = null;

  for (const game of games) {
    const seen = new Set<ConceptId>();
    for (const tp of game.turning_points) {
      any = true;
      const abs = Math.abs(tp.eval_swing);
      if (!largest || abs > largest.abs) {
        largest = { game_url: game.url, ply: tp.ply, concept_id: tp.concept_id, abs };
      }
      if (!tp.concept_id) continue;
      const row = stats.get(tp.concept_id) ?? { games: 0, swing: 0 };
      row.swing += abs;
      if (!seen.has(tp.concept_id)) {
        seen.add(tp.concept_id);
        row.games += 1;
      }
      stats.set(tp.concept_id, row);
      const prev = bestOf.get(tp.concept_id);
      if (!prev || abs > prev.abs) {
        bestOf.set(tp.concept_id, { game_url: game.url, ply: tp.ply, concept_id: tp.concept_id, abs });
      }
    }
  }

  const ranked = [...stats.entries()]
    .filter(([, row]) => row.games > 0)
    .sort((a, b) => b[1].games - a[1].games || b[1].swing - a[1].swing || (a[0] < b[0] ? -1 : a[0] > b[0] ? 1 : 0));

  const topId = ranked[0]?.[0];
  const topRow = topId ? stats.get(topId) : undefined;
  const concept = topId ? conceptInfo(topId) : null;
  const exampleSource = concept && topId ? bestOf.get(topId) : largest;

  return {
    games_scanned: games.length,
    top: concept && topRow ? {
      concept,
      games_with_concept: topRow.games,
      recurring: topRow.games >= 2,
    } : null,
    concept_counts: ranked.map(([concept_id, row]) => ({ concept_id, games: row.games })),
    example: exampleSource
      ? { game_url: exampleSource.game_url, ply: exampleSource.ply, concept_id: exampleSource.concept_id }
      : null,
    nothing_decisive: !any,
  };
}
