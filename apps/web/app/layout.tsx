import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'Chessplain — Your games, explained like a person',
  description: 'Understand why you lost your chess games in plain English. No engine jargon, no accuracy scores.',
  icons: {
    icon: "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 16 16'%3E%3Ccircle cx='8' cy='8' r='6' fill='%234338ca'/%3E%3C/svg%3E",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body className="min-h-screen bg-[var(--w-canvas)] text-[var(--w-ink1)] antialiased">
        <header className="border-b border-[var(--w-border)] px-4 py-3 sm:px-6">
          <div className="mx-auto flex max-w-5xl items-center justify-between">
            <a href="/" className="text-xl font-bold tracking-tight text-[var(--w-ink1)]">
              chessplain
            </a>
            <div className="flex items-center gap-4">
              <a href="/pricing" className="text-sm font-medium text-[var(--w-ink2)] hover:text-[var(--w-ink1)]">
                Pricing
              </a>
              <a
                href="/"
                className="rounded-md bg-[var(--w-accent)] px-3 py-1.5 text-sm font-medium text-[var(--w-on-accent)] transition-colors hover:opacity-90"
              >
                Analyze game
              </a>
            </div>
          </div>
        </header>
        <main>{children}</main>
      </body>
    </html>
  );
}
