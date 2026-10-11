import Link from 'next/link';
import type { Metadata } from 'next';
import { AnalyticsOptOut } from '../../components/AnalyticsOptOut';
import { SUPPORT_EMAIL } from '../layout';
import '../legal.css';

export const metadata: Metadata = {
  title: 'Privacy Policy | Chessplain',
  description: 'What Chessplain collects, how it is used, and how to have it deleted.',
  alternates: { canonical: '/privacy' },
  robots: { index: true, follow: true },
};

export default function PrivacyPage() {
  return (
    <article className="page legal">
      <h1 className="h1">Privacy policy.</h1>
      <p className="lede">What Chessplain collects, why, and how to have it deleted.</p>
      <p>
        This policy explains how Chessplain processes information when you use the website,
        sign in, submit a game, run a scan, view a report, or subscribe.
      </p>

      <section>
        <h2>1. Who controls your data</h2>
        <p>
          Chessplain is operated by an individual based in the United Kingdom, who is the controller
          of your data. For privacy questions, requests, or complaints, email{' '}
          <a href={`mailto:${SUPPORT_EMAIL}`}>{SUPPORT_EMAIL}</a>.
          Chessplain is not meant for children under 13.
        </p>
      </section>

      <section>
        <h2>2. Information we collect</h2>
        <ul>
          <li>Account information, including your email address and, if you choose it, Google sign-in information.</li>
          <li>Submitted game information, including PGNs, usernames, player names, move data, and the report and share link produced from it.</li>
          <li>A scan stores the Chess.com username and the summaries of the scanned public games.</li>
          <li>IP addresses stored with anonymous submissions, scans, and source games for quota enforcement, abuse prevention, and service operation.</li>
          <li>Billing details for subscriptions. Purchases are sold through Onelink, Stripe&apos;s merchant-of-record service, which receives your payment details and billing address to take payment and calculate tax under its own privacy policy. We do not receive or store your full card number.</li>
          <li>Limited product statistics from PostHog, such as pages viewed, games submitted, and clicks. PostHog uses a random identifier in first-party cookie/local storage; analytics is not used for advertising.</li>
        </ul>
      </section>

      <section>
        <h2>3. Why we use it</h2>
        <ul>
          <li>To provide accounts, analyse submitted games, generate reports, and operate share links (service performance and steps before a contract).</li>
          <li>To process subscriptions, prevent fraud and abuse, enforce quotas, and keep the service secure (contract, legal obligations, and legitimate interests where applicable).</li>
          <li>To understand aggregate product use and improve Chessplain. PostHog is configured for statistics only, with no session recording, surveys, heatmaps, or advertising.</li>
          <li>To send the sign-in links you ask for and occasional product emails to account holders, such as a relaunch or a major new feature. Every product email has a one-click unsubscribe; unsubscribing does not affect sign-in emails.</li>
          <li>To respond to support, privacy, and billing requests and meet accounting or legal obligations.</li>
        </ul>
        <p>
          We do not sell personal data. Reports and share links are public to anyone who has the link
          and may include player and opponent names; do not submit information you do not have the right
          to share.
        </p>
      </section>

      <section>
        <h2>4. Services we use</h2>
        <p>We use the following providers to run Chessplain:</p>
        <ul>
          <li><strong>Supabase</strong> for authentication and database hosting, including accounts, PGNs, reports, scans, and IP addresses.</li>
          <li><strong>Cloudflare</strong> for website hosting and email routing, and <strong>Resend</strong> for sending sign-in emails and occasional product emails.</li>
          <li><strong>Stripe</strong>, selling through <strong>Onelink</strong> as merchant of record, for Checkout, subscription payments, tax, receipts, and the billing portal.</li>
          <li><strong>PostHog (EU hosting)</strong> for statistics-only product analytics. You can opt out below.</li>
          <li><strong>Google</strong> if you choose Google OAuth sign-in.</li>
          <li><strong>Chess.com&apos;s public API</strong> when you request a public Chess.com game or a scan by username.</li>
          <li><strong>OpenRouter and its configured OpenAI model provider</strong> for written explanations. For a moment, Chessplain sends the position FEN, played/best/refutation moves, chess context, phase, and opponent name. For a game summary, it sends player/opponent names, result, move count, time control, and generated moment text. It does not send your account email in these prompts.</li>
        </ul>
        <p>
          Some of these providers process information outside the UK, including in the United States.
          Email us for details of the safeguards that apply to a particular provider.
        </p>
      </section>

      <section id="analytics">
        <h2>5. Analytics and cookies</h2>
        <p>
          PostHog is hosted in the EU and configured for statistics-only measurement. It can record
          page views and product events such as submissions and clicks using a random identifier in
          first-party cookie/local storage. We do not use it for advertising, cross-site tracking,
          session recording, surveys, or heatmaps. Sign-in uses separate authentication storage.
          Browsers sending Do Not Track are not tracked. You can opt out at any time:
        </p>
        <AnalyticsOptOut />
      </section>

      <section>
        <h2>6. Retention and deletion</h2>
        <p>
          There is no automatic deletion yet. Accounts, PGNs, reports, scans, analysis records, and the IP
          addresses stored with submissions are kept until you ask us to delete them.
        </p>
        <p>
          You may request access, correction, restriction, objection, portability, or erasure by
          emailing <a href={`mailto:${SUPPORT_EMAIL}`}>{SUPPORT_EMAIL}</a>.
          We will verify the request, apply any applicable legal exceptions, and handle deletion manually
          where possible. Some records may need to be retained for legal, security, fraud-prevention,
          or accounting purposes.
        </p>
      </section>

      <section>
        <h2>7. Your rights and complaints</h2>
        <p>
          Depending on where you live and the applicable law, you may have rights to access, correct,
          erase, restrict, object to, or receive a copy of your personal data, and to withdraw consent
          where processing relies on consent. You can complain to the UK Information Commissioner&apos;s
          Office at{' '}
          <a href="https://ico.org.uk/make-a-complaint/" rel="noreferrer">ico.org.uk/make-a-complaint</a>.
        </p>
      </section>

      <p className="small muted">Last updated: October 11, 2026</p>
      <div className="legal-end">
        <Link className="btn" href="/#scan">Find my gremlin <span className="arrow" aria-hidden="true">→</span></Link>
      </div>
    </article>
  );
}
