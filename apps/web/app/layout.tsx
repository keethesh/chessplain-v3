import type { Metadata } from 'next';
import Link from 'next/link';
import { PostHogProvider } from '../components/PostHogProvider';
import './globals.css';
// Public marketing origin. Not a credential — it only affects how absolute
// URLs are built for share cards, so a canonical default is safe here.
export const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL || 'https://getchessplain.com';

// Shown on the privacy and terms pages, both of which promise a way to reach a
// human (deletion requests, refunds). This mailbox must actually exist.
export const SUPPORT_EMAIL = process.env.NEXT_PUBLIC_SUPPORT_EMAIL || 'support@getchessplain.com';

const TITLE = 'Chessplain — A little clarity. A better next game.';
const DESCRIPTION = 'Understand the moments that changed your chess game, explore them on the board, and take one useful lesson into your next game.';

export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  title: TITLE,
  description: DESCRIPTION,
  icons: { icon: '/icon.svg' },
  applicationName: 'Chessplain',
  keywords: ['chess', 'game review', 'chess analysis', 'chess improvement', 'blunder', 'chess coach'],
  openGraph: {
    type: 'website',
    siteName: 'Chessplain',
    title: TITLE,
    description: DESCRIPTION,
    url: SITE_URL,
    locale: 'en_US',
  },
  twitter: {
    card: 'summary_large_image',
    title: TITLE,
    description: DESCRIPTION,
  },
  robots: { index: true, follow: true },
};
export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="en">
    <head>
      <link rel="preconnect" href="https://fonts.googleapis.com" />
      <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
      <link href="https://fonts.googleapis.com/css2?family=Newsreader:ital,opsz,wght@0,6..72,400..700;1,6..72,400..700&display=swap" rel="stylesheet" />
    </head>
    <body className="min-h-screen flex flex-col">
      <a href="#main-content" className="skip-link">Skip to content</a>
      <header className="site-header"><div className="site-nav page-width">
        <Link href="/" className="wordmark" aria-label="Chessplain home"><svg aria-hidden="true" width="29" height="30" viewBox="0 0 29 30" fill="none"><path d="M5 25h19M7 21h15L18 15V8H11v7l-4 6ZM10 8h9M14.5 2v6M11.5 5h6" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" /></svg>chessplain</Link>
        <nav className="nav-links" aria-label="Main navigation"><Link href="/report/demo">Sample review</Link><Link href="/pricing">Pricing</Link><Link href="/#analyze" className="nav-cta">Review a game</Link></nav>
      </div></header>
      <main id="main-content" className="flex-1"><PostHogProvider>{children}</PostHogProvider></main>
      <footer className="site-footer page-width"><p>Chessplain · A little more understanding, every game.</p><div><Link href="/pricing">Pricing</Link><Link href="/privacy">Privacy</Link><Link href="/terms">Terms</Link></div></footer>
    </body>
  </html>;
}
