import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Signing in | Chessplain',
  description: 'Complete your secure Chessplain sign-in link.',
  alternates: { canonical: '/auth/callback' },
  robots: { index: false, follow: false },

};
export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return children;
}
