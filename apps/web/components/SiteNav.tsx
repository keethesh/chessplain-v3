'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useMe } from '../lib/use-session';

/** Header links. A visitor is offered the scan; a signed-in player is taken to their open idea. */
export function SiteNav() {
  const { signedIn, ready, me } = useMe();
  const pathname = usePathname() ?? '/';
  const next = pathname !== '/' && pathname !== '/login' && pathname !== '/auth/callback' ? `?next=${encodeURIComponent(pathname)}` : '';
  const premium = me?.tier === 'premium';
  const onHome = pathname === '/';

  return (
    <nav className="nav" aria-label="Main navigation">
      {!premium && (
        <Link href="/pricing" className="nav__link nav__link--secondary" aria-current={pathname === '/pricing' ? 'page' : undefined}>Pricing</Link>
      )}
      {ready && (signedIn
        ? <Link href="/account" className="nav__link" aria-current={pathname === '/account' ? 'page' : undefined}>Account</Link>
        : <Link href={`/login${next}`} className="nav__link">Sign in</Link>)}
      {!(onHome && signedIn) && (
        <Link href={signedIn ? '/' : '/#scan'} className="btn btn--sm">
          {signedIn ? 'Your gremlin' : <><span className="nav__cta-long">Find my gremlin</span><span className="nav__cta-short">Scan</span></>}
        </Link>
      )}
    </nav>
  );
}
