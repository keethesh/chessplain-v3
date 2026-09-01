import React from 'react';
import Link from 'next/link';
import { getReportByShareId } from '../../../lib/api';
import { ShareViewTracker } from '../../../components/ShareViewTracker';
import { SharedReportInteractiveView } from '../../../components/SharedReportInteractiveView';
import { BookOpen } from 'lucide-react';

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
        <div className="card-box p-8 border border-[var(--w-border-strong)] bg-[var(--w-surface)] shadow-md">
          <h2 className="t-heading text-2xl mb-2 text-[var(--w-ink1)]">Report not found</h2>
          <p className="t-body text-[var(--w-ink2)] mb-6">
            This shared game analysis link is expired or invalid.
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
