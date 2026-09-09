import React from 'react';
import Link from 'next/link';
import { ArrowLeft } from 'lucide-react';
import type { Metadata } from 'next';
import { SUPPORT_EMAIL } from '../layout';

export const metadata: Metadata = {
  title: 'Privacy Policy — Chessplain',
  description: 'What Chessplain collects, how it is used, and how to have it deleted.',
};

export default function PrivacyPage() {
  return (
    <div className="mx-auto max-w-3xl px-4 py-12 sm:px-6 sm:py-16">
      <Link
        href="/"
        className="inline-flex min-h-11 items-center gap-1.5 text-xs font-semibold text-[var(--w-ink2)] hover:text-[var(--w-accent)] mb-4 transition-colors"
      >
        <ArrowLeft className="w-3.5 h-3.5" />
        <span>Back to Home</span>
      </Link>

      <h1 className="t-display text-3xl sm:text-4xl mb-6 text-[var(--w-ink1)]">Privacy Policy</h1>
      <div className="flex flex-col gap-6 t-body text-[var(--w-ink1)] leading-relaxed">
        <p>
          Your privacy is important to us. This policy outlines what data we collect and how we use it.
        </p>

        <div className="card-box p-6 bg-[var(--w-surface)] border border-[var(--w-border)]">
          <h2 className="t-section text-lg font-bold mb-2">1. Information We Collect</h2>
          <ul className="list-disc pl-5 space-y-1.5 text-sm text-[var(--w-ink2)]">
            <li>Public chess games and usernames submitted for analysis.</li>
            <li>IP addresses for rate limiting and anonymous quota enforcement.</li>
            <li>Email address if you choose to receive sign-in links or subscribe. Report links are accessible to anyone who has them.</li>
            <li>Usage analytics (via PostHog) to improve the product experience.</li>
          </ul>
        </div>

        <div className="card-box p-6 bg-[var(--w-surface)] border border-[var(--w-border)]">
          <h2 className="t-section text-lg font-bold mb-2">2. How We Use Data</h2>
          <p className="text-sm text-[var(--w-ink2)]">
            We use submitted games solely to compute engine evaluations and generate explanations. We do not sell your personal data to third parties.
          </p>
        </div>

        <div className="card-box p-6 bg-[var(--w-surface)] border border-[var(--w-border)]">
          <h2 className="t-section text-lg font-bold mb-2">3. Third-Party Services</h2>
          <p className="text-sm text-[var(--w-ink2)]">
            We use Stripe for payment processing, Supabase for authentication and database services, and PostHog for product analytics. Game positions, selected moves, and contextual game information are sent to the configured AI provider to generate written explanations.
          </p>
        </div>

        <div className="card-box p-6 bg-[var(--w-surface)] border border-[var(--w-border)]">
          <h2 className="t-section text-lg font-bold mb-2">4. Contact & Deletion</h2>
          <p className="text-sm text-[var(--w-ink2)]">
            You may request complete deletion of your account and game history at any time by emailing{' '}
            <a className="underline text-[var(--w-accent)]" href={`mailto:${SUPPORT_EMAIL}`}>{SUPPORT_EMAIL}</a>. We
            aim to reply within a few days, and deletion is permanent once actioned.
          </p>
        </div>

        <p className="t-caption text-[var(--w-ink3)] mt-2">Last updated: August 31, 2026</p>
      </div>
    </div>
  );
}
