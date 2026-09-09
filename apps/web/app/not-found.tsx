import React from 'react';
import Link from 'next/link';
import type { Metadata } from 'next';
import { ArrowRight } from 'lucide-react';

export const metadata: Metadata = {
  title: 'Page not found — Chessplain',
  robots: { index: false, follow: true },
};

// Links pasted into X, Instagram and TikTok get truncated, wrapped and
// re-typed, so a wrong URL is a normal arrival path rather than an edge case.
// Give it somewhere to go instead of a dead end.
export default function NotFound() {
  return (
    <div className="page-width py-16 max-w-2xl">
      <h1 className="t-display mb-5">This page doesn’t exist.</h1>
      <p className="t-body text-[var(--w-ink2)] mb-7">
        The link may have been cut short — that happens often when a URL is shared on social apps. If you were
        opening a shared review, ask for the link again. Otherwise you can review a game of your own.
      </p>
      <div className="flex flex-wrap gap-3">
        <Link className="primary-button" href="/#analyze">
          Review a game <ArrowRight size={16} />
        </Link>
        <Link className="secondary-button" href="/r/demo-sample">
          Read a sample review
        </Link>
      </div>
    </div>
  );
}
