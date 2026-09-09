import React from 'react';
import type { Metadata } from 'next';
import { DEMO_REPORT } from '../../../lib/demo-report';
import Link from 'next/link';
import { getReportByShareId } from '../../../lib/api';
import { ShareViewTracker } from '../../../components/ShareViewTracker';
import { SharedReportInteractiveView } from '../../../components/SharedReportInteractiveView';
import { BookOpen } from 'lucide-react';

interface PageProps {
  params: Promise<{ shareId: string }>;
}

// Per-report share card. A shared review is the product's main organic
// distribution path, so the link preview shows that report's actual headline
// instead of the generic site card.
export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { shareId } = await params;
  let report = null;

  try {
    report = shareId === 'demo-sample' ? DEMO_REPORT : await getReportByShareId(shareId);
  } catch {
    // Fall through to the generic card below.
  }

  if (!report) {
    return {
      title: 'Report not found — Chessplain',
      description: 'This review link is no longer available. Review one of your own games instead.',
      robots: { index: false, follow: true },
    };
  }

  const headline = report.summary?.headline?.trim() || 'A chess game, a little clearer.';
  const players = [report.player_name, report.opponent_name].filter(Boolean).join(' vs ');
  const description =
    report.summary?.story?.trim() ||
    [players, report.move_count ? `${report.move_count} moves` : ''].filter(Boolean).join(' · ') ||
    'The moments that decided this game, explained and playable on the board.';

  return {
    title: `${headline} — Chessplain`,
    description: description.length > 200 ? `${description.slice(0, 197)}…` : description,
    alternates: { canonical: `/r/${shareId}` },
    openGraph: {
      type: 'article',
      title: headline,
      description: description.length > 200 ? `${description.slice(0, 197)}…` : description,
      url: `/r/${shareId}`,
    },
    twitter: { card: 'summary_large_image', title: headline },
  };
}
export default async function SharedReportPage({ params }: PageProps) {
  const { shareId } = await params;
  let report = null;

  try {
    report = shareId === 'demo-sample' ? DEMO_REPORT : await getReportByShareId(shareId);
  } catch {
    // Handled below
  }

  if (!report) {
    return (
      <div className="mx-auto max-w-xl px-4 py-20 text-center">
        <div className="card-box p-8 border border-[var(--w-border-strong)] bg-[var(--w-surface)] shadow-md">
          <h2 className="t-heading text-2xl mb-2 text-[var(--w-ink1)]">Report not found</h2>
          <p className="t-body text-[var(--w-ink2)] mb-6">
            The link may be incorrect, or the service may be temporarily unavailable. Try opening it again shortly.
          </p>
          <div className="flex justify-center gap-3">
            <Link
              href="/"
              className="rounded-lg bg-[var(--w-accent)] px-4 py-2.5 text-sm font-semibold text-[var(--w-on-accent)] hover:bg-[var(--w-accent-hover)] transition-all shadow-sm"
            >
              Analyze your own game
            </Link>
            <Link
              href="/report/demo"
              className="rounded-lg border border-[var(--w-border)] bg-[var(--w-canvas)] px-4 py-2.5 text-sm font-semibold text-[var(--w-ink1)] hover:bg-[var(--w-surface-subtle)] transition-colors flex items-center gap-1.5"
            >
              <BookOpen className="w-4 h-4" />
              <span>View sample demo</span>
            </Link>
          </div>
        </div>
      </div>
    );
  }

  return (
    <>
      <ShareViewTracker shareId={shareId} />
      <SharedReportInteractiveView report={report} shareId={shareId} />
    </>
  );
}
