'use client';

import React, { useEffect, useState } from 'react';
import { Check, Sparkles, Zap, Shield, HelpCircle } from 'lucide-react';
import { createCheckoutSession } from '../../lib/api';
import { captureEvent } from '../../lib/posthog';

export default function PricingPage() {
  const [interval, setInterval] = useState<'month' | 'year'>('month');
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    captureEvent('paywall_viewed', {});
  }, []);

  const handleCheckout = async (chosenInterval: 'month' | 'year') => {
    setIsLoading(true);
    setError(null);
    captureEvent('paywall_clicked', { interval: chosenInterval });

    try {
      const { url } = await createCheckoutSession({
        interval: chosenInterval,
        returnUrl: window.location.origin,
      });
      if (url) {
        window.location.href = url;
      } else {
        throw new Error('Could not create checkout URL');
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Checkout failed';
      setError(msg);
      setIsLoading(false);
    }
  };

  return (
    <div className="mx-auto max-w-5xl px-4 py-16 sm:px-6 sm:py-24">
      {/* Header */}
      <div className="text-center max-w-3xl mx-auto">
        <span className="badge-accent mb-3 inline-flex text-xs font-semibold uppercase tracking-wider">
          Simple, Transparent Pricing
        </span>
        <h1 className="t-display sm:text-4xl text-3xl font-bold tracking-tight text-[var(--w-ink1)]">
          Unlimited plain-English game breakdowns.
        </h1>
        <p className="t-body sm:text-lg text-base muted mt-4">
          Stop getting graded on accuracy numbers. Understand what you were thinking and build habits that stick.
        </p>

        {/* Interval toggle */}
        <div className="mt-8 flex justify-center items-center gap-3">
          <span className={`text-sm font-medium ${interval === 'month' ? 'text-[var(--w-ink1)]' : 'muted'}`}>
            Monthly
          </span>
          <button
            type="button"
            onClick={() => setInterval(interval === 'month' ? 'year' : 'month')}
            className="relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent bg-[var(--w-accent)] transition-colors duration-200 ease-in-out focus:outline-none"
          >
            <span
              className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow ring-0 transition duration-200 ease-in-out ${
                interval === 'year' ? 'translate-x-5' : 'translate-x-0'
              }`}
            />
          </button>
          <span className={`text-sm font-medium ${interval === 'year' ? 'text-[var(--w-ink1)]' : 'muted'}`}>
            Yearly <span className="text-xs text-[var(--w-accent)] font-semibold">(2 months free)</span>
          </span>
        </div>
      </div>

      {/* Pricing Cards */}
      <div className="mt-12 grid grid-cols-1 md:grid-cols-2 gap-8 max-w-3xl mx-auto">
        {/* Free Tier */}
        <div className="card-box flex flex-col justify-between p-6 sm:p-8 bg-[var(--w-canvas)]">
          <div>
            <h2 className="t-section text-lg font-bold text-[var(--w-ink1)]">Free Tier</h2>
            <p className="t-caption muted mt-1">Try Chessplain without signing up.</p>
            <div className="mt-4 flex items-baseline">
              <span className="text-4xl font-extrabold tracking-tight text-[var(--w-ink1)]">$0</span>
              <span className="text-sm muted ml-1">/ forever</span>
            </div>

            <ul className="mt-6 flex flex-col gap-3 text-sm text-[var(--w-ink1)]">
              <li className="flex items-center gap-2">
                <Check className="w-4 h-4 text-[var(--w-accent)] shrink-0" />
                <span>2 free game reports every 7 days</span>
              </li>
              <li className="flex items-center gap-2">
                <Check className="w-4 h-4 text-[var(--w-accent)] shrink-0" />
                <span>Full 3-stage Stockfish 18 analysis</span>
              </li>
              <li className="flex items-center gap-2">
                <Check className="w-4 h-4 text-[var(--w-accent)] shrink-0" />
                <span>Teachable concepts & checkable habits</span>
              </li>
              <li className="flex items-center gap-2">
                <Check className="w-4 h-4 text-[var(--w-accent)] shrink-0" />
                <span>Public shareable links</span>
              </li>
            </ul>
          </div>

          <a
            href="/"
            className="mt-8 block w-full text-center rounded-md border border-[var(--w-border)] bg-[var(--w-surface)] py-2.5 text-sm font-semibold text-[var(--w-ink1)] hover:bg-[var(--w-border)]/50 transition-all"
          >
            Analyze a game free
          </a>
        </div>

        {/* Premium Tier */}
        <div className="card-box flex flex-col justify-between p-6 sm:p-8 border-2 border-[var(--w-accent)] relative shadow-md bg-[var(--w-canvas)]">
          <div className="absolute -top-3 right-6 bg-[var(--w-accent)] text-[var(--w-on-accent)] text-xs font-bold px-3 py-0.5 rounded-full">
            POPULAR
          </div>

          <div>
            <h2 className="t-section text-lg font-bold text-[var(--w-ink1)]">Premium</h2>
            <p className="t-caption muted mt-1">Unlimited breakdowns for serious improvement.</p>
            <div className="mt-4 flex items-baseline">
              <span className="text-4xl font-extrabold tracking-tight text-[var(--w-ink1)]">
                {interval === 'month' ? '$9.99' : '$99.99'}
              </span>
              <span className="text-sm muted ml-1">/ {interval === 'month' ? 'month' : 'year'}</span>
            </div>

            <ul className="mt-6 flex flex-col gap-3 text-sm text-[var(--w-ink1)]">
              <li className="flex items-center gap-2">
                <Check className="w-4 h-4 text-[var(--w-accent)] shrink-0" />
                <span className="font-semibold">Unlimited game analyses</span>
              </li>
              <li className="flex items-center gap-2">
                <Check className="w-4 h-4 text-[var(--w-accent)] shrink-0" />
                <span>Priority queue — instant results</span>
              </li>
              <li className="flex items-center gap-2">
                <Check className="w-4 h-4 text-[var(--w-accent)] shrink-0" />
                <span>Permanent game history & save</span>
              </li>
              <li className="flex items-center gap-2">
                <Check className="w-4 h-4 text-[var(--w-accent)] shrink-0" />
                <span>Cancel anytime in one click</span>
              </li>
            </ul>
          </div>

          {error && (
            <div className="mt-4 rounded-md bg-[var(--w-error-soft)] p-2 text-xs text-[var(--w-error)]">
              {error}
            </div>
          )}

          <button
            type="button"
            disabled={isLoading}
            onClick={() => handleCheckout(interval)}
            className="mt-8 block w-full rounded-md bg-[var(--w-accent)] py-2.5 text-center text-sm font-semibold text-[var(--w-on-accent)] shadow hover:opacity-90 transition-all disabled:opacity-50"
          >
            {isLoading ? 'Redirecting to checkout...' : 'Get Unlimited Access'}
          </button>
        </div>
      </div>

      {/* FAQ & Guarantees */}
      <div className="mt-16 border-t border-[var(--w-border)] pt-12 max-w-3xl mx-auto">
        <h3 className="t-heading text-xl text-center mb-8">Frequently Asked Questions</h3>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-6 text-sm">
          <div>
            <p className="t-body-strong">How does the free tier work?</p>
            <p className="t-caption muted mt-1">
              Anyone can analyze up to 2 games every 7 days with zero registration. No credit card required.
            </p>
          </div>
          <div>
            <p className="t-body-strong">What makes Chessplain different from Chess.com?</p>
            <p className="t-caption muted mt-1">
              We never give you accuracy grades or engine lines. We explain why your plan made sense to you, why it failed, and what habit to check next time.
            </p>
          </div>
          <div>
            <p className="t-body-strong">Can I cancel anytime?</p>
            <p className="t-caption muted mt-1">
              Yes, cancel with one click directly from your account. You keep access through the end of your billing cycle.
            </p>
          </div>
          <div>
            <p className="t-body-strong">Refund policy?</p>
            <p className="t-caption muted mt-1">
              If you are unsatisfied for any reason, email us within 14 days for a full, hassle-free refund.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
