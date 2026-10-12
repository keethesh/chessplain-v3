import type { Metadata, Viewport } from 'next';
import Link from 'next/link';
import { PostHogProvider } from '../components/PostHogProvider';
import { SiteNav } from '../components/SiteNav';
import './globals.css';

// Public marketing origin. Not a credential: it only affects how absolute
// URLs are built for share cards, so a canonical default is safe here.
export const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL || 'https://getchessplain.com';

// Shown on the privacy and terms pages, both of which promise a way to reach a
// human (deletion requests, refunds). This mailbox must actually exist.
export const SUPPORT_EMAIL = process.env.NEXT_PUBLIC_SUPPORT_EMAIL || 'support@getchessplain.com';

const TITLE = 'Find the mistake you keep making | Chessplain';
const DESCRIPTION = 'Chessplain reads your last 10 Chess.com games, finds the mistake that keeps costing you, shows it on the board and gives you one check for your next game.';

export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  title: TITLE,
  description: DESCRIPTION,
  alternates: { canonical: '/' },
  icons: {
    icon: [{ url: '/icon-32.png', sizes: '32x32', type: 'image/png' }, { url: '/icon-192.png', sizes: '192x192', type: 'image/png' }],
    apple: '/apple-icon.png',
  },
  applicationName: 'Chessplain',
  keywords: ['chess coach', 'recurring chess mistakes', 'chess improvement', 'chess game review', 'hanging pieces', 'Chess.com analysis'],
  openGraph: {
    type: 'website',
    siteName: 'Chessplain',
    title: TITLE,
    description: DESCRIPTION,
    url: SITE_URL,
    locale: 'en_US',
    images: [{ url: `${SITE_URL}/opengraph-image`, width: 1200, height: 630, alt: 'Chessplain: find the mistake you keep making.' }],
  },
  twitter: {
    card: 'summary_large_image',
    title: TITLE,
    description: DESCRIPTION,
    images: [{ url: `${SITE_URL}/opengraph-image`, width: 1200, height: 630, alt: 'Chessplain: find the mistake you keep making.' }],
  },
  robots: { index: true, follow: true },
};

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  themeColor: '#ffffff',
};

const STRUCTURED_DATA = {
  '@context': 'https://schema.org',
  '@graph': [
    {
      '@type': 'Organization',
      '@id': `${SITE_URL}/#organization`,
      name: 'Chessplain',
      url: SITE_URL,
      logo: `${SITE_URL}/logo-512.png`,
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
        <link rel="preconnect" href="https://api.fontshare.com" crossOrigin="anonymous" />
        <link href="https://fonts.googleapis.com/css2?family=Archivo:wdth,wght@125,800;125,900&display=swap" rel="stylesheet" />
        <link href="https://api.fontshare.com/v2/css?f[]=satoshi@400,500,700&display=swap" rel="stylesheet" />
        <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(STRUCTURED_DATA) }} />
      </head>
      <body className="flex min-h-dvh flex-col">
        <a href="#main-content" className="skip-link">Skip to content</a>
        <header className="site-header">
          <div className="site-header__inner page">
            <Link href="/" className="wordmark" aria-label="Chessplain home">
              {/* eslint-disable-next-line @next/next/no-img-element -- static brand mark, no optimisation needed */}
              <img className="wordmark__mark" src="/logo.png" alt="" width={40} height={40} />
              Chessplain
            </Link>
            <SiteNav />
          </div>
        </header>
        <main id="main-content" className="flex-1">
          <PostHogProvider>{children}</PostHogProvider>
        </main>
        <footer className="site-footer">
          <div className="site-footer__inner page">
            <p className="m-0">Chessplain. Find the mistake you keep making.</p>
            <nav className="site-footer__links" aria-label="Footer">
              <Link href="/report/demo">Sample review</Link>
              <Link href="/pricing">Pricing</Link>
              <Link href="/privacy">Privacy &amp; cookies</Link>
              <Link href="/terms">Terms</Link>
            </nav>
          </div>
        </footer>
      </body>
    </html>
  );
}
