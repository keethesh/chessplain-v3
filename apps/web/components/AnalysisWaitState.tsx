'use client';

import { useEffect, useMemo, useState } from 'react';
import { Chess } from 'chess.js';
import { LoaderCircle, Check, RefreshCw } from 'lucide-react';
import { ChessboardView } from './ChessboardView';

interface AnalysisWaitStateProps {
  status: string;
  stalled?: boolean;
  onRetry?: () => void;
  playerNames?: string;
}

const STAGES = [
  { id: 'sweeping', label: 'Scanning the game', detail: 'Finding positions that changed the balance' },
  { id: 'verifying', label: 'Checking the continuations', detail: 'Replaying forcing replies on the board' },
  { id: 'explaining', label: 'Preparing your lesson', detail: 'Turning the evidence into a clear explanation' },
];

// Morphy vs Duke Karl and Count Isouard, Paris 1858: the "Opera Game".
const OPERA_GAME = 'e4 e5 Nf3 d6 d4 Bg4 dxe5 Bxf3 Qxf3 dxe5 Bc4 Nf6 Qb3 Qe7 Nc3 c6 Bg5 b5 Nxb5 cxb5 Bxb5+ Nbd7 O-O-O Rd8 Rxd7 Rxd7 Rd1 Qe6 Bxd7+ Nxd7 Qb8+ Nxb8 Rd8#'.split(' ');
// Keyed by the number of moves played.
const CAPTIONS: Record<number, string> = {
  0: 'Paris, 1858. Paul Morphy plays White during a night at the opera.',
  19: 'Morphy gives up a knight to open lines toward the king.',
  25: 'Then a rook.',
  31: 'Then his queen.',
  33: 'Checkmate. The rook gives check and the bishop on g5 guards d8.',
};
const MOVE_MS = 1300;
const END_HOLD_MS = 4500;

const TIPS = [
  'Before each move, list every check, capture and threat your opponent could reply with.',
  'When a piece is attacked, count its attackers and defenders before deciding.',
  'Before grabbing a pawn, check how your piece gets back to safety.',
  'Moving the same piece twice in the opening usually costs you development.',
  'Ahead in material? Trade pieces, not pawns.',
  'A knight on the edge of the board controls half as many squares.',
  'Pawns in front of your castled king are a shield. Each one you push leaves a hole.',
  'Not sure what to do? Improve your worst-placed piece.',
];
const TIP_MS = 8000;

/** Board positions after each move of the Opera Game, with the move's squares. */
function replay() {
  const game = new Chess();
  const frames: Array<{ fen: string; from?: string; to?: string; label: string }> = [{ fen: game.fen(), label: 'Start' }];
  OPERA_GAME.forEach((san, i) => {
    const move = game.move(san);
    frames.push({ fen: game.fen(), from: move.from, to: move.to, label: `${Math.floor(i / 2) + 1}${i % 2 ? '…' : '.'} ${move.san}` });
  });
  return frames;
}

function OperaGameLoop() {
  const frames = useMemo(replay, []);
  const [ply, setPly] = useState(0);
  const [reducedMotion, setReducedMotion] = useState(false);
  useEffect(() => setReducedMotion(window.matchMedia('(prefers-reduced-motion: reduce)').matches), []);
  useEffect(() => {
    const atEnd = ply === frames.length - 1;
    const timer = setTimeout(() => setPly(atEnd ? 0 : ply + 1), atEnd ? END_HOLD_MS : MOVE_MS);
    return () => clearTimeout(timer);
  }, [ply, frames.length]);

  const frame = frames[ply];
  const caption = CAPTIONS[Object.keys(CAPTIONS).map(Number).filter(n => n <= ply).at(-1) ?? 0];
  const marks = frame.from && frame.to ? { [frame.from]: 'rgb(240 241 233 / 70%)', [frame.to]: 'rgb(240 241 233 / 70%)' } : {};

  return (
    <figure className="opera-loop" aria-label="While you wait: Morphy's Opera Game, Paris 1858, replayed move by move">
      <ChessboardView fen={frame.fen} orientation="white" boardWidth={300} markedSquares={marks} animationMs={reducedMotion ? 0 : 450} />
      <figcaption>
        <span className="opera-move">{frame.label}</span>
        <span key={caption} className="opera-caption">{caption}</span>
      </figcaption>
    </figure>
  );
}

function RotatingTip() {
  const [index, setIndex] = useState(0);
  useEffect(() => {
    setIndex(Math.floor(Math.random() * TIPS.length));
    const timer = setInterval(() => setIndex(i => (i + 1) % TIPS.length), TIP_MS);
    return () => clearInterval(timer);
  }, []);
  return (
    <div className="wait-tip">
      <h2>A habit to try</h2>
      <p key={index}>{TIPS[index]}</p>
    </div>
  );
}

export function AnalysisWaitState({ status, stalled, onRetry, playerNames }: AnalysisWaitStateProps) {
  const activeStageIndex =
    status === 'pending' || status === 'sweeping'
      ? 0
      : status === 'verifying'
        ? 1
        : 2;

  return (
    <div className="analysis-wait mx-auto py-12 px-4 sm:px-6">
      <header className="text-center">
        <h1 className="t-heading text-2xl sm:text-3xl font-normal text-[var(--w-ink1)] mb-2">
          {playerNames ? `Reviewing ${playerNames}` : 'Preparing your game review'}
        </h1>
        <p className="text-sm text-[var(--w-ink2)]">We’ll show the important positions as soon as they’re ready.</p>
      </header>

      <div className="wait-layout">
        <OperaGameLoop />
        <div className="wait-side">
          <div className="wait-stepper" role="status" aria-live="polite">
            <div className="space-y-4">
              {STAGES.map((stage, idx) => {
                const isDone = idx < activeStageIndex;
                const isCurrent = idx === activeStageIndex;
                return (
                  <div key={stage.id} className="wait-step flex items-center gap-3.5">
                    <div
                      className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-xs font-semibold transition-colors ${
                        isDone
                          ? 'bg-[var(--w-accent)] text-[var(--w-on-accent)]'
                          : isCurrent
                            ? 'bg-[var(--w-accent-soft)] text-[var(--w-accent)] ring-2 ring-[var(--w-accent)]'
                            : 'bg-[var(--w-surface-subtle)] text-[var(--w-ink3)]'
                      }`}
                    >
                      {isDone ? <Check size={14} /> : isCurrent ? <LoaderCircle size={14} className="spin" /> : idx + 1}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className={`text-sm font-medium leading-none ${isCurrent ? 'text-[var(--w-ink1)]' : isDone ? 'text-[var(--w-ink2)]' : 'text-[var(--w-ink3)]'}`}>
                        {stage.label}
                      </p>
                      <p className="text-xs text-[var(--w-ink3)] mt-1">{stage.detail}</p>
                    </div>
                  </div>
                );
              })}
            </div>

            {stalled && (
              <div className="mt-5 pt-4 border-t border-[var(--w-border)] flex items-center justify-between text-xs text-[var(--w-error)]">
                <span>Taking longer than expected.</span>
                {onRetry && (
                  <button
                    onClick={onRetry}
                    className="inline-flex items-center gap-1 font-semibold underline text-[var(--w-ink1)] hover:text-[var(--w-accent)]"
                  >
                    <RefreshCw size={12} /> Reconnect
                  </button>
                )}
              </div>
            )}
          </div>
          <RotatingTip />
        </div>
      </div>
    </div>
  );
}
