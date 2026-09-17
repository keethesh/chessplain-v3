'use client';

import { useEffect, useState } from 'react';
import { LoaderCircle, Check, Sparkles, RefreshCw } from 'lucide-react';

interface AnalysisWaitStateProps {
  status: string;
  stalled?: boolean;
  onRetry?: () => void;
  playerNames?: string;
}

const CHESS_TIPS = [
  {
    title: 'The #1 Habit Under 1200 Elo',
    text: 'Over 70% of decisive mistakes happen not under heavy attack, but right after a quiet pawn move leaves an innocent piece completely undefended.',
  },
  {
    title: 'Count in One Move, Not Two',
    text: 'Before launching an attack, count what your opponent can force in ONE move. If their response comes with check or captures a loose piece, your attack is already too late.',
  },
  {
    title: 'Look For Loose Pieces First',
    text: 'Grandmaster John Nunn said: "Loose pieces drop off." Before touching any piece, scan your own side for anything with zero defenders.',
  },
  {
    title: 'Check, Capture, Threat',
    text: 'Before deciding on your move, always check your opponent’s most forcing options first: all their legal checks, all their captures, and direct threats against your queen.',
  },
  {
    title: 'King Safety Is Not Just Castling',
    text: 'Castling gets your king out of the center, but pushing pawns in front of your castled king creates permanent holes that bishops love to exploit.',
  },
];

const STAGES = [
  { id: 'sweeping', label: 'Scanning every move', detail: 'Evaluating with Stockfish' },
  { id: 'verifying', label: 'Finding turning points', detail: 'Isolating decisive moments' },
  { id: 'explaining', label: 'Writing plain-English lessons', detail: 'Drafting thoughts & habits' },
];

export function AnalysisWaitState({ status, stalled, onRetry, playerNames }: AnalysisWaitStateProps) {
  const [tipIndex, setTipIndex] = useState(0);

  useEffect(() => {
    const timer = setInterval(() => {
      setTipIndex((prev) => (prev + 1) % CHESS_TIPS.length);
    }, 7000);
    return () => clearInterval(timer);
  }, []);

  const activeStageIndex =
    status === 'pending'
      ? 0
      : status === 'sweeping'
        ? 0
        : status === 'verifying'
          ? 1
          : status === 'explaining'
            ? 2
            : 2;

  const currentTip = CHESS_TIPS[tipIndex];

  return (
    <div className="mx-auto max-w-xl py-12 px-4 sm:px-6" role="status" aria-live="polite">
      {/* Header */}
      <div className="text-center mb-8">
        <h1 className="t-heading text-2xl sm:text-3xl font-normal text-[var(--w-ink1)] mb-2">
          {playerNames ? `Reviewing ${playerNames}` : 'Preparing your game review'}
        </h1>
        <p className="text-sm text-[var(--w-ink2)]">
          Stockfish depth 20 • Usually takes 30–45 seconds
        </p>
      </div>

      {/* Stage Stepper */}
      <div className="rounded-xl border border-[var(--w-border)] bg-[var(--w-surface)] p-5 mb-6 shadow-xs">
        <div className="space-y-4">
          {STAGES.map((stage, idx) => {
            const isDone = idx < activeStageIndex;
            const isCurrent = idx === activeStageIndex;

            return (
              <div key={stage.id} className="flex items-center gap-3.5">
                <div
                  className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-xs font-semibold transition-colors ${
                    isDone
                      ? 'bg-[var(--w-accent)] text-[var(--w-on-accent)]'
                      : isCurrent
                        ? 'bg-[var(--w-accent-soft)] text-[var(--w-accent)] ring-2 ring-[var(--w-accent)]'
                        : 'bg-[var(--w-surface-subtle)] text-[var(--w-ink3)]'
                  }`}
                >
                  {isDone ? (
                    <Check size={14} />
                  ) : isCurrent ? (
                    <LoaderCircle size={14} className="spin" />
                  ) : (
                    idx + 1
                  )}
                </div>
                <div className="flex-1 min-w-0">
                  <p
                    className={`text-sm font-medium leading-none ${
                      isCurrent ? 'text-[var(--w-ink1)]' : isDone ? 'text-[var(--w-ink2)]' : 'text-[var(--w-ink3)]'
                    }`}
                  >
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

      {/* Rotating Micro-Lesson Card */}
      <div className="rounded-xl border border-[var(--w-border)] bg-[var(--w-surface-subtle)] p-5 transition-all">
        <div className="flex items-center gap-2 mb-2 text-xs font-semibold text-[var(--w-accent)] uppercase tracking-wider">
          <Sparkles size={14} />
          <span>While you wait: {currentTip.title}</span>
        </div>
        <p className="text-sm leading-relaxed text-[var(--w-ink1)]">
          {currentTip.text}
        </p>
      </div>
    </div>
  );
}
