import React from 'react';
import Link from 'next/link';
import { ArrowLeft } from 'lucide-react';

export default function PrivacyPage() {
  return (
    <div className="mx-auto max-w-3xl px-4 py-12 sm:px-6 sm:py-16">
      <Link
        href="/"
        className="inline-flex items-center gap-1.5 text-xs font-semibold text-[var(--w-ink2)] hover:text-[var(--w-accent)] mb-6 transition-colors"
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
            <li>Email address if you choose to receive private report links or subscribe.</li>
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
            We use Stripe for secure payment processing (we never store raw card details), Supabase for authentication and database services, and PostHog for privacy-respecting product analytics.
          </p>
        </div>

        <div className="card-box p-6 bg-[var(--w-surface)] border border-[var(--w-border)]">
          <h2 className="t-section text-lg font-bold mb-2">4. Contact & Deletion</h2>
          <p className="text-sm text-[var(--w-ink2)]">
            You may request complete deletion of your account and game history at any time by contacting support.
          </p>
        </div>

        <p className="t-caption text-[var(--w-ink3)] mt-2">Last updated: August 31, 2026</p>
      </div>
    </div>
  );
}
