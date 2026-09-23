'use client';

import type { RefObject } from 'react';
import type { MomentReport } from '../lib/api';
import { SquareText } from './SquareText';

type MomentStage = 'before' | 'played' | 'alternative' | 'takeaway';

interface MomentCardProps {
  moment: MomentReport;
  index: number;
  isActive?: boolean;
  onSelect?: () => void;
  stage?: MomentStage;
  headingRef?: RefObject<HTMLHeadingElement | null>;
  squareColors?: Record<string, string>;
  onFocusSquare?: (square: string | null) => void;
}

/**
 * The prose each stage shows, in reading order. Reports from before
 * `why_better` existed kept the alternative inside `what_actually_happens`.
 */
export function stageTexts(moment: MomentReport, stage: MomentStage): string[] {
  if (stage === 'before') return [moment.concept_definition];
  if (stage === 'played') return [moment.probable_thought, moment.what_actually_happens].filter(Boolean);
  if (stage === 'alternative') return [moment.why_better || moment.what_actually_happens];
  return [moment.takeaway];
}

export function MomentCard({ moment, index, isActive = true, onSelect, stage = 'played', headingRef, squareColors = {}, onFocusSquare }: MomentCardProps) {
  const playedMove = moment.played.replace(/^\d+\.+\s*/, '');
  const bestMove = moment.best_move.replace(/^\d+\.+\s*/, '');
  const prose = (text: string) => <SquareText text={text} colors={squareColors} onFocusSquare={onFocusSquare} />;

  if (onSelect && !isActive) {
    return (
      <article aria-label={`Moment ${index + 1}: ${moment.concept_name}`} className="min-w-0">
        <button onClick={onSelect} className="focus-ring w-full rounded-xl border border-[var(--w-border)] p-5 text-left hover:bg-[var(--w-surface-subtle)]">
          <span className="t-caption text-[var(--w-ink2)]">Move {moment.move_number} · {playedMove}</span>
          <span className="mt-1 block t-section">{moment.concept_name}</span>
        </button>
      </article>
    );
  }

  return (
    <article aria-label={`Moment ${index + 1}: ${moment.concept_name}`} className="min-w-0">
      <div className="mb-5 flex flex-wrap items-center gap-3">
        <span className="badge-accent">{moment.severity_label}</span>
        <span className="text-sm text-[var(--w-ink2)]">You played <strong className="t-notation text-[var(--w-ink1)]">{moment.move_number}{moment.player_color === 'black' ? '…' : '.'}{playedMove}</strong></span>
      </div>

      {stage === 'before' && (
        <>
          <p className="mb-2 text-sm font-semibold text-[var(--w-accent)]">Before your move</p>
          <h2 ref={headingRef} tabIndex={-1} className="t-heading mb-4 text-3xl leading-tight outline-none sm:text-4xl">{moment.concept_name}</h2>
          <p className="lesson-prose">{prose(moment.concept_definition)}</p>
        </>
      )}

      {stage === 'played' && (
        <>
          <p className="mb-2 text-sm font-semibold text-[var(--w-accent)]">What changed</p>
          <h2 ref={headingRef} tabIndex={-1} className="t-heading mb-5 text-3xl leading-tight outline-none sm:text-4xl">The position changed after {playedMove}.</h2>
          {moment.probable_thought && (
            <div className="mb-5">
              <h3 className="lesson-label">The idea</h3>
              <p className="lesson-prose">{prose(moment.probable_thought)}</p>
            </div>
          )}
          <div className="border-t border-[var(--w-border)] pt-5">
            <h3 className="lesson-label">What it missed</h3>
            <p className="lesson-prose">{prose(moment.what_actually_happens)}</p>
          </div>
        </>
      )}

      {stage === 'alternative' && (
        <>
          <p className="mb-2 text-sm font-semibold text-[var(--w-accent)]">A better question</p>
          <h2 ref={headingRef} tabIndex={-1} className="t-heading mb-5 text-3xl leading-tight outline-none sm:text-4xl">What if you played {bestMove}?</h2>
          <p className="lesson-prose">{prose(moment.why_better || moment.what_actually_happens)}</p>
        </>
      )}

      {stage === 'takeaway' && (
        <>
          <p className="mb-2 text-sm font-semibold text-[var(--w-accent)]">One habit for your next game</p>
          <h2 ref={headingRef} tabIndex={-1} className="t-heading mb-4 text-3xl leading-tight outline-none sm:text-4xl">{prose(moment.takeaway)}</h2>
          <p className="text-sm text-[var(--w-ink2)]"><strong className="text-[var(--w-ink1)]">{moment.concept_name}:</strong> {moment.concept_definition}</p>
        </>
      )}

      <details className="mt-7 border-t border-[var(--w-border)] pt-4">
        <summary className="focus-ring inline-flex min-h-11 items-center text-sm font-semibold text-[var(--w-accent)]">Read the full explanation</summary>
        <div className="mt-4 space-y-5">
          {moment.probable_thought && <p className="text-sm leading-relaxed text-[var(--w-ink2)]">{prose(moment.probable_thought)}</p>}
          <p className="text-sm leading-relaxed text-[var(--w-ink2)]">{prose(moment.what_actually_happens)}</p>
          {moment.why_better && <p className="text-sm leading-relaxed text-[var(--w-ink2)]">{prose(moment.why_better)}</p>}
          <p className="text-sm font-medium leading-relaxed">{prose(moment.takeaway)}</p>
        </div>
      </details>
    </article>
  );
}

export function MomentSkeleton() {
  return (
    <div role="status" aria-label="Preparing your next lesson" className="py-8">
      <p className="mb-4 text-sm text-[var(--w-ink2)]">Preparing your next lesson…</p>
      <div aria-hidden="true" className="space-y-3">
        <div className="skeleton h-7 w-2/3" />
        <div className="skeleton h-4 w-full" />
        <div className="skeleton h-4 w-5/6" />
      </div>
    </div>
  );
}
