import React from 'react';
import Link from 'next/link';
import { ArrowLeft } from 'lucide-react';
import type { Metadata } from 'next';
import { SUPPORT_EMAIL } from '../layout';
import { AnalyticsOptOut } from '../../components/AnalyticsOptOut';

export const metadata: Metadata = {
  title: 'Privacy Policy | Chessplain',
  description: 'What Chessplain collects, how it is used, and how to have it deleted.',
  alternates: { canonical: '/privacy' },
  robots: { index: true, follow: true },
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
          This policy explains how Chessplain processes information when you use the website,
          sign in, submit a game, view a report, or subscribe.
        </p>

        <div className="card-box p-6 bg-[var(--w-surface)] border border-[var(--w-border)]">
          <h2 className="t-section text-lg font-bold mb-2">1. Who controls your data</h2>
          <p className="text-sm text-[var(--w-ink2)]">
            Chessplain is operated by an individual based in the United Kingdom, who is the controller
            of your data. For privacy questions, requests, or complaints, email{' '}
            <a className="underline text-[var(--w-accent)]" href={`mailto:${SUPPORT_EMAIL}`}>{SUPPORT_EMAIL}</a>.
            Chessplain is not meant for children under 13.
          </p>
        </div>

        <div className="card-box p-6 bg-[var(--w-surface)] border border-[var(--w-border)]">
          <h2 className="t-section text-lg font-bold mb-2">2. Information we collect</h2>
          <ul className="list-disc pl-5 space-y-1.5 text-sm text-[var(--w-ink2)]">
            <li>Account information, including your email address and, if you choose it, Google sign-in information.</li>
            <li>Submitted game information, including PGNs, usernames, player names, move data, and the report and share link produced from it.</li>
            <li>IP addresses stored with anonymous submissions and source games for quota enforcement, abuse prevention, and service operation.</li>
            <li>Billing details for subscriptions. Purchases are sold through Onelink, Stripe&apos;s merchant-of-record service, which receives your payment details and billing address to take payment and calculate tax under its own privacy policy. We do not receive or store your full card number.</li>
            <li>Limited product statistics from PostHog, such as pages viewed, games submitted, and clicks. PostHog uses a random identifier in first-party cookie/local storage; analytics is not used for advertising.</li>
          </ul>
        </div>

        <div className="card-box p-6 bg-[var(--w-surface)] border border-[var(--w-border)]">
          <h2 className="t-section text-lg font-bold mb-2">3. Why we use it</h2>
          <ul className="list-disc pl-5 space-y-1.5 text-sm text-[var(--w-ink2)]">
            <li>To provide accounts, analyse submitted games, generate reports, and operate share links (service performance and steps before a contract).</li>
            <li>To process subscriptions, prevent fraud and abuse, enforce quotas, and keep the service secure (contract, legal obligations, and legitimate interests where applicable).</li>
            <li>To understand aggregate product use and improve Chessplain. PostHog is configured for statistics only, with no session recording, surveys, heatmaps, or advertising.</li>
            <li>To send the sign-in links you ask for and occasional product emails to account holders, such as a relaunch or a major new feature. Every product email has a one-click unsubscribe; unsubscribing does not affect sign-in emails.</li>
            <li>To respond to support, privacy, and billing requests and meet accounting or legal obligations.</li>
          </ul>
          <p className="text-sm text-[var(--w-ink2)] mt-3">
            We do not sell personal data. Reports and share links are public to anyone who has the link
            and may include player and opponent names; do not submit information you do not have the right
            to share.
          </p>
        </div>

        <div className="card-box p-6 bg-[var(--w-surface)] border border-[var(--w-border)]">
          <h2 className="t-section text-lg font-bold mb-2">4. Services we use</h2>
          <p className="text-sm text-[var(--w-ink2)]">We use the following providers to run Chessplain:</p>
          <ul className="list-disc pl-5 space-y-1.5 text-sm text-[var(--w-ink2)] mt-2">
            <li><strong>Supabase</strong> for authentication and database hosting, including accounts, PGNs, reports, and IP addresses.</li>
            <li><strong>Cloudflare</strong> for website hosting and email routing, and <strong>Resend</strong> for sending sign-in emails and occasional product emails.</li>
            <li><strong>Stripe</strong>, selling through <strong>Onelink</strong> as merchant of record, for Checkout, subscription payments, tax, receipts, and the billing portal.</li>
            <li><strong>PostHog (EU hosting)</strong> for statistics-only product analytics. You can opt out below.</li>
            <li><strong>Google</strong> if you choose Google OAuth sign-in.</li>
            <li><strong>Chess.com&apos;s public API</strong> when you request a public Chess.com game by username.</li>
            <li><strong>OpenRouter and its configured OpenAI model provider</strong> for written explanations. For a moment, Chessplain sends the position FEN, played/best/refutation moves, chess context, phase, and opponent name. For a game summary, it sends player/opponent names, result, move count, time control, and generated moment text. It does not send your account email in these prompts.</li>
          </ul>
          <p className="text-sm text-[var(--w-ink2)] mt-3">
            Some of these providers process information outside the UK, including in the United States.
            Email us for details of the safeguards that apply to a particular provider.
          </p>
        </div>

        <div id="analytics" className="card-box p-6 bg-[var(--w-surface)] border border-[var(--w-border)]">
          <h2 className="t-section text-lg font-bold mb-2">5. Analytics and cookies</h2>
          <p className="text-sm text-[var(--w-ink2)]">
            PostHog is hosted in the EU and configured for statistics-only measurement. It can record
            page views and product events such as submissions and clicks using a random identifier in
            first-party cookie/local storage. We do not use it for advertising, cross-site tracking,
            session recording, surveys, or heatmaps. Sign-in uses separate authentication storage.
            Browsers sending Do Not Track are not tracked. You can opt out at any time:
          </p>
          <AnalyticsOptOut />
        </div>

        <div className="card-box p-6 bg-[var(--w-surface)] border border-[var(--w-border)]">
          <h2 className="t-section text-lg font-bold mb-2">6. Retention and deletion</h2>
          <p className="text-sm text-[var(--w-ink2)]">
            There is no automatic deletion yet. Accounts, PGNs, reports, analysis records, and the IP
            addresses stored with submissions are kept until you ask us to delete them.
          </p>
          <p className="text-sm text-[var(--w-ink2)] mt-3">
            You may request access, correction, restriction, objection, portability, or erasure by
            emailing <a className="underline text-[var(--w-accent)]" href={`mailto:${SUPPORT_EMAIL}`}>{SUPPORT_EMAIL}</a>.
            We will verify the request, apply any applicable legal exceptions, and handle deletion manually
            where possible. Some records may need to be retained for legal, security, fraud-prevention,
            or accounting purposes.
          </p>
        </div>

        <div className="card-box p-6 bg-[var(--w-surface)] border border-[var(--w-border)]">
          <h2 className="t-section text-lg font-bold mb-2">7. Your rights and complaints</h2>
          <p className="text-sm text-[var(--w-ink2)]">
            Depending on where you live and the applicable law, you may have rights to access, correct,
            erase, restrict, object to, or receive a copy of your personal data, and to withdraw consent
            where processing relies on consent. You can complain to the UK Information Commissioner&apos;s
            Office at{' '}
            <a className="underline text-[var(--w-accent)]" href="https://ico.org.uk/make-a-complaint/" rel="noreferrer">ico.org.uk/make-a-complaint</a>.
          </p>
        </div>

        <p className="t-caption text-[var(--w-ink3)] mt-2">Last updated: September 30, 2026</p>
      </div>
    </div>
  );
}
