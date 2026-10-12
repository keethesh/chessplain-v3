'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { createCheckoutSession, createBillingPortal, getMe } from '../../lib/api';
import { captureEvent } from '../../lib/posthog';
import { supabase } from '../../lib/supabase';
import { invalidateMe, useMe } from '../../lib/use-session';
import { Reveal } from '../../components/Reveal';
import './pricing.css';

const YEARLY_SAVING = '19.89';

export default function PricingPage() {
  const { session, ready: authReady, me, failed } = useMe();
  const premium = me?.tier === 'premium';
  const [upgradedNow, setUpgradedNow] = useState(false);
  const [returnedFromCheckout, setReturnedFromCheckout] = useState(false);
  const [planInterval, setPlanInterval] = useState<'month' | 'year'>('month');
  const [busy, setBusy] = useState<'checkout' | 'portal' | null>(null);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');

  useEffect(() => {
    captureEvent('paywall_viewed');
    const query = new URLSearchParams(window.location.search);
    if (query.get('interval') === 'year') setPlanInterval('year');
    if (query.get('checkout') === 'success') setReturnedFromCheckout(true);
    if (query.get('checkout') === 'cancelled') setNotice('Checkout cancelled. Your free scans and reviews are still here.');
  }, []);

  const token = session?.access_token;
  useEffect(() => {
    if (!returnedFromCheckout || !token) return;
    let active = true;
    let tries = 0;
    let timer: number | undefined;
    const check = async () => {
      try {
        if ((await getMe(token)).tier === 'premium') {
          if (active) { setUpgradedNow(true); invalidateMe(); }
          return;
        }
      } catch { /* The account page shows the plan either way. */ }
      if (active && ++tries < 20) timer = window.setTimeout(check, 3000);
    };
    void check();
    return () => { active = false; clearTimeout(timer); };
  }, [returnedFromCheckout, token]);

  async function billing(action: 'checkout' | 'portal') {
    if (busy || !session) return;
    setBusy(action);
    setError('');
    try {
      const { data } = await supabase.auth.getSession();
      if (!data.session) throw new Error('Your session expired. Sign in again?');
      const result = action === 'checkout'
        ? await createCheckoutSession({ interval: planInterval, token: data.session.access_token })
        : await createBillingPortal(data.session.access_token);
      const url = new URL(result.url);
      if (url.protocol !== 'https:' || !['checkout.stripe.com', 'billing.stripe.com'].includes(url.hostname)) {
        throw new Error('Oops, we couldn’t open secure checkout. Try again?');
      }
      captureEvent(action === 'checkout' ? 'paywall_clicked' : 'billing_portal_opened', { interval: planInterval });
      window.location.assign(url.href);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Oops, we couldn’t open billing. Try again?');
      setBusy(null);
    }
  }

  const yearly = planInterval === 'year';

  function chooseInterval(next: 'month' | 'year') {
    setPlanInterval(next);
    const url = new URL(window.location.href);
    if (next === 'year') url.searchParams.set('interval', 'year');
    else url.searchParams.delete('interval');
    window.history.replaceState(null, '', `${url.pathname}${url.search}${url.hash}`);
  }

  return (
    <div className="page price">
      <header className="price-mast">
        <p className="label">Pricing</p>
        <h1 className="price-title">Drop the weekly limit.</h1>
        <p className="lede">Free is two scans and two full reviews every 7 days. Premium removes both limits.</p>
      </header>

      {returnedFromCheckout && (
        <p className="price-note bg-mint" role="status">
          {upgradedNow || premium
            ? 'You’re Premium! Scans and reviews have no weekly limit.'
            : 'Payment received. Chessplain is switching you to Premium. This usually takes a few seconds.'}{' '}
          <Link href="/#scan">Find your gremlin</Link>
        </p>
      )}
      {notice && (
        <p className="price-note bg-butter" role="status">{notice} <Link href="/#scan">Find your gremlin</Link></p>
      )}

      {!premium && (
        <div className="price-interval" role="group" aria-label="Billing interval">
          <button type="button" className={yearly ? 'btn btn--sm btn--key' : 'btn btn--sm'} aria-pressed={!yearly} disabled={!!busy} onClick={() => chooseInterval('month')}>Monthly</button>
          <button type="button" className={yearly ? 'btn btn--sm' : 'btn btn--sm btn--key'} aria-pressed={yearly} disabled={!!busy} onClick={() => chooseInterval('year')}>Yearly</button>
        </div>
      )}

      <div className="price-grid">
        <section className="panel price-plan" aria-labelledby="price-free">
          <h2 id="price-free" className="h2">Free</h2>
          <p className="price-amount h2">$0</p>
          <p className="muted">No card.</p>
          <ul className="price-includes">
            <li>A scan of your last 10 Chess.com games</li>
            <li>2 scans and 2 full reviews every 7 days</li>
            <li>Try the better move on the board</li>
            <li>One check for your next game</li>
          </ul>
          <div className="price-cta">
            {session && premium ? (
              <p className="small muted">Included with Premium.</p>
            ) : (
              <Link className="btn btn--key" href="/#scan">Find my gremlin <span className="arrow" aria-hidden="true">→</span></Link>
            )}
          </div>
        </section>

        <section className="panel price-plan bg-butter" aria-labelledby="price-premium">
          <h2 id="price-premium" className="h2">Premium</h2>
          {session && premium ? (
            <>
              <p className="tag">Your plan</p>
              <p className="lede">No weekly limit. $9.99 a month or $99.99 a year.</p>
            </>
          ) : (
            <>
              <p className="price-amount h2">{yearly ? '$99.99' : '$9.99'}</p>
              <p className="muted">
                {yearly
                  ? `A year, billed once. $${YEARLY_SAVING} less than twelve monthly payments. Renews until you cancel.`
                  : 'A month. Renews until you cancel.'}
              </p>
            </>
          )}
          <ul className="price-includes">
            <li>Unlimited scans and full reviews</li>
            <li>The same checked explanations</li>
            <li>Cancel any time in the billing portal</li>
          </ul>
          <div className="price-soon">
            <p className="tag">Coming</p>
            <p>Chessplain checks every new game for your gremlin automatically. Not included today.</p>
          </div>
          <div className="price-cta">
            {!authReady ? (
              <p role="status">Chessplain is checking your plan…</p>
            ) : session && premium ? (
              <button type="button" className="btn" disabled={!!busy} onClick={() => billing('portal')}>
                {busy === 'portal' ? 'Opening billing…' : 'Manage subscription'}
              </button>
            ) : session ? (
              <>
                <button type="button" className="btn" disabled={!!busy} onClick={() => billing('checkout')}>
                  Continue to checkout <span className="arrow" aria-hidden="true">→</span>
                </button>
                <p className="small muted">Signed in as <span translate="no">{session.user.email}</span></p>
                <button type="button" className="btn btn--quiet" disabled={!!busy} onClick={() => billing('portal')}>
                  {busy === 'portal' ? 'Opening billing…' : 'Already subscribed? Manage subscription'}
                </button>
              </>
            ) : (
              <>
                <Link className="btn" href={`/login?next=${encodeURIComponent(`/pricing?interval=${planInterval}`)}`}>
                  Sign in to continue <span className="arrow" aria-hidden="true">→</span>
                </Link>
                <p className="small muted">Google or an email link. You come back here to open checkout.</p>
              </>
            )}
            {(error || failed) && <p className="field-note" data-tone="error" role="alert">{error || 'Oops, we couldn’t check your plan. Refresh and try again?'}</p>}
          </div>
        </section>
      </div>

      <Reveal className="price-faq">
        <h2 className="h2">Questions</h2>
        <details>
          <summary>Can I cancel?</summary>
          <p>Yes. Use Manage subscription on this page, or at link.com. You keep Premium until the end of the period you already paid for.</p>
        </details>
        <details>
          <summary>Do I need an account?</summary>
          <p>No. Two free scans and two full reviews every 7 days work without an account or a card. Sign in when you want the gremlin to stay with you.</p>
        </details>
        <details>
          <summary>What does Premium do today?</summary>
          <p>Unlimited scans and unlimited full reviews, started by you. We do not check new games automatically yet. That line above is labelled Coming, and it is not part of the plan today.</p>
        </details>
        <details>
          <summary>How does billing work?</summary>
          <p>Prices are in US dollars. Checkout can show your local currency, and it shows the total, including any tax where you live, before you pay. Purchases are sold through Onelink, Stripe's merchant-of-record service, so your receipt and bank statement show Onelink (LINK.COM). Subscriptions renew each month or year until you cancel.</p>
        </details>
      </Reveal>

      <div className="price-foot">
        <Link className="btn btn--quiet" href="/report/demo">Read a sample game</Link>
        <p className="small muted">Anonymous free scans and reviews are counted by network. Signed-in ones are counted on your account. A review link works for anyone who has it. Paid use still takes time to finish and is subject to fair use. <Link href="/terms">Terms</Link></p>
      </div>
    </div>
  );
}
