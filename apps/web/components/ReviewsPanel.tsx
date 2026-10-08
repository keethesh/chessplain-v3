'use client';

import Link from 'next/link';
import { ArrowRight } from 'lucide-react';
import type { Me, MeReview } from '../lib/api';

function day(iso: string): string {
  return new Intl.DateTimeFormat('en', { day: 'numeric', month: 'short' }).format(new Date(iso));
}

function opponent(review: MeReview): string | null {
  const names = [review.white_player, review.black_player];
  const them = review.player_color === 'black' ? names[0] : review.player_color === 'white' ? names[1] : null;
  return them ? `vs ${them}` : null;
}

function status(review: MeReview): string {
  if (review.status === 'failed') return 'Couldn’t be reviewed';
  if (review.status !== 'completed') return 'In progress';
  if (review.moment_count === 0) return 'No turning point';
  return review.moment_count === 1 ? '1 moment' : `${review.moment_count} moments`;
}

interface ReviewsPanelProps {
  me: Me | null;
  /** The account request failed; `me` stays null, so say so instead of showing a loading state forever. */
  failed?: boolean;
  onRetry?: () => void;
  full?: boolean;
}

/** The signed-in player's reviews, newest first, and the ideas that keep coming up across them. */
export function ReviewsPanel({ me, failed = false, onRetry, full = false }: ReviewsPanelProps) {
  const shown = (me?.reviews ?? []).slice(0, full ? 50 : 4);
  const total = me?.reviews.length ?? 0;
  return (
    <aside className="reviews-panel" aria-label="Your reviews">
      <div className="reviews-panel-head">
        <h2>Your reviews</h2>
        {me && !full && total > shown.length && <Link href="/account" className="text-link">All {total} <ArrowRight size={14} /></Link>}
      </div>

      {failed && !me ? (
        <div className="reviews-empty" role="alert">
          <p>We couldn’t load your reviews.</p>
          {onRetry && <button type="button" className="text-link" onClick={onRetry}>Try again</button>}
        </div>
      ) : !me ? (
        <div aria-hidden="true" className="space-y-3"><div className="skeleton h-12" /><div className="skeleton h-12" /><div className="skeleton h-12" /></div>
      ) : shown.length === 0 ? (
        <p className="reviews-empty">Your reviews will collect here once you’ve reviewed your first game.</p>
      ) : (
        <ul className="reviews-list">
          {shown.map(review => (
            <li key={review.id}>
              <Link href={`/report/${review.id}`}>
                <span className="reviews-headline">{review.headline || (review.status === 'failed' ? 'This game couldn’t be reviewed' : 'Game review')}</span>
                <span className="reviews-meta">{[opponent(review), day(review.created_at), status(review)].filter(Boolean).join(' · ')}</span>
              </Link>
            </li>
          ))}
        </ul>
      )}

      {me && me.patterns.length > 0 && (
        <div className="reviews-patterns">
          <h3>Keeps coming up</h3>
          <ul>
            {me.patterns.map(p => <li key={p.concept}><span>{p.concept}</span><span>{p.count} reviews</span></li>)}
          </ul>
        </div>
      )}
    </aside>
  );
}
