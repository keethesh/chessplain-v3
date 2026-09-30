import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Your chess game review | Chessplain',
  description: 'Explore the moments that changed your game and a useful lesson for your next game.',
  // Reports are noindex; an empty `alternates` stops the root canonical ('/')
  // from being inherited, which would claim every report duplicates the home page.
  alternates: {},
  robots: { index: false, follow: true },
};

export default function ReportLayout({ children }: { children: React.ReactNode }) {
  return children;
}
