'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useMe } from '../lib/use-session';

/** The header links. What they offer depends on who is looking: a visitor is sold the product; a signed-in player is taken to their own things. */
export function SiteNav() {
  const { signedIn, ready, me } = useMe();
  const pathname = usePathname() ?? '/';
  // A review page already carries its own "review your own game" button.
  const onReview = pathname === '/report/demo' || pathname.startsWith('/r/');
  const next = pathname !== '/' && pathname !== '/login' && pathname !== '/auth/callback' ? `?next=${encodeURIComponent(pathname)}` : '';
  const premium = me?.tier === 'premium';

  return (
    <nav className="nav-links" aria-label="Main navigation">
      {!signedIn && <Link href="/report/demo" className="nav-sample">Sample review</Link>}
      {!premium && <Link href="/pricing">Pricing</Link>}
      {ready && (signedIn ? <Link href="/account">Your reviews</Link> : <Link href={`/login${next}`}>Sign in</Link>)}
      {!onReview && <Link href="/#analyze" className="nav-cta">Review a game</Link>}
    </nav>
  );
}
