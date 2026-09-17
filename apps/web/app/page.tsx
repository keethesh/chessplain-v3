'use client';

import { useEffect, useRef, useState, type FormEvent } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { ArrowRight, Check, ChevronRight, LoaderCircle, MoveUpRight } from 'lucide-react';
import { ApiError, submitReport } from '../lib/api';
import { captureEvent } from '../lib/posthog';
import { supabase } from '../lib/supabase';
import { ChessboardView } from '../components/ChessboardView';
import { DEMO_REPORT } from '../lib/demo-report';
import { getRecentReviews, clearRecentReviews, type RecentReview } from '../lib/recent-reviews';

export default function HomePage() {
  const router = useRouter();
  const [method, setMethod] = useState<'username' | 'pgn'>('username');
  const [username, setUsername] = useState('');
  const [pgn, setPgn] = useState('');
  const [color, setColor] = useState<'white' | 'black'>('white');
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [quotaReached, setQuotaReached] = useState(false);
  const [showMove, setShowMove] = useState(false);
  const [recentReviews, setRecentReviews] = useState<RecentReview[]>([]);
  const submitting = useRef(false);
  const sample = DEMO_REPORT.moments[0];

  useEffect(() => {
    captureEvent('landing_viewed', { hero_variant: 'editorial_v1' });
    setRecentReviews(getRecentReviews());
  }, []);

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    if (submitting.current) return;
    setError(null);
    setQuotaReached(false);
    const value = method === 'username' ? username.trim() : pgn.trim();
    if (!value) {
      setError(method === 'username' ? 'Enter your Chess.com username to find your latest game.' : 'Paste the moves from a completed game.');
      return;
    }
    submitting.current = true;
    setIsLoading(true);
    try {
      const { data } = await supabase.auth.getSession();
      const response = await submitReport(method === 'username'
        ? { chesscom_username: value, hero_variant: 'editorial_v1' }
        : { pgn: value, player_color: color, hero_variant: 'editorial_v1' }, data.session?.access_token);
      captureEvent('game_submitted', { method: method === 'username' ? 'chesscom' : 'pgn' });
      router.push('/report/' + response.id);
    } catch (err) {
      setQuotaReached(err instanceof ApiError && err.status === 402);
      setError(err instanceof Error ? err.message : 'We couldn’t submit your game. Please try again.');
      submitting.current = false;
      setIsLoading(false);
    }
  }

  return (
    <div className="home-page">
      <section className="home-hero page-width">
        <div className="hero-copy">
          <h1>A little clarity.<br />A better <em>next game.</em></h1>
          <p className="hero-lede">Understand the moments that changed your game, see what happened on the board, and leave with one thing to work on.</p>
          <div className="submit-panel" id="analyze">
            <div className="method-tabs" aria-label="Choose how to add your game">
              <button type="button" aria-pressed={method === 'username'} disabled={isLoading} onClick={() => { setMethod('username'); setError(null); setQuotaReached(false); }}>Chess.com username</button>
              <button type="button" aria-pressed={method === 'pgn'} disabled={isLoading} onClick={() => { setMethod('pgn'); setError(null); setQuotaReached(false); }}>Paste a PGN</button>
            </div>
            <form onSubmit={handleSubmit} className="submit-form" aria-busy={isLoading}>
              {method === 'username' ? <div className="field-group">
                <label htmlFor="chess-username">Your Chess.com username</label>
                <input id="chess-username" name="username" autoComplete="off" autoCapitalize="none" spellCheck={false} value={username} maxLength={100} onChange={e => setUsername(e.target.value)} placeholder="e.g. your_chess_username" disabled={isLoading} aria-describedby="source-help" aria-invalid={!!error} />
                <p id="source-help" className="field-help">Your latest completed game. No Chess.com password needed.</p>
              </div> : <>
                <div className="field-group">
                  <label htmlFor="game-pgn">Game moves (PGN)</label>
                  <textarea id="game-pgn" rows={4} value={pgn} maxLength={100000} onChange={e => setPgn(e.target.value)} placeholder="1. e4 e5 2. Nf3 Nc6…" disabled={isLoading} aria-describedby="pgn-help" aria-invalid={!!error} />
                  <p id="pgn-help" className="field-help">Open a finished game on Chess.com or Lichess, choose Share or Export, then copy the PGN.</p>
                </div>
                <fieldset className="side-choice" disabled={isLoading}><legend>Which side did you play?</legend>
                  {(['white', 'black'] as const).map(side => <label key={side}><input type="radio" name="player-color" value={side} checked={color === side} onChange={() => setColor(side)} />{side === 'white' ? 'White' : 'Black'}</label>)}
                </fieldset>
              </>}
              {error && <div className="form-error" role="alert"><p>{error}</p>{quotaReached && <Link href="/pricing">See plans or sign in <ArrowRight size={14} /></Link>}</div>}
              <button className="primary-button" type="submit" disabled={isLoading}>{isLoading ? <><LoaderCircle size={17} className="spin" /> Opening your review…</> : <>Explain my game <ArrowRight size={17} /></>}</button>
              <p className="form-reassurance"><Check size={14} /> 2 free reports every 7 days. No signup required.</p>
            </form>
          </div>
          {recentReviews.length > 0 && (
            <div className="recent-reviews-panel mt-6 rounded-xl border border-[var(--w-border)] bg-[var(--w-surface)] p-4 text-left">
              <div className="flex items-center justify-between mb-2.5 text-xs text-[var(--w-ink2)]">
                <span className="font-semibold uppercase tracking-wider">Your recent reviews</span>
                <button
                  type="button"
                  onClick={() => { clearRecentReviews(); setRecentReviews([]); }}
                  className="text-[var(--w-ink3)] hover:text-[var(--w-ink1)] underline"
                >
                  Clear
                </button>
              </div>
              <div className="space-y-1.5">
                {recentReviews.map((rev) => (
                  <Link
                    key={rev.id}
                    href={`/report/${rev.id}`}
                    className="flex items-center justify-between p-2.5 rounded-lg hover:bg-[var(--w-surface-subtle)] text-sm transition-colors"
                  >
                    <div className="min-w-0 pr-2">
                      <p className="font-medium truncate text-[var(--w-ink1)] leading-snug">
                        {rev.headline || rev.players || 'Game review'}
                      </p>
                      {rev.players && rev.headline && (
                        <p className="text-xs text-[var(--w-ink3)] truncate mt-0.5">{rev.players}</p>
                      )}
                    </div>
                    <ArrowRight size={14} className="shrink-0 text-[var(--w-ink3)]" />
                  </Link>
                ))}
              </div>
            </div>
          )}
          <Link className="text-link hero-sample-link" href="/report/demo" onClick={() => captureEvent('sample_game_clicked', { source: 'hero' })}>Take a look at a sample first <ArrowRight size={15} /></Link>
        </div>
        <aside className="sample-preview" aria-label="Preview of a sample review">
          <div className="sample-masthead"><span>The game, in perspective</span><span>Sample review</span></div>
          <div className="sample-board"><ChessboardView fen={showMove ? sample.fen_after : sample.fen_before} orientation="white" boardWidth={352} /></div>
          <div className="sample-controls"><span>Move {sample.move_number} · {showMove ? 'White' : 'Black'} to play</span><button type="button" onClick={() => setShowMove(!showMove)}>{showMove ? 'Before the move' : 'See ' + sample.played} <ChevronRight size={15} /></button></div>
          <div className="sample-annotation"><span className="annotation-mark"><MoveUpRight size={23} /></span><div><h2>A natural move.<br />An overlooked threat.</h2><p>{sample.what_actually_happens}</p></div></div>
          <Link href="/report/demo" className="sample-read">Explore this review <ArrowRight size={16} /></Link>
        </aside>
      </section>
      <section className="lesson-section page-width">
        <div><h2>The point isn’t to review<br />every move. <em>It’s to learn.</em></h2><p>A useful review connects a decision to what happened next. Then it gives you something small enough to remember when you play again.</p></div>
        <ol className="lesson-steps"><li><span>01</span><div><h3>Find the moments that matter</h3><p>Start with a completed game. We look for decisions worth a closer look.</p></div></li><li><span>02</span><div><h3>Follow the idea on the board</h3><p>Read the explanation alongside the position. Step through the move and its reply.</p></div></li><li><span>03</span><div><h3>Take one lesson with you</h3><p>A practical question to ask yourself in your next game, in plain English.</p></div></li></ol>
      </section>
      <section className="questions-section page-width"><h2>A few things to know.</h2><div className="questions-list">
        <details><summary>Can I choose a different game?<span>+</span></summary><p>The username option imports your latest completed Chess.com game. To review a specific game from Chess.com or Lichess, paste its PGN and select your side.</p></details>
        <details><summary>Do I need an account?<span>+</span></summary><p>You can get two free reports every seven days without signing up. Free usage is counted by network, so people on a shared connection may share the allowance.</p></details>
        <details><summary>How are the explanations made?<span>+</span></summary><p>Stockfish examines positions and possible replies. AI turns that analysis into readable explanations. A suggested intention is an interpretation, and explanations can be wrong—use the board to check them.</p></details>
        <details><summary>Who can see my report?<span>+</span></summary><p>Anyone with a report link can open it. Reports may include the player names and game you submit, so only submit games you are comfortable sharing.</p></details>
      </div></section>
    </div>
  );
}
