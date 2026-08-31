import React from 'react';

export default function PrivacyPage() {
  return (
    <div className="mx-auto max-w-3xl px-4 py-16 sm:px-6">
      <h1 className="t-display text-3xl mb-6">Privacy Policy</h1>
      <div className="flex flex-col gap-6 t-body text-[var(--w-ink1)]">
        <p>
          Your privacy is important to us. This policy outlines what data we collect and how we use it.
        </p>

        <div>
          <h2 className="t-section text-lg font-semibold mb-2">1. Information We Collect</h2>
          <ul className="list-disc pl-5 space-y-1">
            <li>Public chess games and usernames submitted for analysis.</li>
            <li>IP addresses for rate limiting and anonymous quota enforcement.</li>
            <li>Email address if you choose to receive private report links or subscribe.</li>
            <li>Usage analytics (via PostHog) to improve the product experience.</li>
          </ul>
        </div>

        <div>
          <h2 className="t-section text-lg font-semibold mb-2">2. How We Use Data</h2>
          <p>
            We use submitted games solely to compute engine evaluations and generate explanations. We do not sell your personal data to third parties.
          </p>
        </div>

        <div>
          <h2 className="t-section text-lg font-semibold mb-2">3. Third-Party Services</h2>
          <p>
            We use Stripe for secure payment processing (we never store raw card details), Supabase for authentication and database services, and PostHog for privacy-respecting product analytics.
          </p>
        </div>

        <div>
          <h2 className="t-section text-lg font-semibold mb-2">4. Contact & Deletion</h2>
          <p>
            You may request complete deletion of your account and game history at any time by contacting support.
          </p>
        </div>

        <p className="t-caption muted mt-6">Last updated: August 31, 2026</p>
      </div>
    </div>
  );
}
