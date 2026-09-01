'use client';

import React from 'react';
import { Check, Compass } from 'lucide-react';
import { MomentReport } from '../lib/api';

interface MomentCardProps {
  moment: MomentReport;
  index: number;
  isActive?: boolean;
  onSelect?: () => void;
}

export function MomentCard({ moment, index, isActive, onSelect }: MomentCardProps) {
  const getBadgeClass = (severity: string) => {
    switch (severity) {
      case 'Turning point':
        return 'badge-accent';
      case 'Last chance':
      case 'Missed win':
        return 'badge-error';
      default:
        return 'badge-muted';
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      onSelect?.();
    }
  };

  return (
    <article
      tabIndex={0}
      role="button"
      aria-pressed={isActive}
      aria-label={`Moment ${index + 1}: Move ${moment.move_number}, ${moment.played}`}
      onClick={onSelect}
      onKeyDown={handleKeyDown}
      className={`card-box cursor-pointer p-4 sm:p-5 transition-all focus-ring ${
        isActive
          ? 'ring-2 ring-[var(--w-accent)] border-[var(--w-accent)] shadow-md bg-[var(--w-surface)]'
          : 'hover:border-[var(--w-border-strong)] bg-[var(--w-surface)]'
      }`}
    >
      <div className="flex flex-col gap-3.5">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span className="text-[var(--t-xs)] uppercase tracking-wider font-semibold text-[var(--w-ink3)]">
              Moment {index + 1}
            </span>
            <span className="text-[var(--w-border-strong)]">·</span>
            <span className="t-notation font-semibold text-[var(--w-ink2)]">
              Move {moment.move_number}
            </span>
          </div>
          <span className={getBadgeClass(moment.severity_label)}>{moment.severity_label}</span>
        </div>

        {/* Played move */}
        <div>
          <div className="flex items-baseline gap-2 mb-2">
            <span className="t-caption text-[var(--w-ink2)]">You played</span>
            <span className="t-notation font-bold text-[var(--t-lg)] text-[var(--w-ink1)] bg-[var(--w-surface-subtle)] px-2 py-0.5 rounded border border-[var(--w-border)]">
              {moment.played}
            </span>
          </div>

          {/* Probable thought */}
          <div className="bg-[var(--w-surface-subtle)] p-3 rounded-lg border border-[var(--w-border)]">
            <p className="t-caption font-semibold text-[var(--w-ink3)] uppercase tracking-wider mb-1">
              You probably thought
            </p>
            <p className="t-body italic text-[var(--w-ink1)] leading-relaxed">
              "{moment.probable_thought}"
            </p>
          </div>
        </div>

        {/* What actually happens */}
        <div>
          <p className="t-caption font-semibold text-[var(--w-ink3)] uppercase tracking-wider mb-1">
            What actually happened
          </p>
          <p className="t-body text-[var(--w-ink1)] leading-relaxed">
            {moment.what_actually_happens}
          </p>
        </div>

        {/* Concept definition */}
        <div className="flex flex-wrap items-center gap-2 pt-2 border-t border-[var(--w-border)]">
          <span className="badge-muted font-medium inline-flex items-center gap-1">
            <Compass className="w-3 h-3 text-[var(--w-accent)]" />
            {moment.concept_name}
          </span>
          <span className="t-caption text-[var(--w-ink2)]">{moment.concept_definition}</span>
        </div>

        {/* Takeaway */}
        <div className="takeaway-box mt-1">
          <div className="w-5 h-5 rounded-full bg-[var(--w-accent-soft)] flex items-center justify-center shrink-0 mt-0.5">
            <Check className="w-3.5 h-3.5 text-[var(--w-accent)]" />
          </div>
          <div>
            <p className="t-caption font-bold text-[var(--w-accent)] uppercase tracking-wider mb-0.5">
              Takeaway Rule
            </p>
            <p className="t-body-strong text-[var(--w-ink1)] leading-snug">{moment.takeaway}</p>
          </div>
        </div>
      </div>
    </article>
  );
}

export function MomentSkeleton({ moveNumber = '...', index = 1 }: { moveNumber?: string | number; index?: number }) {
  return (
    <article className="card-box p-4 sm:p-5 opacity-80">
      <div className="flex flex-col gap-3.5">
        <div className="flex items-center justify-between">
          <span className="text-[var(--t-xs)] uppercase font-semibold text-[var(--w-ink3)] tracking-wider">
            Moment {index} · Move {moveNumber}
          </span>
          <span className="t-caption text-[var(--w-accent)] font-medium animate-pulse">
            Analyzing intention (~10s)...
          </span>
        </div>
        <div className="skeleton h-6 w-1/3"></div>
        <div className="skeleton h-16 w-full"></div>
        <div className="skeleton h-14 w-full"></div>
        <div className="skeleton h-12 w-full"></div>
      </div>
    </article>
  );
}
