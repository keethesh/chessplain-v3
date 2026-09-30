import type { Metadata } from 'next';
import { SITE_URL } from '../layout';
const title = 'Chessplain pricing | Free and Premium chess game reviews';
const description = 'Get two free chess game reviews every seven days. Premium removes the weekly quota for $9.99 per month or $99.99 per year, subject to fair use.';

export const metadata: Metadata = {
  title,
  description,
  alternates: { canonical: '/pricing' },
  openGraph: {
    title,
    description,
    url: '/pricing',
    images: [{ url: `${SITE_URL}/opengraph-image`, width: 1200, height: 630, alt: 'Chessplain: a little clarity, a better next game.' }],
  },
  twitter: {
    card: 'summary_large_image',
    title,
    description,
    images: [{ url: `${SITE_URL}/opengraph-image`, width: 1200, height: 630, alt: 'Chessplain: a little clarity, a better next game.' }],
  },
};

export default function PricingLayout({ children }: { children: React.ReactNode }) {
  return children;
}
