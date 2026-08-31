'use client';

import React, { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { Sparkles, ArrowRight, ShieldCheck, Zap } from 'lucide-react';
import { submitReport } from '../lib/api';
import { captureEvent, getDeterministicHeroVariant } from '../lib/posthog';

const HERO_COPY = {
  A: {
    hook: "Chess.com gave you a 47%. I'll tell you why.",
    headline: 'Your games, explained like a person.',
    subhead: 'No accuracy score. No engine jargon. What you were thinking, why it lost the game, and what to check next time.',
  },
  B: {
    hook: "It wasn't a blunder. It was a plan that almost worked.",
    headline: 'Chessplain figures out why you played that move.',
    subhead: 'We explain the flaw in your plan, not the move. See the missed threat through human eyes.',
  },
  E: {
    hook: "You just lost. You don't know why. The engine won't tell you.",
    headline: 'Paste a game. Get an explanation you will actually understand.',
    subhead: 'Like a patient friend with a 3200 rating who translates engine depth into plain English.',
  },
};

export default function HomePage() {
  const router = useRouter();
  const [heroVariant, setHeroVariant] = useState<'A' | 'B' | 'E'>('A');
  const [tab, setTab] = useState<'username' | 'pgn'>('username');
  const [username, setUsername] = useState('');
  const [pgn, setPgn] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const variant = getDeterministicHeroVariant();
    setHeroVariant(variant);
    captureEvent('landing_viewed', { hero_variant: variant });
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setIsLoading(true);

    const isUsername = tab === 'username';
    const method = isUsername ? 'chesscom' : 'pgn';

    if (isUsername && !username.trim()) {
      setError('Please enter a Chess.com username');
      setIsLoading(false);
      return;
    }

    if (!isUsername && !pgn.trim()) {
      setError('Please paste a valid PGN');
      setIsLoading(false);
      return;
    }

    captureEvent('pgn_submitted', {
      method,
      hero_variant: heroVariant,
    });

    try {
      const payload = isUsername
        ? { chesscom_username: username.trim(), hero_variant: heroVariant }
        : { pgn: pgn.trim(), hero_variant: heroVariant };

      const response = await submitReport(payload);
      router.push(`/report/${response.id}`);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Submission failed';
      setError(msg);
      setIsLoading(false);
    }
  };

  const copy = HERO_COPY[heroVariant];

  return (
    <div className="mx-auto max-w-3xl px-4 py-12 sm:px-6 sm:py-20">
      {/* Hero Section */}
      <div className="text-center">
        <span className="badge-accent mb-4 inline-flex text-xs font-semibold uppercase tracking-wider">
          {copy.hook}
        </span>
        <h1 className="t-display sm:text-4xl text-3xl font-extrabold tracking-tight mt-2 text-[var(--w-ink1)]">
          {copy.headline}
        </h1>
        <p className="t-body sm:text-lg text-base muted mt-4 max-w-2xl mx-auto">
          {copy.subhead}
        </p>
      </div>

      {/* Input Box Card */}
      <div className="card-box mt-10 shadow-sm border border-[var(--w-border)]">
        {/* Method Toggle Tabs */}
        <div className="flex border-b border-[var(--w-border)] mb-6">
          <button
            type="button"
            onClick={() => { setTab('username'); setError(null); }}
            className={`pb-3 px-4 text-sm font-semibold border-b-2 transition-colors ${
              tab === 'username'
                ? 'border-[var(--w-accent)] text-[var(--w-accent)]'
                : 'border-transparent text-[var(--w-ink2)] hover:text-[var(--w-ink1)]'
            }`}
          >
            Chess.com Username
          </button>
          <button
            type="button"
            onClick={() => { setTab('pgn'); setError(null); }}
            className={`pb-3 px-4 text-sm font-semibold border-b-2 transition-colors ${
              tab === 'pgn'
                ? 'border-[var(--w-accent)] text-[var(--w-accent)]'
                : 'border-transparent text-[var(--w-ink2)] hover:text-[var(--w-ink1)]'
            }`}
          >
            Paste PGN
          </button>
        </div>

        <form onSubmit={handleSubmit} className="flex flex-col gap-4">
          {tab === 'username' ? (
            <div>
              <label htmlFor="username" className="block text-sm font-medium text-[var(--w-ink1)] mb-1">
                Enter your Chess.com username
              </label>
              <input
                id="username"
                type="text"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                placeholder="e.g. hikaru"
                disabled={isLoading}
                className="w-full rounded-md border border-[var(--w-border)] bg-[var(--w-canvas)] px-3.5 py-2.5 text-sm text-[var(--w-ink1)] placeholder-[var(--w-ink2)] focus:border-[var(--w-accent)] focus:outline-none focus:ring-1 focus:ring-[var(--w-accent)]"
              />
              <p className="t-caption muted mt-1.5">
                We'll automatically analyze your most recent game.
              </p>
            </div>
          ) : (
            <div>
              <label htmlFor="pgn" className="block text-sm font-medium text-[var(--w-ink1)] mb-1">
                Paste your game PGN
              </label>
              <textarea
                id="pgn"
                rows={5}
                value={pgn}
                onChange={(e) => setPgn(e.target.value)}
                placeholder="1. e4 e5 2. Nf3 Nc6 3. Bc4..."
                disabled={isLoading}
                className="w-full rounded-md border border-[var(--w-border)] bg-[var(--w-canvas)] px-3.5 py-2.5 font-mono text-xs text-[var(--w-ink1)] placeholder-[var(--w-ink2)] focus:border-[var(--w-accent)] focus:outline-none focus:ring-1 focus:ring-[var(--w-accent)]"
              />
            </div>
          )}

          {error && (
            <div className="rounded-md bg-[var(--w-error-soft)] p-3 text-sm text-[var(--w-error)] border border-[var(--w-error)]/20">
              {error}
            </div>
          )}

          <button
            type="submit"
            disabled={isLoading}
            className="flex items-center justify-center gap-2 rounded-md bg-[var(--w-accent)] px-4 py-3 text-sm font-semibold text-[var(--w-on-accent)] shadow hover:opacity-90 focus:outline-none focus:ring-2 focus:ring-[var(--w-accent)] focus:ring-offset-2 disabled:opacity-50 transition-all"
          >
            {isLoading ? (
              <>
                <Sparkles className="w-4 h-4 animate-spin" />
                <span>Analyzing your game...</span>
              </>
            ) : (
              <>
                <span>Explain my game free</span>
                <ArrowRight className="w-4 h-4" />
              </>
            )}
          </button>
        </form>
      </div>

      {/* Trust & Features Footer */}
      <div className="mt-12 grid grid-cols-1 gap-6 sm:grid-cols-3 text-center border-t border-[var(--w-border)] pt-8">
        <div>
          <div className="flex justify-center mb-2">
            <Zap className="w-5 h-5 text-[var(--w-accent)]" />
          </div>
          <p className="t-body-strong">Instant Analysis</p>
          <p className="t-caption muted mt-0.5">3-stage engine evaluation in under 20 seconds.</p>
        </div>
        <div>
          <div className="flex justify-center mb-2">
            <Sparkles className="w-5 h-5 text-[var(--w-accent)]" />
          </div>
          <p className="t-body-strong">Plain English</p>
          <p className="t-caption muted mt-0.5">Teachable concepts & checkable habits for next game.</p>
        </div>
        <div>
          <div className="flex justify-center mb-2">
            <ShieldCheck className="w-5 h-5 text-[var(--w-accent)]" />
          </div>
          <p className="t-body-strong">Free, No Signup</p>
          <p className="t-caption muted mt-0.5">First 2 games free every week without creating an account.</p>
        </div>
      </div>
    </div>
  );
}
