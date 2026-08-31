import React from 'react';

export default function TermsPage() {
  return (
    <div className="mx-auto max-w-3xl px-4 py-16 sm:px-6">
      <h1 className="t-display text-3xl mb-6">Terms of Service</h1>
      <div className="flex flex-col gap-6 t-body text-[var(--w-ink1)]">
        <p>
          Welcome to Chessplain. By accessing or using our website and services, you agree to be bound by these terms.
        </p>

        <div>
          <h2 className="t-section text-lg font-semibold mb-2">1. Nature of Service</h2>
          <p>
            Chessplain provides automated chess game analyses powered by chess engines (Stockfish) and large language model explanations. While we strive for high instructional quality, analyses are provided for educational and entertainment purposes and are not guaranteed to be free of errors.
          </p>
        </div>

        <div>
          <h2 className="t-section text-lg font-semibold mb-2">2. Subscriptions & Billing</h2>
          <p>
            Paid subscriptions provide unlimited game analyses. Subscriptions renew automatically each billing cycle (monthly or yearly) until cancelled. You may cancel your subscription at any time.
          </p>
        </div>

        <div>
          <h2 className="t-section text-lg font-semibold mb-2">3. Refunds</h2>
          <p>
            We offer full refunds upon request within 14 days of any subscription charge. If you feel the product did not deliver on its promise, contact support for a prompt refund.
          </p>
        </div>

        <div>
          <h2 className="t-section text-lg font-semibold mb-2">4. Fair Use</h2>
          <p>
            Automated scraping, abuse of free tier quotas via proxy rotating, or attempts to disrupt our infrastructure are prohibited.
          </p>
        </div>

        <p className="t-caption muted mt-6">Last updated: August 31, 2026</p>
      </div>
    </div>
  );
}
