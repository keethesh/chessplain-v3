import type { MetadataRoute } from 'next';
import { SITE_URL } from './layout';

// Only stable public pages. Individual reports are excluded on purpose: they
// belong to whoever generated them and are shared by link, not discovered.
export default function sitemap(): MetadataRoute.Sitemap {
  const lastModified = new Date();

  return [
    { url: SITE_URL, lastModified, changeFrequency: 'weekly', priority: 1 },
    { url: `${SITE_URL}/pricing`, lastModified, changeFrequency: 'monthly', priority: 0.8 },
    { url: `${SITE_URL}/r/demo-sample`, lastModified, changeFrequency: 'monthly', priority: 0.7 },
    { url: `${SITE_URL}/privacy`, lastModified, changeFrequency: 'yearly', priority: 0.3 },
    { url: `${SITE_URL}/terms`, lastModified, changeFrequency: 'yearly', priority: 0.3 },
  ];
}
