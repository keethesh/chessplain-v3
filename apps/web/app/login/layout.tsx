import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Sign in | Chessplain',
  description: 'Sign in to Chessplain to use your account’s free chess game reviews and manage your subscription.',
  alternates: { canonical: '/login' },
  robots: { index: false, follow: true },
};

export default function LoginLayout({ children }: { children: React.ReactNode }) {
  return children;
}
