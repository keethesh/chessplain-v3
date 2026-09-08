'use client';

import type { MomentReport } from '../lib/api';

interface MomentCardProps {
  moment: MomentReport;
  index: number;
  isActive?: boolean;
  onSelect?: () => void;
}

export function MomentCard({ moment, index, isActive = true, onSelect }: MomentCardProps) {
  return (
    <article aria-label={`Moment ${index + 1}: ${moment.concept_name}`} className="min-w-0">
      {onSelect && !isActive ? (
        <button onClick={onSelect} className="focus-ring w-full rounded-xl border border-[var(--w-border)] p-5 text-left hover:bg-[var(--w-surface-subtle)]">
          <span className="t-caption text-[var(--w-ink2)]">Move {moment.move_number} · {moment.played}</span>
          <span className="mt-1 block t-section">{moment.concept_name}</span>
        </button>
      ) : (
        <>
          <div className="mb-5 flex flex-wrap items-center gap-3">
            <span className="badge-accent">{moment.severity_label}</span>
            <span className="text-sm text-[var(--w-ink2)]">You played <strong className="t-notation text-[var(--w-ink1)]">{moment.move_number}{moment.player_color === 'black' ? '…' : '.'}{moment.played.replace(/^\d+\.+\s*/, '')}</strong></span>
          </div>
          <h2 className="t-heading mb-5 text-3xl leading-tight sm:text-4xl">{moment.concept_name}</h2>
          {moment.concept_definition && <p className="mb-6 text-sm leading-relaxed text-[var(--w-ink2)]">{moment.concept_definition}</p>}
          {moment.probable_thought && (
            <div className="mb-6">
              <h3 className="mb-2 text-sm font-semibold text-[var(--w-ink2)]">The idea may have been</h3>
              <p className="text-lg italic leading-relaxed text-[var(--w-ink2)]">“{moment.probable_thought}”</p>
              <p className="mt-2 text-xs text-[var(--w-ink3)]">A possible intention, inferred from the move.</p>
            </div>
          )}
          <div className="mb-6">
            <h3 className="mb-2 text-sm font-semibold">What the position shows</h3>
            <p className="text-base leading-relaxed text-[var(--w-ink2)]">{moment.what_actually_happens}</p>
          </div>
          <div className="border-t border-[var(--w-border)] pt-5">
            <h3 className="mb-2 text-sm font-semibold text-[var(--w-accent)]">Try this next game</h3>
            <p className="text-lg font-medium leading-relaxed">{moment.takeaway}</p>
          </div>
        </>
      )}
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
