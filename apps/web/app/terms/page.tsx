import React from 'react';
import Link from 'next/link';
import { ArrowLeft } from 'lucide-react';

export default function TermsPage() {
  return (
    <div className="mx-auto max-w-3xl px-4 py-12 sm:px-6 sm:py-16">
      <Link
        href="/"
        className="inline-flex items-center gap-1.5 text-xs font-semibold text-[var(--w-ink2)] hover:text-[var(--w-accent)] mb-6 transition-colors"
      >
        <ArrowLeft className="w-3.5 h-3.5" />
        <span>Back to Home</span>
      </Link>

      <h1 className="t-display text-3xl sm:text-4xl mb-6 text-[var(--w-ink1)]">Terms of Service</h1>
      <div className="flex flex-col gap-6 t-body text-[var(--w-ink1)] leading-relaxed">
        <p>
          Welcome to Chessplain. By accessing or using our website and services, you agree to be bound by these terms.
        </p>

        <div className="card-box p-6 bg-[var(--w-surface)] border border-[var(--w-border)]">
          <h2 className="t-section text-lg font-bold mb-2">1. Nature of Service</h2>
          <p className="text-sm text-[var(--w-ink2)]">
            Chessplain provides automated chess game analyses powered by chess engines (Stockfish) and large language model explanations. While we strive for high instructional quality, analyses are provided for educational and entertainment purposes.
          </p>
        </div>

        <div className="card-box p-6 bg-[var(--w-surface)] border border-[var(--w-border)]">
          <h2 className="t-section text-lg font-bold mb-2">2. Subscriptions & Billing</h2>
          <p className="text-sm text-[var(--w-ink2)]">
            Paid subscriptions provide unlimited game analyses. Subscriptions renew automatically each billing cycle (monthly or yearly) until cancelled. You may cancel your subscription at any time.
          </p>
        </div>

        <div className="card-box p-6 bg-[var(--w-surface)] border border-[var(--w-border)]">
          <h2 className="t-section text-lg font-bold mb-2">3. Refunds</h2>
          <p className="text-sm text-[var(--w-ink2)]">
            We offer full refunds upon request within 14 days of any subscription charge. If you feel the product did not deliver on its promise, contact support for a prompt refund.
          </p>
        </div>

        <div className="card-box p-6 bg-[var(--w-surface)] border border-[var(--w-border)]">
          <h2 className="t-section text-lg font-bold mb-2">4. Fair Use</h2>
          <p className="text-sm text-[var(--w-ink2)]">
            Automated scraping, abuse of free tier quotas via proxy rotating, or attempts to disrupt our infrastructure are strictly prohibited.
          </p>
        </div>

        <p className="t-caption text-[var(--w-ink3)] mt-2">Last updated: August 31, 2026</p>
      </div>
    </div>
  );
}
