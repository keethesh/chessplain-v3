import React from 'react';
import type { Metadata } from 'next';
import { DEMO_REPORT } from '../../../lib/demo-report';
import Link from 'next/link';
import { SITE_URL } from '../../layout';
import { getReportByShareId } from '../../../lib/api';
import { ShareViewTracker } from '../../../components/ShareViewTracker';
import { SharedReportInteractiveView } from '../../../components/SharedReportInteractiveView';

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
      title: 'Report not found | Chessplain',
      description: 'This review link is no longer available. Review one of your own games instead.',
      alternates: { canonical: `/r/${shareId}` },
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
    title: `${headline} | Chessplain`,
    description: description.length > 200 ? `${description.slice(0, 197)}…` : description,
    alternates: { canonical: `/r/${shareId}` },
    robots: shareId === 'demo-sample' ? { index: true, follow: true } : { index: false, follow: true },
    openGraph: {
      type: 'article',
      title: headline,
      description: description.length > 200 ? `${description.slice(0, 197)}…` : description,
      url: `/r/${shareId}`,
      images: [{ url: `${SITE_URL}/r/${shareId}/opengraph-image`, width: 1200, height: 630, alt: 'A Chessplain game review' }],
    },
    twitter: {
      card: 'summary_large_image',
      title: headline,
      description: description.length > 200 ? `${description.slice(0, 197)}…` : description,
      images: [{ url: `${SITE_URL}/r/${shareId}/opengraph-image`, width: 1200, height: 630, alt: 'A Chessplain game review' }],
    },
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
      <div className="page-width py-16 max-w-2xl">
        <h1 className="t-display mb-5">This review isn’t available.</h1>
        <p className="t-body text-[var(--w-ink2)] mb-7">The link may be wrong, or Chessplain may be briefly unavailable. Try it again in a moment.</p>
        <div className="flex flex-wrap gap-3">
          <Link className="primary-button" href="/#analyze">Review a game</Link>
          <Link className="secondary-button" href="/report/demo">Read the sample review</Link>
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
