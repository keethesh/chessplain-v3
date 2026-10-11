import React, { cache } from 'react';
import type { Metadata } from 'next';
import Link from 'next/link';
import { DEMO_REPORT } from '../../../lib/demo-report';
import { SITE_URL } from '../../layout';
import { getReportByShareId, type ReportDetail } from '../../../lib/api';
import { ShareViewTracker } from '../../../components/ShareViewTracker';
import { SharedReportInteractiveView } from '../../../components/SharedReportInteractiveView';
import '../../report/report.css';

/** Metadata and the page both need the report; cache() runs the fetch once per request. */
const loadSharedReport = cache(async (shareId: string): Promise<ReportDetail | null> => {
  if (shareId === 'demo-sample') return DEMO_REPORT;
  try {
    return await getReportByShareId(shareId);
  } catch {
    return null;
  }
});

interface PageProps {
  params: Promise<{ shareId: string }>;
  searchParams: Promise<{ focus?: string | string[] }>;
}

// Per-report share card. A shared review is the product's main organic
// distribution path, so the link preview shows that report's actual headline
// instead of the generic site card.
export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { shareId } = await params;
  const report = await loadSharedReport(shareId);

  if (!report) {
    return {
      title: 'Report not found | Chessplain',
      description: 'This review link is no longer available.',
      alternates: { canonical: `/r/${shareId}` },
      robots: { index: false, follow: true },
    };
  }

  const headline = report.summary?.headline?.trim() || 'A chess game, a little clearer.';
  const players = [report.player_name, report.opponent_name].filter(Boolean).join(' vs ');
  const description =
    report.summary?.story?.trim() ||
    [players, report.move_count ? `${report.move_count} moves` : ''].filter(Boolean).join(' · ') ||
    'The moments that decided this game, on the board.';

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

export default async function SharedReportPage({ params, searchParams }: PageProps) {
  const { shareId } = await params;
  const query = await searchParams;
  const raw = Array.isArray(query.focus) ? query.focus[0] : query.focus;
  const focusPly = raw != null && Number.isFinite(Number(raw)) ? Number(raw) : undefined;
  const report = await loadSharedReport(shareId);

  if (!report) {
    return (
      <div className="page report-missing">
        <h1 className="h2">This review isn’t available.</h1>
        <p className="lede">The link may be wrong, or Chessplain is briefly unavailable.</p>
        <Link className="btn" href="/#scan">Find your own gremlin</Link>
      </div>
    );
  }

  return (
    <>
      <ShareViewTracker shareId={shareId} />
      <SharedReportInteractiveView report={report} mode={shareId === 'demo-sample' ? 'demo' : 'shared'} focusPly={focusPly} />
    </>
  );
}
