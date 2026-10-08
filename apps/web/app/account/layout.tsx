import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Your reviews | Chessplain',
  // Per-user page: keep it out of search and don't inherit the home canonical.
  alternates: {},
  robots: { index: false, follow: false },
};

export default function AccountLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return children;
}
