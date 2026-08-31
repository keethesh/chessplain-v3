import React from 'react';
import { getReportByShareId } from '../../../lib/api';
import { ShareViewTracker } from '../../../components/ShareViewTracker';
import { ChessboardView } from '../../../components/ChessboardView';
import { MomentCard } from '../../../components/MomentCard';
import { ArrowRight } from 'lucide-react';

interface PageProps {
  params: Promise<{ shareId: string }>;
}

export default async function SharedReportPage({ params }: PageProps) {
  const { shareId } = await params;
  let report = null;

  try {
    report = await getReportByShareId(shareId);
  } catch {
    // Handled below
  }

  if (!report) {
    return (
      <div className="mx-auto max-w-xl px-4 py-20 text-center">
        <h1 className="t-heading text-xl mb-2">Report Not Found</h1>
        <p className="t-body muted mb-6">This shared analysis may have expired or is unavailable.</p>
        <a
          href="/"
          className="rounded-md bg-[var(--w-accent)] px-4 py-2 text-sm font-semibold text-[var(--w-on-accent)]"
        >
          Analyze your own game
        </a>
      </div>
    );
  }

  const moments = report.moments || [];
  const firstFen = moments[0]?.fen_before || 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1';

  return (
    <div className="mx-auto max-w-6xl px-4 py-8 sm:px-6 sm:py-12">
      <ShareViewTracker shareId={shareId} />
      {/* Banner Call to Action */}
      <div className="mb-8 rounded-lg bg-[var(--w-accent-soft)] p-4 flex flex-col sm:flex-row items-center justify-between gap-4 border border-[var(--w-accent)]/20">
        <div>
          <p className="t-body-strong text-[var(--w-accent)]">Shared Chessplain Analysis</p>
          <p className="t-small text-[var(--w-ink1)]">Want your own games explained in plain English like this?</p>
        </div>
        <a
          href="/"
          className="flex items-center gap-2 rounded-md bg-[var(--w-accent)] px-4 py-2 text-sm font-semibold text-[var(--w-on-accent)] hover:opacity-90 transition-all shrink-0"
        >
          <span>Analyze your game free</span>
          <ArrowRight className="w-4 h-4" />
        </a>
      </div>

      {/* Main 2-column layout */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
        {/* Left Column: Board */}
        <div className="lg:col-span-5 lg:sticky lg:top-6 flex flex-col gap-4">
          <div className="w-full flex justify-center">
            <ChessboardView
              fen={firstFen}
              orientation={report.player_color || 'white'}
              boardWidth={360}
            />
          </div>
        </div>

        {/* Right Column: Story & Moments */}
        <div className="lg:col-span-7 flex flex-col gap-6">
          {report.summary && (
            <div className="card-box bg-[var(--w-surface)] border-l-4 border-l-[var(--w-accent)]">
              <h1 className="t-display sm:text-2xl text-xl mb-2 text-[var(--w-ink1)]">
                {report.summary.headline}
              </h1>
              <p className="t-body leading-relaxed text-[var(--w-ink1)]">
                {report.summary.story}
              </p>
              <div className="mt-4 pt-3 border-t border-[var(--w-border)]">
                <span className="t-caption font-semibold uppercase tracking-wider text-[var(--w-accent)]">
                  Focus habit
                </span>
                <p className="t-body-strong mt-0.5">{report.summary.focus_habit}</p>
              </div>
            </div>
          )}

          <div className="flex flex-col gap-4">
            <h2 className="t-section text-sm font-semibold uppercase tracking-wider text-[var(--w-ink2)]">
              Decisive Moments ({moments.length})
            </h2>

            {moments.map((moment, idx) => (
              <MomentCard key={moment.ply} moment={moment} index={idx} />
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
