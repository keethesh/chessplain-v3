'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Gremlin } from '../../components/Gremlin';
import { createBillingPortal, type Allowance, type Me, type MeReview } from '../../lib/api';
import { GREMLINS } from '../../lib/gremlins';
import { supabase } from '../../lib/supabase';
import { invalidateMe, useMe } from '../../lib/use-session';
import './account.css';

function formatDay(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return '';
  return new Intl.DateTimeFormat('en', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' }).format(date);
}

function formatWeekday(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return '';
  return new Intl.DateTimeFormat('en', { weekday: 'long', day: 'numeric', month: 'short', timeZone: 'UTC' }).format(date);
}

function allowanceCopy(kind: string, allowance: Allowance | null, premium: boolean): string {
  if (premium) return `No weekly limit on ${kind}.`;
  if (!allowance) return `Oops, we couldn’t read how many ${kind} you have left.`;
  const left = Math.max(0, allowance.limit - allowance.used);
  const when = left === 0 && allowance.next_slot_at ? formatWeekday(allowance.next_slot_at) : '';
  return when
    ? `${left} of ${allowance.limit} ${kind} left this week. Next one opens ${when}.`
    : `${left} of ${allowance.limit} ${kind} left this week.`;
}

function scanTitle(scan: Me['scans'][number]): string {
  if (scan.status === 'failed') return 'Didn’t finish. Try again?';
  if (scan.status !== 'completed') return 'Reading your games…';
  if (!scan.top_concept_id) return 'Nothing decisive. Nice!';
  const name = GREMLINS[scan.top_concept_id].name;
  return scan.games_with_concept > 0 ? `${name} in ${scan.games_with_concept}` : name;
}

function reviewTitle(review: MeReview): string {
  if (review.headline) return review.headline;
  if (review.status === 'failed') return 'Oops, this game didn’t finish.';
  if (review.status !== 'completed') return 'Writing this review…';
  return 'Game review';
}

function reviewMeta(review: MeReview): string {
  const names = [review.white_player, review.black_player];
  const them = review.player_color === 'black' ? names[0] : review.player_color === 'white' ? names[1] : null;
  const bits = [them ? `vs ${them}` : '', formatDay(review.created_at)];
  if (review.status === 'completed' && review.moment_count > 0) bits.push(review.moment_count === 1 ? '1 moment' : `${review.moment_count} moments`);
  else if (review.status === 'failed') bits.push('Didn’t finish');
  else if (review.status !== 'completed') bits.push('Still writing');
  return bits.filter(Boolean).join(' · ');
}

export default function AccountPage() {
  const router = useRouter();
  const { signedIn, ready, me, failed, session, retry } = useMe();
  const [busy, setBusy] = useState<'portal' | 'signout' | null>(null);
  const [error, setError] = useState('');

  useEffect(() => {
    if (ready && !signedIn && busy !== 'signout') router.replace('/login?next=%2Faccount');
  }, [ready, signedIn, busy, router]);

  async function openPortal() {
    if (busy || !session) return;
    setBusy('portal');
    setError('');
    try {
      const url = new URL((await createBillingPortal(session.access_token)).url);
      if (url.protocol !== 'https:' || url.hostname !== 'billing.stripe.com') throw new Error('Oops, we couldn’t open billing. Try again?');
      window.location.assign(url.href);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Oops, we couldn’t open billing. Try again?');
      setBusy(null);
    }
  }

  async function signOut() {
    setBusy('signout');
    await supabase.auth.signOut();
    invalidateMe();
    router.replace('/');
  }

  if (!ready || !signedIn) {
    return <div className="page acct"><p role="status">Chessplain is checking your sign-in…</p></div>;
  }

  const premium = me?.tier === 'premium';
  const idea = me?.open_idea ?? null;
  const email = me?.email || session?.user.email;

  return (
    <div className="page acct">
      {!me && !failed ? (
        <div>
          <p className="sr-only" role="status">Chessplain is opening your account…</p>
          <div className="acct-skel" aria-hidden="true">
            <div className="skeleton" />
            <div className="skeleton" />
          </div>
        </div>
      ) : failed && !me ? (
        <p role="alert">Oops, we couldn’t load your account. <button type="button" className="btn btn--quiet" onClick={retry}>Try again</button></p>
      ) : me && idea ? (
        <section className="panel acct-idea bg-concept" data-concept={idea.concept.id}>
          <div className="acct-idea__copy">
            <h1 className="h1">{idea.concept.gremlin}.</h1>
            <p className="lede">{idea.concept.name}. Showed up in {idea.games_with_concept} of your last {idea.games_scanned} games.</p>
            <blockquote className="acct-habit"><p>{idea.concept.habit}</p></blockquote>
            <Link className="btn" href={idea.example_report_id ? `/report/${idea.example_report_id}` : `/scan/${idea.scan_id}`}>
              {idea.example_report_id ? 'See it in your game' : 'See this scan'} <span className="arrow" aria-hidden="true">→</span>
            </Link>
          </div>
          <Gremlin className="acct-gremlin" concept={idea.concept.id} size={240} label={idea.concept.gremlin} priority />
        </section>
      ) : (
        <section className="panel acct-idea bg-lilac">
          <div className="acct-idea__copy">
            <h1 className="h1">No gremlin yet!</h1>
            <p className="lede">Scan your last 10 games. We’ll name the mistake that keeps showing up.</p>
            <Link className="btn" href="/#scan">Find my gremlin <span className="arrow" aria-hidden="true">→</span></Link>
          </div>
          <Gremlin className="acct-gremlin" concept="hanging_piece" size={220} />
        </section>
      )}

      {me && (
        <>
          <div className="acct-split">
            <section className="surface acct-block" aria-labelledby="acct-scans">
              <h2 id="acct-scans" className="h3">Scans</h2>
              {me.scans.length === 0 ? <p className="muted">No scans yet. Your last 10 games will show up here.</p> : (
                <ul className="acct-list">
                  {me.scans.map(scan => (
                    <li key={scan.id}>
                      <Link className="acct-row" href={`/scan/${scan.id}`}>
                        <span className="acct-row__title">{scanTitle(scan)}</span>
                        <time className="small muted move" dateTime={scan.created_at}>{formatDay(scan.created_at)}</time>
                      </Link>
                    </li>
                  ))}
                </ul>
              )}
            </section>
            <section className="surface acct-block" aria-labelledby="acct-reviews">
              <h2 id="acct-reviews" className="h3">Reviews</h2>
              {me.reviews.length === 0 ? <p className="muted">No full reviews yet. Open one from a scan when you want the whole game.</p> : (
                <ul className="acct-list">
                  {me.reviews.map(review => (
                    <li key={review.id}>
                      <Link className="acct-row" href={`/report/${review.id}`}>
                        <span className="acct-row__title">{reviewTitle(review)}</span>
                        <span className="small muted" translate="no">{reviewMeta(review)}</span>
                      </Link>
                    </li>
                  ))}
                </ul>
              )}
            </section>
          </div>

          <section className="acct-block" aria-labelledby="acct-patterns">
            <h2 id="acct-patterns" className="h3">What came back</h2>
            {me.patterns.length === 0 ? <p className="surface muted">Nothing has come back twice. Scan again after you’ve played more.</p> : (
              <ul className="acct-patterns">
                {me.patterns.map(pattern => (
                  <li key={pattern.concept.id} className="surface acct-pattern bg-concept" data-concept={pattern.concept.id}>
                    <Gremlin concept={pattern.concept.id} size={72} />
                    <div>
                      <p className="h3">{pattern.concept.gremlin}</p>
                      <p className="small">{pattern.concept.name}. {pattern.count === 1 ? '1 review' : `${pattern.count} reviews`}.</p>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </section>
        </>
      )}

      {(me || failed) && <section className="surface acct-plan" aria-labelledby="acct-plan">
        <h2 id="acct-plan" className="h2">{me ? (premium ? 'Premium' : 'Free') : 'Plan'}</h2>
        {email ? <p className="small muted">Signed in as <span translate="no">{email}</span></p> : null}
        {me && (
          <>
            <p>{allowanceCopy('reviews', me.allowance, premium)}</p>
            <p>{allowanceCopy('scans', me.scan_allowance, premium)}</p>
          </>
        )}
        <div className="acct-actions">
          {premium ? (
            <button type="button" className="btn" onClick={openPortal} disabled={!!busy}>
              {busy === 'portal' ? 'Opening billing…' : 'Manage subscription'}
            </button>
          ) : (
            <>
              {me && <Link className="btn" href="/pricing">See Premium <span className="arrow" aria-hidden="true">→</span></Link>}
              <button type="button" className={me ? 'btn btn--quiet' : 'btn'} onClick={openPortal} disabled={!!busy}>
                {busy === 'portal' ? 'Opening billing…' : me ? 'Already subscribed? Manage' : 'Manage subscription'}
              </button>
            </>
          )}
          <button type="button" className="btn btn--quiet" onClick={signOut} disabled={!!busy}>
            {busy === 'signout' ? 'Signing out…' : 'Sign out'}
          </button>
        </div>
        {error && <p className="field-note" data-tone="error" role="alert">{error}</p>}
        {me && idea && (
          <Link className="btn btn--key" href="/#scan">Scan your last 10 again <span className="arrow" aria-hidden="true">→</span></Link>
        )}
      </section>}
    </div>
  );
}
