'use client';

import React, { useEffect, useState } from 'react';
import Link from 'next/link';
import { Check, BookOpen, ArrowRight, ShieldCheck, Zap } from 'lucide-react';
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
    <div className="mx-auto max-w-5xl px-4 py-12 sm:px-6 sm:py-20">
      {/* Header */}
      <div className="text-center max-w-3xl mx-auto">
        <span className="badge-accent mb-3 inline-flex text-xs font-semibold uppercase tracking-wider">
          Simple, Transparent Membership
        </span>
        <h1 className="t-display sm:text-4xl text-3xl font-bold tracking-tight text-[var(--w-ink1)]">
          Unlimited plain-English game breakdowns.
        </h1>
        <p className="t-body sm:text-lg text-base text-[var(--w-ink2)] mt-4 max-w-2xl mx-auto leading-relaxed">
          Stop getting graded on accuracy numbers. Understand what you were thinking and build habits that stick.
        </p>

        {/* Interval toggle */}
        <div className="mt-8 flex justify-center items-center gap-3">
          <span className={`text-sm font-semibold ${interval === 'month' ? 'text-[var(--w-ink1)]' : 'text-[var(--w-ink3)]'}`}>
            Monthly
          </span>
          <button
            type="button"
            role="switch"
            aria-checked={interval === 'year'}
            aria-label="Toggle annual billing with 2 months free"
            onClick={() => setInterval(interval === 'month' ? 'year' : 'month')}
            className="relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent bg-[var(--w-accent)] transition-colors duration-200 ease-in-out focus-ring"
          >
            <span
              className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow ring-0 transition duration-200 ease-in-out ${
                interval === 'year' ? 'translate-x-5' : 'translate-x-0'
              }`}
            />
          </button>
          <span className={`text-sm font-semibold ${interval === 'year' ? 'text-[var(--w-ink1)]' : 'text-[var(--w-ink3)]'}`}>
            Yearly <span className="text-xs text-[var(--w-accent)] font-bold">(2 months free)</span>
          </span>
        </div>
      </div>

      {/* Pricing Cards */}
      <div className="mt-12 grid grid-cols-1 md:grid-cols-2 gap-8 max-w-3xl mx-auto items-stretch">
        {/* Free Tier */}
        <div className="card-box flex flex-col justify-between p-6 sm:p-8 bg-[var(--w-surface)] border border-[var(--w-border-strong)] shadow-sm">
          <div>
            <div className="flex items-center justify-between">
              <h2 className="t-section text-xl font-bold text-[var(--w-ink1)]">Free Tier</h2>
              <span className="badge-muted">No Account Needed</span>
            </div>
            <p className="t-caption text-[var(--w-ink2)] mt-1">Try Chessplain instantly after your games.</p>
            <div className="mt-5 flex items-baseline">
              <span className="t-display text-4xl font-extrabold text-[var(--w-ink1)]">$0</span>
              <span className="text-sm text-[var(--w-ink2)] ml-1.5 font-medium">/ forever</span>
            </div>

            <ul className="mt-6 flex flex-col gap-3.5 text-sm text-[var(--w-ink1)]">
              <li className="flex items-center gap-2.5">
                <Check className="w-4 h-4 text-[var(--w-accent)] shrink-0" />
                <span>2 free game reports every 7 days</span>
              </li>
              <li className="flex items-center gap-2.5">
                <Check className="w-4 h-4 text-[var(--w-accent)] shrink-0" />
                <span>Full 3-stage engine evaluation</span>
              </li>
              <li className="flex items-center gap-2.5">
                <Check className="w-4 h-4 text-[var(--w-accent)] shrink-0" />
                <span>Teachable concepts & checkable habits</span>
              </li>
              <li className="flex items-center gap-2.5">
                <Check className="w-4 h-4 text-[var(--w-accent)] shrink-0" />
                <span>Public shareable links</span>
              </li>
            </ul>
          </div>

          <Link
            href="/"
            className="mt-8 block w-full text-center rounded-lg border border-[var(--w-border)] bg-[var(--w-canvas)] py-3 text-sm font-bold text-[var(--w-ink1)] hover:bg-[var(--w-surface-subtle)] hover:border-[var(--w-border-strong)] transition-all"
          >
            Analyze a game free
          </Link>
        </div>

        {/* Premium Tier */}
        <div className="card-box flex flex-col justify-between p-6 sm:p-8 border-2 border-[var(--w-accent)] relative shadow-lg bg-[var(--w-surface)]">
          <div className="absolute -top-3 right-6 bg-[var(--w-accent)] text-[var(--w-on-accent)] text-xs font-bold px-3 py-1 rounded-full uppercase tracking-wider shadow-sm">
            Unlimited
          </div>

          <div>
            <div className="flex items-center justify-between">
              <h2 className="t-section text-xl font-bold text-[var(--w-ink1)]">Premium</h2>
              <span className="badge-accent">Instant Queue</span>
            </div>
            <p className="t-caption text-[var(--w-ink2)] mt-1">For serious improvement across all your games.</p>
            <div className="mt-5 flex items-baseline">
              <span className="t-display text-4xl font-extrabold text-[var(--w-ink1)]">
                {interval === 'month' ? '$9.99' : '$99.99'}
              </span>
              <span className="text-sm text-[var(--w-ink2)] ml-1.5 font-medium">
                / {interval === 'month' ? 'month' : 'year'}
              </span>
            </div>

            <ul className="mt-6 flex flex-col gap-3.5 text-sm text-[var(--w-ink1)]">
              <li className="flex items-center gap-2.5">
                <Check className="w-4 h-4 text-[var(--w-accent)] shrink-0" />
                <span className="font-bold text-[var(--w-ink1)]">Unlimited game analyses</span>
              </li>
              <li className="flex items-center gap-2.5">
                <Check className="w-4 h-4 text-[var(--w-accent)] shrink-0" />
                <span>Priority queue — instant results</span>
              </li>
              <li className="flex items-center gap-2.5">
                <Check className="w-4 h-4 text-[var(--w-accent)] shrink-0" />
                <span>Permanent game history & save</span>
              </li>
              <li className="flex items-center gap-2.5">
                <Check className="w-4 h-4 text-[var(--w-accent)] shrink-0" />
                <span>14-day hassle-free refund guarantee</span>
              </li>
            </ul>
          </div>

          {error && (
            <div className="mt-4 rounded-lg bg-[var(--w-error-soft)] p-3 text-xs text-[var(--w-error)] font-medium">
              {error}
            </div>
          )}

          <button
            type="button"
            disabled={isLoading}
            onClick={() => handleCheckout(interval)}
            className="mt-8 block w-full rounded-lg bg-[var(--w-accent)] py-3 text-center text-sm font-bold text-[var(--w-on-accent)] shadow-sm hover:bg-[var(--w-accent-hover)] transition-all disabled:opacity-50 cursor-pointer"
          >
            {isLoading ? 'Redirecting to secure Stripe...' : 'Get Unlimited Access'}
          </button>
        </div>
      </div>

      {/* Sample Link Banner */}
      <div className="mt-10 text-center">
        <Link
          href="/report/demo"
          className="inline-flex items-center gap-1.5 text-sm font-semibold text-[var(--w-accent)] hover:underline"
        >
          <BookOpen className="w-4 h-4" />
          <span>Want to test the full interactive experience first? View the sample report →</span>
        </Link>
      </div>

      {/* FAQ & Guarantees */}
      <div className="mt-16 border-t border-[var(--w-border)] pt-12 max-w-3xl mx-auto">
        <h3 className="t-heading text-2xl text-center mb-8 text-[var(--w-ink1)]">
          Frequently Asked Questions
        </h3>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-6 text-sm">
          <div className="card-box p-4 bg-[var(--w-surface-subtle)] border border-[var(--w-border)]">
            <p className="t-body-strong text-[var(--w-ink1)]">How does the free tier work?</p>
            <p className="t-caption text-[var(--w-ink2)] mt-1">
              Anyone can analyze up to 2 games every 7 days with zero registration. No credit card required.
            </p>
          </div>
          <div className="card-box p-4 bg-[var(--w-surface-subtle)] border border-[var(--w-border)]">
            <p className="t-body-strong text-[var(--w-ink1)]">What makes Chessplain different?</p>
            <p className="t-caption text-[var(--w-ink2)] mt-1">
              We never give you accuracy grades or engine jargon. We explain why your plan made sense, why it failed, and what habit to check next time.
            </p>
          </div>
          <div className="card-box p-4 bg-[var(--w-surface-subtle)] border border-[var(--w-border)]">
            <p className="t-body-strong text-[var(--w-ink1)]">Can I cancel anytime?</p>
            <p className="t-caption text-[var(--w-ink2)] mt-1">
              Yes, cancel with one click from your account anytime. You keep access through the end of your paid billing period.
            </p>
          </div>
          <div className="card-box p-4 bg-[var(--w-surface-subtle)] border border-[var(--w-border)]">
            <p className="t-body-strong text-[var(--w-ink1)]">What is the refund policy?</p>
            <p className="t-caption text-[var(--w-ink2)] mt-1">
              If you are unsatisfied for any reason, reach out within 14 days for a full, unconditional refund.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
