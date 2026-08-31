'use client';

import React from 'react';
import { Check } from 'lucide-react';
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

  return (
    <article
      onClick={onSelect}
      className={`card-box cursor-pointer transition-all ${
        isActive ? 'ring-2 ring-[var(--w-accent)] border-[var(--w-accent)] shadow-sm' : 'hover:border-[var(--w-ink2)]'
      }`}
    >
      <div className="flex flex-col gap-3">
        {/* Header */}
        <div className="flex items-center justify-between">
          <span className="text-[var(--t-xs)] uppercase tracking-wider font-semibold text-[var(--w-ink2)]">
            Moment {index + 1} · Move {moment.move_number}
          </span>
          <span className={getBadgeClass(moment.severity_label)}>{moment.severity_label}</span>
        </div>

        {/* Played move & thought */}
        <div>
          <p className="t-body-strong mb-1">You played {moment.played}</p>
          <div className="bg-[var(--w-surface)] p-2.5 rounded border border-[var(--w-border)]">
            <p className="t-caption muted mb-0.5 font-medium">You probably thought</p>
            <p className="t-small italic text-[var(--w-ink1)]">"{moment.probable_thought}"</p>
          </div>
        </div>

        {/* What actually happens */}
        <div>
          <p className="t-caption muted mb-1 font-medium">What actually happens</p>
          <p className="t-body">{moment.what_actually_happens}</p>
        </div>

        {/* Concept definition */}
        <div className="flex flex-wrap items-center gap-2 pt-1 border-t border-[var(--w-border)]">
          <span className="badge-muted font-medium">{moment.concept_name}</span>
          <span className="t-caption muted">{moment.concept_definition}</span>
        </div>

        {/* Takeaway */}
        <div className="takeaway-box">
          <Check className="w-4 h-4 text-[var(--w-accent)] shrink-0 mt-0.5" />
          <p className="t-small font-medium">{moment.takeaway}</p>
        </div>
      </div>
    </article>
  );
}

export function MomentSkeleton({ moveNumber = '...', index = 1 }: { moveNumber?: string | number; index?: number }) {
  return (
    <article className="card-box opacity-75">
      <div className="flex flex-col gap-3">
        <div className="flex items-center justify-between">
          <span className="text-[var(--t-xs)] uppercase font-semibold text-[var(--w-ink2)]">
            Moment {index} · Move {moveNumber}
          </span>
          <span className="t-caption muted animate-pulse">Analyzing (~10s)...</span>
        </div>
        <div className="skeleton h-5 w-1/3"></div>
        <div className="skeleton h-14 w-full"></div>
        <div className="skeleton h-12 w-full"></div>
        <div className="skeleton h-8 w-full"></div>
      </div>
    </article>
  );
}
