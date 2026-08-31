import { Chess } from 'chess.js';
import { CandidateMoment, EngineEvalResult, PositionInfo, SeverityLabel } from '../types.js';
import { computeGamePhase, computeMaterialNote } from './pgn.js';

export function uciToSan(fen: string, uciMove: string): { san: string; nextFen: string } {
  if (!uciMove || uciMove.length < 4) {
    return { san: '', nextFen: fen };
  }
  try {
    const chess = new Chess(fen);
    const from = uciMove.substring(0, 2);
    const to = uciMove.substring(2, 4);
    const promotion = uciMove.length > 4 ? uciMove.substring(4, 5) : undefined;
    const move = chess.move({ from, to, promotion });
    return {
      san: move ? move.san : uciMove,
      nextFen: chess.fen(),
    };
  } catch {
    return { san: uciMove, nextFen: fen };
  }
}

export function buildRefutationLine(fenAfterMove: string, pvUci: string, maxMoves: number = 3): string {
  if (!pvUci) return '';
  const moves = pvUci.trim().split(/\s+/);
  const chess = new Chess(fenAfterMove);
  const sanList: string[] = [];

  for (let i = 0; i < Math.min(moves.length, maxMoves); i++) {
    const uci = moves[i];
    if (uci.length < 4) break;
    const from = uci.substring(0, 2);
    const to = uci.substring(2, 4);
    const promotion = uci.length > 4 ? uci.substring(4, 5) : undefined;

    try {
      const move = chess.move({ from, to, promotion });
      if (!move) break;
      sanList.push(move.san);
    } catch {
      break;
    }
  }

  return sanList.join(' ');
}

export function selectCandidateMoments(
  positions: PositionInfo[],
  evalMap: Map<string, EngineEvalResult>,
  playerColor: 'white' | 'black'
): CandidateMoment[] {
  const playerPerspectiveMultiplier = playerColor === 'white' ? 1 : -1;
  const rawCandidates: CandidateMoment[] = [];

  for (const pos of positions) {
    // Only inspect player's moves
    if (!pos.isPlayerMove) continue;

    const evalBeforeObj = evalMap.get(pos.fenBefore);
    const evalAfterObj = evalMap.get(pos.fenAfter);

    const evalBeforeWhite = evalBeforeObj?.evalPawns ?? 0;
    const evalAfterWhite = evalAfterObj?.evalPawns ?? 0;

    const evalBefore = evalBeforeWhite * playerPerspectiveMultiplier;
    const evalAfter = evalAfterWhite * playerPerspectiveMultiplier;
    const swing = evalAfter - evalBefore;

    const isMissedWin = evalBefore >= 2.0 && evalAfter <= 0.5;
    const isLargeSwing = swing <= -1.5;

    if (isMissedWin || isLargeSwing) {
      let severityLabel: SeverityLabel = 'Turning point';
      if (isMissedWin) {
        severityLabel = 'Missed win';
      } else if (evalBefore >= -1.0 && evalAfter <= -3.0) {
        severityLabel = 'Last chance';
      }

      const bestUci = evalBeforeObj?.bestMove || '';
      const { san: bestMoveSan } = uciToSan(pos.fenBefore, bestUci);
      const refutationLineSan = buildRefutationLine(pos.fenAfter, evalAfterObj?.pv || '');

      rawCandidates.push({
        ply: pos.ply,
        moveNumber: pos.moveNumber,
        san: pos.san,
        fenBefore: pos.fenBefore,
        fenAfter: pos.fenAfter,
        playerColor,
        evalBefore,
        evalAfter,
        swing,
        bestMoveSan: bestMoveSan || 'best move',
        bestMoveUci: bestUci,
        refutationLineSan,
        phase: computeGamePhase(pos.fenBefore),
        materialNote: computeMaterialNote(pos.fenBefore, pos.fenAfter, playerColor),
        candidateType: severityLabel,
      });
    }
  }

  // Deduplicate within 3 plies: keep largest negative swing (most severe mistake)
  rawCandidates.sort((a, b) => a.swing - b.swing); // most negative first
  const deduplicated: CandidateMoment[] = [];

  for (const cand of rawCandidates) {
    const isClose = deduplicated.some((d) => Math.abs(d.ply - cand.ply) <= 3);
    if (!isClose) {
      deduplicated.push(cand);
    }
    if (deduplicated.length >= 5) break;
  }

  // If 0 candidates found, pick the single largest swing as "Quiet drift"
  if (deduplicated.length === 0) {
    let worstPos: PositionInfo | null = null;
    let worstSwing = 0;
    let worstBefore = 0;
    let worstAfter = 0;

    for (const pos of positions) {
      if (!pos.isPlayerMove) continue;
      const eb = (evalMap.get(pos.fenBefore)?.evalPawns ?? 0) * playerPerspectiveMultiplier;
      const ea = (evalMap.get(pos.fenAfter)?.evalPawns ?? 0) * playerPerspectiveMultiplier;
      const s = ea - eb;
      if (s < worstSwing) {
        worstSwing = s;
        worstPos = pos;
        worstBefore = eb;
        worstAfter = ea;
      }
    }

    if (worstPos) {
      const evalBeforeObj = evalMap.get(worstPos.fenBefore);
      const evalAfterObj = evalMap.get(worstPos.fenAfter);
      const bestUci = evalBeforeObj?.bestMove || '';
      const { san: bestMoveSan } = uciToSan(worstPos.fenBefore, bestUci);
      const refutationLineSan = buildRefutationLine(worstPos.fenAfter, evalAfterObj?.pv || '');

      deduplicated.push({
        ply: worstPos.ply,
        moveNumber: worstPos.moveNumber,
        san: worstPos.san,
        fenBefore: worstPos.fenBefore,
        fenAfter: worstPos.fenAfter,
        playerColor,
        evalBefore: worstBefore,
        evalAfter: worstAfter,
        swing: worstSwing,
        bestMoveSan: bestMoveSan || 'best move',
        bestMoveUci: bestUci,
        refutationLineSan,
        phase: computeGamePhase(worstPos.fenBefore),
        materialNote: computeMaterialNote(worstPos.fenBefore, worstPos.fenAfter, playerColor),
        candidateType: 'Quiet drift',
      });
    }
  }

  // Sort chronologically by ply for natural narrative flow
  deduplicated.sort((a, b) => a.ply - b.ply);

  return deduplicated;
}
