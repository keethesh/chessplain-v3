'use client';

import { useEffect, useState, type FormEvent } from 'react';
import Link from 'next/link';
import { Check, ArrowRight, LoaderCircle } from 'lucide-react';
import type { Session } from '@supabase/supabase-js';
import { createCheckoutSession, createBillingPortal } from '../../lib/api';
import { captureEvent } from '../../lib/posthog';
import { supabase } from '../../lib/supabase';

export default function PricingPage() {
  const [interval, setInterval] = useState<'month' | 'year'>('month');
  const [session, setSession] = useState<Session | null>(null);
  const [authReady, setAuthReady] = useState(false);
  const [email, setEmail] = useState('');
  const [sent, setSent] = useState(false);
  const [busy, setBusy] = useState<'checkout' | 'portal' | 'email' | null>(null);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');

  useEffect(() => {
    captureEvent('paywall_viewed');
    const query = new URLSearchParams(window.location.search);
    if (query.get('checkout') === 'success') setNotice('You’ve returned from checkout. Subscription activation may take a moment. You can now try reviewing a game.');
    if (query.get('checkout') === 'cancelled') setNotice('Checkout was cancelled. You can still use your free reports.');
    let active = true;
    supabase.auth.getSession().then(({ data, error }) => { if (active) { setSession(data.session); setAuthReady(true); if (error) setError('Please sign in again to continue.'); } }).catch(() => { if (active) { setAuthReady(true); setError('Couldn’t check your account. Refresh to try again.'); } });
    const { data } = supabase.auth.onAuthStateChange((_event, session) => { if (active) { setSession(session); setAuthReady(true); } });
    return () => { active = false; data.subscription.unsubscribe(); };
  }, []);

  async function sendLink(event: FormEvent) {
    event.preventDefault();
    if (busy) return;
    setBusy('email'); setError('');
    try {
      const { error } = await supabase.auth.signInWithOtp({ email: email.trim(), options: { emailRedirectTo: window.location.origin + '/auth/callback?next=/pricing' } });
      if (error) throw error;
      setSent(true);
    } catch (error) { setError(error instanceof Error ? error.message : 'Couldn’t send your sign-in link. Please try again.'); }
    finally { setBusy(null); }
  }

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
    <div className="pricing-heading"><h1>Make understanding<br />part of your game.</h1><p>Start with two free reviews. If the lessons help, make room for more.</p>
      <div className="billing-choice" aria-label="Billing interval"><button aria-pressed={interval === 'month'} disabled={!!busy} onClick={() => setInterval('month')}>Monthly</button><button aria-pressed={interval === 'year'} disabled={!!busy} onClick={() => setInterval('year')}>Yearly</button></div>
    </div>
    {notice && <div className="max-w-3xl mx-auto mb-6 p-5 rounded-xl bg-[var(--w-accent-soft)] text-sm leading-relaxed" role="status">{notice} <Link href="/#analyze" className="underline">Review a game</Link></div>}
    <div className="pricing-grid">
      <section className="price-plan"><h2>A place to start</h2><p>No account. No card.</p><div className="price-value">$0</div><p>2 reports every 7 days</p>
        <ul>{['Plain-English explanations of key moments', 'An interactive board to check the ideas', 'One practical habit for your next game', 'A link you can revisit or share'].map(item => <li key={item}><Check size={16} />{item}</li>)}</ul>
        <Link className="secondary-button" href="/#analyze">Review a game free <ArrowRight size={16} /></Link>
      </section>
      <section className="price-plan paid"><h2>A regular habit</h2><p>For the games you want to understand.</p><div className="price-value">{interval === 'month' ? '$9.99' : '$99.99'} <small>/ {interval === 'month' ? 'month' : 'year'}</small></div><p>{interval === 'month' ? 'Billed monthly. Renews until cancelled.' : 'Billed $99.99 yearly. Renews until cancelled.'}</p>
        <ul>{['Everything in the free review', 'No weekly report quota for personal use', 'The same careful, readable explanations', 'Manage or cancel through Stripe'].map(item => <li key={item}><Check size={16} />{item}</li>)}</ul>
        {!authReady ? <p role="status" className="text-sm">Checking your account…</p> : session ? <><p className="text-xs break-all text-[var(--w-ink2)] mb-3">Signed in as {session.user.email}</p><button className="primary-button" disabled={!!busy} onClick={() => billing('checkout')}>{busy === 'checkout' ? <><LoaderCircle className="spin" size={16} />Opening checkout…</> : 'Continue to secure checkout'}</button><button className="text-link justify-center mt-2" disabled={!!busy} onClick={() => billing('portal')}>{busy === 'portal' ? 'Opening billing…' : 'Already subscribed? Manage subscription'}</button></> : sent ? <div role="status" className="text-sm leading-relaxed"><p className="font-semibold mb-2">Check your inbox.</p><p>Open the sign-in link in this browser, then return here to subscribe. Sending a link does not start a subscription.</p><button className="text-link underline" onClick={() => setSent(false)}>Use a different email</button></div> : <form onSubmit={sendLink} className="grid gap-3"><label className="text-sm font-medium" htmlFor="billing-email">Sign in to connect your subscription</label><input id="billing-email" className="email-input" type="email" autoComplete="email" placeholder="you@example.com" value={email} onChange={e => setEmail(e.target.value)} required disabled={!!busy} /><button className="primary-button" disabled={!!busy}>{busy === 'email' ? 'Sending…' : 'Email me a sign-in link'}</button><p className="text-xs leading-relaxed text-[var(--w-ink2)]">New here? The link creates your account. You’ll choose and confirm payment on Stripe.</p></form>}
        {error && <p className="form-error mt-4" role="alert">{error}</p>}
      </section>
    </div>
    <div className="max-w-3xl mx-auto mt-10 text-center"><Link className="text-link" href="/report/demo">Read a sample before deciding <ArrowRight size={15} /></Link><p className="text-xs text-[var(--w-ink2)] mt-4 leading-relaxed">Free reports are counted by network. Reports are accessible to anyone with the link.<br />Paid reports still take time to process and are subject to fair use. <Link href="/terms" className="underline">Terms</Link></p></div>
  </div>;
}
