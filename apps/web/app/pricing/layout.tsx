import type { Metadata } from 'next';
import { SITE_URL } from '../layout';
const title = 'Pricing | Chessplain';
const description = 'Two scans and two full reviews every 7 days are free. Premium is $9.99 a month or $99.99 a year, with no weekly limit.';

export const metadata: Metadata = {
  title,
  description,
  alternates: { canonical: '/pricing' },
  openGraph: {
    title,
    description,
    url: '/pricing',
    images: [{ url: `${SITE_URL}/opengraph-image`, width: 1200, height: 630, alt: 'Chessplain: find the mistake you keep making.' }],
  },
  twitter: {
    card: 'summary_large_image',
    title,
    description,
    images: [{ url: `${SITE_URL}/opengraph-image`, width: 1200, height: 630, alt: 'Chessplain: find the mistake you keep making.' }],
  },
};

export default function PricingLayout({ children }: { children: React.ReactNode }) {
  return children;
}
