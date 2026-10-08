'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { Check, ArrowRight, LoaderCircle } from 'lucide-react';
import { createCheckoutSession, createBillingPortal, getMe } from '../../lib/api';
import { captureEvent } from '../../lib/posthog';
import { supabase } from '../../lib/supabase';
import { invalidateMe, useMe } from '../../lib/use-session';

export default function PricingPage() {
  const { session, ready: authReady, me, failed } = useMe();
  const premium = me?.tier === 'premium';
  const [upgradedNow, setUpgradedNow] = useState(false);
  const [returnedFromCheckout, setReturnedFromCheckout] = useState(false);
  const [interval, setInterval] = useState<'month' | 'year'>('month');
  const [busy, setBusy] = useState<'checkout' | 'portal' | null>(null);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');

  useEffect(() => {
    captureEvent('paywall_viewed');
    const query = new URLSearchParams(window.location.search);
    if (query.get('interval') === 'year') setInterval('year');
    if (query.get('checkout') === 'success') setReturnedFromCheckout(true);
    if (query.get('checkout') === 'cancelled') setNotice('Checkout was cancelled. You can still use your free reviews.');
  }, []);

  // The plan changes when Stripe's webhook lands, a few seconds after checkout. Wait for it
  // rather than leaving the reader to guess whether the payment worked.
  const token = session?.access_token;
  useEffect(() => {
    if (!returnedFromCheckout || !token) return;
    let active = true;
    let tries = 0;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const check = async () => {
      try {
        if ((await getMe(token)).tier === 'premium') { if (active) { setUpgradedNow(true); invalidateMe(); } return; }
      } catch { /* Keep waiting; the account page shows the plan either way. */ }
      if (active && ++tries < 20) timer = setTimeout(check, 3000);
    };
    void check();
    return () => { active = false; clearTimeout(timer); };
  }, [returnedFromCheckout, token]);

  async function billing(action: 'checkout' | 'portal') {
    if (busy || !session) return;
    setBusy(action); setError('');
    try {
      const { data } = await supabase.auth.getSession();
      if (!data.session) throw new Error('Your session expired. Sign in again to continue.');
      const result = action === 'checkout' ? await createCheckoutSession({ interval, token: data.session.access_token }) : await createBillingPortal(data.session.access_token);
      const url = new URL(result.url);
      if (url.protocol !== 'https:' || !['checkout.stripe.com', 'billing.stripe.com'].includes(url.hostname)) throw new Error('We couldn’t open secure checkout. Please try again.');
      captureEvent(action === 'checkout' ? 'paywall_clicked' : 'billing_portal_opened', { interval });
      window.location.assign(url.href);
    } catch (error) { setError(error instanceof Error ? error.message : 'Couldn’t open billing. Please try again.'); setBusy(null); }
  }

  return <div className="page-width py-12 sm:py-16">
    <div className="pricing-heading"><h1>{premium ? <>You’re on Premium.</> : <>Make understanding<br />part of your game.</>}</h1><p>{premium ? 'Reviews have no weekly limit. Thank you for supporting Chessplain.' : 'Start with two free reviews. If the lessons help, make room for more.'}</p>
      {!premium && <div className="billing-choice" aria-label="Billing interval"><button aria-pressed={interval === 'month'} disabled={!!busy} onClick={() => setInterval('month')}>Monthly</button><button aria-pressed={interval === 'year'} disabled={!!busy} onClick={() => setInterval('year')}>Yearly</button></div>}
    </div>
    {returnedFromCheckout && <div className="max-w-3xl mx-auto mb-6 p-5 rounded-md bg-[var(--w-accent-soft)] text-sm leading-relaxed" role="status">{upgradedNow || premium ? 'You’re Premium now. Reviews have no weekly limit.' : 'Payment received. Switching your account to Premium, this usually takes a few seconds…'} <Link href="/#analyze" className="underline">Review a game</Link></div>}
    {notice && <div className="max-w-3xl mx-auto mb-6 p-5 rounded-md bg-[var(--w-accent-soft)] text-sm leading-relaxed" role="status">{notice} <Link href="/#analyze" className="underline">Review a game</Link></div>}
    <div className="pricing-grid">
      <section className="price-plan"><h2>{session && !premium ? 'Your current plan' : 'A place to start'}</h2><p>{session ? 'No card needed.' : 'No account. No card.'}</p><div className="price-value">$0</div><p>2 reviews every 7 days</p>
        <ul>{['Plain-English explanations of key moments', 'An interactive board to check the ideas', 'One practical habit for your next game', 'A link you can revisit or share'].map(item => <li key={item}><Check size={16} />{item}</li>)}</ul>
        <Link className="secondary-button" href="/#analyze">Review a game {session ? '' : 'free '}<ArrowRight size={16} /></Link>
      </section>
      <section className="price-plan paid"><h2>A regular habit</h2><p>For the games you want to understand.</p><div className="price-value">{interval === 'month' ? '$9.99' : '$99.99'} <small>/ {interval === 'month' ? 'month' : 'year'}</small></div><p>{interval === 'month' ? 'Billed monthly. Renews until cancelled.' : 'Billed $99.99 yearly. Renews until cancelled.'}</p>
        <ul>{['Everything in the free review', 'No weekly report quota for personal use', 'The same careful, readable explanations', 'Manage or cancel anytime through Stripe'].map(item => <li key={item}><Check size={16} />{item}</li>)}</ul>
        {!authReady ? (
          <p role="status" className="text-sm text-[var(--w-ink2)]">Checking your account…</p>
        ) : session && premium ? (
          <div className="space-y-3">
            <p className="rounded bg-[var(--w-accent-soft)] p-2.5 text-xs font-semibold text-[var(--w-accent)]">✓ Your current plan</p>
            <button className="secondary-button w-full justify-center" disabled={!!busy} onClick={() => billing('portal')}>
              {busy === 'portal' ? <><LoaderCircle className="spin" size={16} />Opening billing…</> : 'Manage subscription'}
            </button>
          </div>
        ) : session ? (
          <div className="space-y-3">
            <button className="primary-button w-full justify-center" disabled={!!busy} onClick={() => billing('checkout')}>
              {busy === 'checkout' ? <><LoaderCircle className="spin" size={16} />Opening Stripe checkout…</> : <>Continue to Stripe checkout <ArrowRight size={16} /></>}
            </button>
            <p className="text-xs text-[var(--w-ink2)] text-center">Signed in as {session.user.email}</p>
            <button className="text-link justify-center text-xs w-full" disabled={!!busy} onClick={() => billing('portal')}>
              {busy === 'portal' ? 'Opening billing…' : 'Already subscribed? Manage subscription'}
            </button>
          </div>
        ) : (
          <div className="space-y-3">
            <Link className="primary-button w-full justify-center" href={`/login?next=${encodeURIComponent(`/pricing?interval=${interval}`)}`}>
              Sign in to continue <ArrowRight size={16} />
            </Link>
            <p className="text-xs text-[var(--w-ink2)] text-center">Use Google or an email sign-in link. You’ll return here to open Stripe checkout.</p>
          </div>
        )}
        {(error || failed) && <p className="form-error mt-4" role="alert">{error || 'We couldn’t check your current plan. Refresh to try again.'}</p>}
      </section>
    </div>

    {/* Pricing FAQ */}
    <div className="max-w-2xl mx-auto mt-14 pt-10 border-t border-[var(--w-border)]">
      <h2 className="t-heading text-2xl mb-6 text-center">Common questions</h2>
      <div className="space-y-4 text-left">
        <div className="rounded-md border border-[var(--w-border)] bg-[var(--w-surface)] p-4">
          <h3 className="font-semibold text-sm mb-1">Can I cancel at any time?</h3>
          <p className="text-xs leading-relaxed text-[var(--w-ink2)]">Yes. Cancel with Manage subscription on this page or at link.com whenever you want. You keep premium access until the end of your paid billing period.</p>
        </div>
        {!session && <div className="rounded-md border border-[var(--w-border)] bg-[var(--w-surface)] p-4">
          <h3 className="font-semibold text-sm mb-1">Do I need an account for the free tier?</h3>
          <p className="text-xs leading-relaxed text-[var(--w-ink2)]">No account or credit card needed. You can review 2 games every 7 days directly on the homepage.</p>
        </div>}
        <div className="rounded-md border border-[var(--w-border)] bg-[var(--w-surface)] p-4">
          <h3 className="font-semibold text-sm mb-1">How does billing work?</h3>
          <p className="text-xs leading-relaxed text-[var(--w-ink2)]">Prices are in US dollars. Checkout can show your local currency and shows your total, including any tax where you live, before you pay. Purchases are sold through Onelink, Stripe&apos;s merchant-of-record service, so your receipt and bank statement show Onelink (LINK.COM). Subscriptions renew automatically each month or year until cancelled.</p>
        </div>
      </div>
    </div>

    <div className="max-w-3xl mx-auto mt-10 text-center"><Link className="text-link" href="/report/demo">Read a sample before deciding <ArrowRight size={15} /></Link><p className="text-xs text-[var(--w-ink2)] mt-4 leading-relaxed">Anonymous free reviews are counted by network; signed-in reviews are counted by account. Reviews are accessible to anyone with the link.<br />Paid reviews still take time to process and are subject to fair use. <Link href="/terms" className="underline">Terms</Link></p></div>
  </div>;
}
