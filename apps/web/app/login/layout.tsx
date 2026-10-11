import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Sign in | Chessplain',
  description: 'Sign in with Google or an email link so your gremlin and your plan stay on your account.',
  alternates: { canonical: '/login' },
  robots: { index: false, follow: true },
};

export default function LoginLayout({ children }: { children: React.ReactNode }) {
  return children;
}
