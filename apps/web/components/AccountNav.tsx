'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useSession } from '../lib/use-session';

export function AccountNav() {
  const { session } = useSession();
  const pathname = usePathname();
  if (session) return <Link href="/login">Account</Link>;
  const next = pathname && pathname !== '/login' && pathname !== '/auth/callback' ? `?next=${encodeURIComponent(pathname)}` : '';
  return <Link href={`/login${next}`}>Sign in</Link>;
}
