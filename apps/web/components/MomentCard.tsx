'use client';

import type { RefObject } from 'react';
import type { MomentReport } from '../lib/api';

type MomentStage = 'before' | 'played' | 'alternative' | 'takeaway';

interface MomentCardProps {
  moment: MomentReport;
  index: number;
  isActive?: boolean;
  onSelect?: () => void;
  stage?: MomentStage;
  headingRef?: RefObject<HTMLHeadingElement | null>;
}

export function MomentCard({ moment, index, isActive = true, onSelect, stage = 'played', headingRef }: MomentCardProps) {
  const playedMove = moment.played.replace(/^\d+\.+\s*/, '');
  const bestMove = moment.best_move.replace(/^\d+\.+\s*/, '');

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
          <h2 ref={headingRef} tabIndex={-1} className="t-heading mb-5 text-3xl leading-tight outline-none sm:text-4xl">{moment.concept_name}</h2>
          <p className="mb-6 text-base leading-relaxed text-[var(--w-ink2)]">{moment.concept_definition}</p>
          <div className="border-t border-[var(--w-border)] pt-5">
            <h3 className="mb-2 text-sm font-semibold">Look for this</h3>
            <p className="text-base leading-relaxed text-[var(--w-ink2)]">{moment.probable_thought || moment.what_actually_happens}</p>
          </div>
        </>
      )}

      {stage === 'played' && (
        <>
          <p className="mb-2 text-sm font-semibold text-[var(--w-accent)]">What changed</p>
          <h2 ref={headingRef} tabIndex={-1} className="t-heading mb-5 text-3xl leading-tight outline-none sm:text-4xl">The position changed after {playedMove}.</h2>
          {moment.probable_thought && (
            <div className="mb-6">
              <h3 className="mb-2 text-sm font-semibold text-[var(--w-ink2)]">What the move was going for</h3>
              <p className="text-lg leading-relaxed text-[var(--w-ink2)]">{moment.probable_thought}</p>
            </div>
          )}
          <div className="border-t border-[var(--w-border)] pt-5">
            <h3 className="mb-2 text-sm font-semibold">What the position shows</h3>
            <p className="text-base leading-relaxed text-[var(--w-ink2)]">{moment.what_actually_happens}</p>
          </div>
        </>
      )}

      {stage === 'alternative' && (
        <>
          <p className="mb-2 text-sm font-semibold text-[var(--w-accent)]">A better question</p>
          <h2 ref={headingRef} tabIndex={-1} className="t-heading mb-5 text-3xl leading-tight outline-none sm:text-4xl">What if you played {bestMove}?</h2>
          <p className="mb-6 text-base leading-relaxed text-[var(--w-ink2)]">{moment.what_actually_happens}</p>
          <div className="border-t border-[var(--w-border)] pt-5">
            <h3 className="mb-2 text-sm font-semibold text-[var(--w-accent)]">Compare the position</h3>
            <p className="text-base leading-relaxed text-[var(--w-ink2)]">Follow the highlighted continuation on the board, then continue to the takeaway.</p>
          </div>
        </>
      )}

      {stage === 'takeaway' && (
        <>
          <p className="mb-2 text-sm font-semibold text-[var(--w-accent)]">One habit for your next game</p>
          <h2 ref={headingRef} tabIndex={-1} className="t-heading mb-5 text-3xl leading-tight outline-none sm:text-4xl">{moment.takeaway}</h2>
          <p className="text-base leading-relaxed text-[var(--w-ink2)]">{moment.what_actually_happens}</p>
        </>
      )}

      <details className="mt-7 border-t border-[var(--w-border)] pt-4">
        <summary className="focus-ring inline-flex min-h-11 items-center text-sm font-semibold text-[var(--w-accent)]">Read the full explanation</summary>
        <div className="mt-4 space-y-5">
          {moment.concept_definition && <p className="text-sm leading-relaxed text-[var(--w-ink2)]">{moment.concept_definition}</p>}
          {moment.probable_thought && <p className="text-sm leading-relaxed text-[var(--w-ink2)]">{moment.probable_thought}</p>}
          <p className="text-sm leading-relaxed text-[var(--w-ink2)]">{moment.what_actually_happens}</p>
          <p className="text-sm font-medium leading-relaxed">{moment.takeaway}</p>
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
