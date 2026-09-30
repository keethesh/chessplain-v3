import React from 'react';
import Link from 'next/link';
import { ArrowLeft } from 'lucide-react';
import type { Metadata } from 'next';
import { SUPPORT_EMAIL } from '../layout';

export const metadata: Metadata = {
  title: 'Terms of Service | Chessplain',
  description: 'What Chessplain provides, how subscriptions and refunds work, and fair use.',
  alternates: { canonical: '/terms' },
  robots: { index: true, follow: true },
};

export default function TermsPage() {
  return (
    <div className="mx-auto max-w-3xl px-4 py-12 sm:px-6 sm:py-16">
      <Link
        href="/"
        className="inline-flex min-h-11 items-center gap-1.5 text-xs font-semibold text-[var(--w-ink2)] hover:text-[var(--w-accent)] mb-4 transition-colors"
      >
        <ArrowLeft className="w-3.5 h-3.5" />
        <span>Back to Home</span>
      </Link>

      <h1 className="t-display text-3xl sm:text-4xl mb-6 text-[var(--w-ink1)]">Terms of Service</h1>
      <div className="flex flex-col gap-6 t-body text-[var(--w-ink1)] leading-relaxed">
        <p>
          Welcome to Chessplain. By accessing or using our website and services, you agree to these
          terms. You must be at least 13 years old to use Chessplain, and under-18s need a parent or
          guardian&apos;s permission to subscribe. If you are a consumer, nothing here limits rights
          that cannot lawfully be excluded.
        </p>

        <div className="card-box p-6 bg-[var(--w-surface)] border border-[var(--w-border)]">
          <h2 className="t-section text-lg font-bold mb-2">1. Nature of service</h2>
          <p className="text-sm text-[var(--w-ink2)]">
            Chessplain provides automated chess game analyses using chess engines (including Stockfish)
            and an AI model to generate explanations. Analysis is for education and entertainment, not
            professional advice or a guarantee of a particular playing result. Reports may contain errors;
            check important positions on the board.
          </p>
        </div>

        <div className="card-box p-6 bg-[var(--w-surface)] border border-[var(--w-border)]">
          <h2 className="t-section text-lg font-bold mb-2">2. Your submissions and share links</h2>
          <p className="text-sm text-[var(--w-ink2)]">
            You must have the right to submit the game data you provide. Reports and share links are
            accessible to anyone who has the link and can include player and opponent names. Do not
            submit confidential or sensitive information you do not want processed or made available
            through that link.
          </p>
        </div>

        <div className="card-box p-6 bg-[var(--w-surface)] border border-[var(--w-border)]">
          <h2 className="t-section text-lg font-bold mb-2">3. Subscriptions and billing</h2>
          <p className="text-sm text-[var(--w-ink2)]">
            Paid plans are priced in US dollars: $9.99 per month or $99.99 per year. Checkout may
            offer your local currency, and it shows your total, including any tax due where you live,
            before you pay. The selected plan renews automatically at the same interval until
            cancelled.
          </p>
          <p className="text-sm text-[var(--w-ink2)] mt-3">
            Purchases are sold through Onelink, Stripe&apos;s merchant-of-record service. Onelink is the
            seller on your receipt, collects any VAT or sales tax, and appears on your statement as
            LINK.COM* CHESSPLAIN PREMIUM. We do not receive or store your full card number.
          </p>
          <p className="text-sm text-[var(--w-ink2)] mt-3">
            You can cancel with Manage subscription on the pricing page or at link.com. Cancellation
            stops the next renewal and leaves access available until the end of the current paid
            period. Paid analyses still take time to process and are subject to fair use.
          </p>
        </div>

        <div className="card-box p-6 bg-[var(--w-surface)] border border-[var(--w-border)]">
          <h2 className="t-section text-lg font-bold mb-2">4. Cancellation and refunds</h2>
          <p className="text-sm text-[var(--w-ink2)]">
            We offer a full refund on request within 14 days of any subscription charge. Email{' '}
            <a className="underline text-[var(--w-accent)]" href={`mailto:${SUPPORT_EMAIL}`}>{SUPPORT_EMAIL}</a>{' '}
            promptly and include the account email and charge date; Onelink support can also handle
            refunds for purchases it sold. This is in addition to any non-excludable statutory rights.
          </p>
          <p className="text-sm text-[var(--w-ink2)] mt-3">
            If you are a UK consumer, you also have a legal right to cancel within 14 days of
            subscribing. Use it the same way: email us within 14 days and we will refund you in full.
            Nothing in these terms removes a statutory right.
          </p>
        </div>

        <div className="card-box p-6 bg-[var(--w-surface)] border border-[var(--w-border)]">
          <h2 className="t-section text-lg font-bold mb-2">5. Fair use and prohibited use</h2>
          <p className="text-sm text-[var(--w-ink2)]">
            Automated scraping, abuse of free-tier quotas through proxy rotation, attempts to disrupt
            our infrastructure, or use of the service to violate another platform&apos;s terms are
            prohibited. We may limit or suspend access to protect users and the service.
          </p>
        </div>

        <div className="card-box p-6 bg-[var(--w-surface)] border border-[var(--w-border)]">
          <h2 className="t-section text-lg font-bold mb-2">6. Changes and contact</h2>
          <p className="text-sm text-[var(--w-ink2)]">
            We may update these terms when the service or law changes. We will not use an update to
            remove rights that cannot lawfully be excluded. Questions about these terms, billing, or
            refunds can be sent to{' '}
            <a className="underline text-[var(--w-accent)]" href={`mailto:${SUPPORT_EMAIL}`}>{SUPPORT_EMAIL}</a>.
          </p>
        </div>

        <p className="t-caption text-[var(--w-ink3)] mt-2">Last updated: September 30, 2026</p>
      </div>
    </div>
  );
}
