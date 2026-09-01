import type { Metadata } from 'next';
import Link from 'next/link';
import { PostHogProvider } from '../components/PostHogProvider';
import './globals.css';

export const metadata: Metadata = {
  title: 'Chessplain — Your games, explained like a person',
  description:
    'Understand why you lost your chess games in plain English. No engine jargon, no accuracy scores.',
  icons: {
    icon: "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 16 16'%3E%3Ccircle cx='8' cy='8' r='6' fill='%23b45309'/%3E%3C/svg%3E",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body className="min-h-screen flex flex-col bg-[var(--w-canvas)] text-[var(--w-ink1)] antialiased">
        <header className="border-b border-[var(--w-border)] bg-[var(--w-surface)]/80 backdrop-blur-sm sticky top-0 z-20 px-4 py-3 sm:px-6">
          <div className="mx-auto flex max-w-5xl items-center justify-between">
            <Link href="/" className="flex items-center gap-2">
              <span className="w-2.5 h-2.5 rounded-full bg-[var(--w-accent)] inline-block"></span>
              <span className="font-serif text-xl font-bold tracking-tight text-[var(--w-ink1)]">
                chessplain
              </span>
            </Link>
            <nav className="flex items-center gap-4 sm:gap-6">
              <Link
                href="/report/demo"
                className="text-xs sm:text-sm font-semibold text-[var(--w-ink2)] hover:text-[var(--w-accent)] transition-colors"
              >
                Sample Demo
              </Link>
              <Link
                href="/pricing"
                className="text-xs sm:text-sm font-semibold text-[var(--w-ink2)] hover:text-[var(--w-ink1)] transition-colors"
              >
                Pricing
              </Link>
              <Link
                href="/"
                className="rounded-lg bg-[var(--w-accent)] px-3.5 py-1.5 text-xs sm:text-sm font-bold text-[var(--w-on-accent)] shadow-sm hover:bg-[var(--w-accent-hover)] transition-all cursor-pointer"
              >
                Analyze Game
              </Link>
            </nav>
          </div>
        </header>

        <main className="flex-1">
          <PostHogProvider>{children}</PostHogProvider>
        </main>

        <footer className="border-t border-[var(--w-border)] bg-[var(--w-surface)] mt-auto px-4 py-8 sm:px-6">
          <div className="mx-auto max-w-5xl flex flex-col sm:flex-row items-center justify-between gap-4 text-xs text-[var(--w-ink2)]">
            <div className="flex items-center gap-2">
              <span className="font-serif font-bold text-sm text-[var(--w-ink1)]">chessplain</span>
              <span>· Plain-English chess game reviews</span>
            </div>
            <div className="flex items-center gap-5">
              <Link href="/report/demo" className="hover:text-[var(--w-ink1)] transition-colors">
                Sample Report
              </Link>
              <Link href="/pricing" className="hover:text-[var(--w-ink1)] transition-colors">
                Pricing
              </Link>
              <Link href="/privacy" className="hover:text-[var(--w-ink1)] transition-colors">
                Privacy
              </Link>
              <Link href="/terms" className="hover:text-[var(--w-ink1)] transition-colors">
                Terms
              </Link>
            </div>
          </div>
        </footer>
      </body>
    </html>
  );
}
