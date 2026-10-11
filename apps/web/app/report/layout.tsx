import { Suspense } from 'react';
import type { Metadata } from 'next';
import './report.css';

export const metadata: Metadata = {
  title: 'Your chess game review | Chessplain',
  description: 'The moment that changed your game, and one check for the next one.',
  // Reports are noindex; an empty `alternates` stops the root canonical ('/')
  // from being inherited, which would claim every report duplicates the home page.
  alternates: {},
  robots: { index: false, follow: true },
};

export default function ReportLayout({ children }: { children: React.ReactNode }) {
  return (
    <Suspense fallback={<div className="page report-wait"><h1 className="h2">Reading the game.</h1></div>}>
      {children}
    </Suspense>
  );
}
