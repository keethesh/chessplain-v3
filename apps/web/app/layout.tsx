import type { Metadata, Viewport } from 'next';
import Link from 'next/link';
import { PostHogProvider } from '../components/PostHogProvider';
import { AccountNav } from '../components/AccountNav';
import './globals.css';

// Public marketing origin. Not a credential: it only affects how absolute
// URLs are built for share cards, so a canonical default is safe here.
export const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL || 'https://getchessplain.com';

// Shown on the privacy and terms pages, both of which promise a way to reach a
// human (deletion requests, refunds). This mailbox must actually exist.
export const SUPPORT_EMAIL = process.env.NEXT_PUBLIC_SUPPORT_EMAIL || 'support@getchessplain.com';

const TITLE = 'Chess game review, explained | Chessplain';
const DESCRIPTION = 'Chessplain explains the few moments that changed your chess game, lets you explore them on the board, and gives you one useful lesson for your next game.';

export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  title: TITLE,
  description: DESCRIPTION,
  alternates: { canonical: '/' },
  icons: { icon: '/icon.svg', apple: '/icon.svg' },
  applicationName: 'Chessplain',
  keywords: ['chess game review', 'chess analysis', 'chess improvement', 'explain chess mistakes', 'AI chess coach'],
  openGraph: {
    type: 'website',
    siteName: 'Chessplain',
    title: TITLE,
    description: DESCRIPTION,
    url: SITE_URL,
    locale: 'en_US',
    images: [{ url: `${SITE_URL}/opengraph-image`, width: 1200, height: 630, alt: 'Chessplain: a little clarity, a better next game.' }],
  },
  twitter: {
    card: 'summary_large_image',
    title: TITLE,
    description: DESCRIPTION,
    images: [{ url: `${SITE_URL}/opengraph-image`, width: 1200, height: 630, alt: 'Chessplain: a little clarity, a better next game.' }],
  },
  robots: { index: true, follow: true },
};

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  themeColor: '#111310',
};

const STRUCTURED_DATA = {
  '@context': 'https://schema.org',
  '@graph': [
    {
      '@type': 'Organization',
      '@id': `${SITE_URL}/#organization`,
      name: 'Chessplain',
      url: SITE_URL,
      logo: `${SITE_URL}/icon.svg`,
    },
    {
      '@type': 'WebApplication',
      '@id': `${SITE_URL}/#application`,
      name: 'Chessplain',
      url: SITE_URL,
      description: DESCRIPTION,
      applicationCategory: 'EducationalApplication',
      operatingSystem: 'Web',
      publisher: { '@id': `${SITE_URL}/#organization` },
    },
  ],
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        <link href="https://fonts.googleapis.com/css2?family=IBM+Plex+Sans:wght@400;500;600;700&family=IBM+Plex+Mono:wght@400;500&display=swap" rel="stylesheet" />
        <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(STRUCTURED_DATA) }} />
      </head>
      <body className="min-h-screen flex flex-col font-sans">
        <a href="#main-content" className="skip-link">Skip to content</a>
        <header className="site-header">
          <div className="site-nav page-width">
            <Link href="/" className="wordmark" aria-label="Chessplain home">
              <svg aria-hidden="true" width="29" height="30" viewBox="0 0 29 30" fill="none">
                <path d="M5 25h19M7 21h15L18 15V8H11v7l-4 6ZM10 8h9M14.5 2v6M11.5 5h6" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
              chessplain
            </Link>
            <nav className="nav-links" aria-label="Main navigation">
              <Link href="/report/demo" className="nav-sample">Sample review</Link>
              <Link href="/pricing">Pricing</Link>
              <AccountNav />
              <Link href="/#analyze" className="nav-cta">Review a game</Link>
            </nav>
          </div>
        </header>
        <main id="main-content" className="flex-1">
          <PostHogProvider>{children}</PostHogProvider>
        </main>
        <footer className="site-footer page-width">
          <p>Chessplain. A little more understanding, every game.</p>
          <div>
            <Link href="/pricing">Pricing</Link>
            <Link href="/privacy">Privacy &amp; cookies</Link>
            <Link href="/terms">Terms</Link>
          </div>
        </footer>
      </body>
    </html>
  );
}
