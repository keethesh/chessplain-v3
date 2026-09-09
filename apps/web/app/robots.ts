import type { MetadataRoute } from 'next';
import { SITE_URL } from './layout';

export default function robots(): MetadataRoute.Robots {
  return {
    rules: [
      {
        userAgent: '*',
        allow: '/',
        // A private report URL is only unguessable, not access-controlled, so it
        // must not end up in a search index. Sharing is the /r/<shareId> route,
        // which is deliberately public and indexable.
        disallow: ['/report/', '/auth/'],
      },
    ],
    sitemap: `${SITE_URL}/sitemap.xml`,
    host: SITE_URL,
  };
}
