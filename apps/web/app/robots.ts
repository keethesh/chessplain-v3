import type { MetadataRoute } from 'next';
import { SITE_URL } from './layout';

export default function robots(): MetadataRoute.Robots {
  return {
    rules: [
      {
        userAgent: '*',
        allow: '/',
        // Permit crawling so search engines can see the reports' noindex tags.
        // A robots.txt block alone cannot prevent a linked URL being indexed.
        disallow: [],
      },
    ],
    sitemap: `${SITE_URL}/sitemap.xml`,
    host: SITE_URL,
  };
}
