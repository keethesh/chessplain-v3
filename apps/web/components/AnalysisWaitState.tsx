'use client';

import { LoaderCircle, Check, RefreshCw } from 'lucide-react';

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


export function AnalysisWaitState({ status, stalled, onRetry, playerNames }: AnalysisWaitStateProps) {

  const activeStageIndex =
    status === 'pending' || status === 'sweeping'
      ? 0
      : status === 'verifying'
        ? 1
        : 2;


  return (
    <div className="analysis-wait mx-auto max-w-xl py-12 px-4 sm:px-6" role="status" aria-live="polite">
      {/* Header */}
      <header className="text-center mb-8">
        <h1 className="t-heading text-2xl sm:text-3xl font-normal text-[var(--w-ink1)] mb-2">
          {playerNames ? `Reviewing ${playerNames}` : 'Preparing your game review'}
        </h1>
        <p className="text-sm text-[var(--w-ink2)]">We’ll show the important positions as soon as they’re ready.</p>
      </header>

      {/* Stage Stepper */}
      <div className="wait-stepper mb-6">
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

    </div>
  );
}
