'use client';

import { useEffect, useRef, useState, type FormEvent } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { Chess } from 'chess.js';
import { ArrowRight, Check, ChevronRight, LoaderCircle, MoveUpRight } from 'lucide-react';
import { ApiError, listChessComGames, submitReport, type ChessComGameSummary, type SubmitReportPayload } from '../lib/api';
import { captureEvent } from '../lib/posthog';
import { supabase } from '../lib/supabase';
import { ChessboardView } from '../components/ChessboardView';
import { DEMO_REPORT } from '../lib/demo-report';
import { getRecentReviews, clearRecentReviews, type RecentReview } from '../lib/recent-reviews';

function playedAgo(iso: string): string {
  const rtf = new Intl.RelativeTimeFormat('en', { numeric: 'auto' });
  const minutes = Math.max(1, Math.round((Date.now() - Date.parse(iso)) / 60000));
  if (minutes < 60) return rtf.format(-minutes, 'minute');
  const hours = Math.round(minutes / 60);
  return hours < 24 ? rtf.format(-hours, 'hour') : rtf.format(-Math.round(hours / 24), 'day');
}

const OUTCOME_LABEL = { win: 'Won', loss: 'Lost', draw: 'Drew' } as const;

export default function HomePage() {
  const router = useRouter();
  const [method, setMethod] = useState<'username' | 'pgn'>('username');
  const [username, setUsername] = useState('');
  const [pgn, setPgn] = useState('');
  const [color, setColor] = useState<'white' | 'black'>('white');
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [quotaReached, setQuotaReached] = useState<'anonymous' | 'signed-in' | null>(null);
  const [showMove, setShowMove] = useState(false);
  const [recentReviews, setRecentReviews] = useState<RecentReview[]>([]);
  const [games, setGames] = useState<ChessComGameSummary[] | null>(null);
  const [pickingUrl, setPickingUrl] = useState<string | null>(null);
  const submitting = useRef(false);
  const sample = DEMO_REPORT.moments[0];
  const sampleBoard = new Chess(sample.fen_before);
  const samplePlayed = sampleBoard.move(sample.played);
  const sampleArrows = samplePlayed ? [{ startSquare: samplePlayed.from, endSquare: samplePlayed.to, color: 'var(--w-error)' }] : [];
  const sampleHighlights = samplePlayed ? [samplePlayed.from, samplePlayed.to] : [];

  useEffect(() => {
    captureEvent('landing_viewed', { hero_variant: 'editorial_v1' });
    setRecentReviews(getRecentReviews());
  }, []);

  async function startReview(payload: SubmitReportPayload, source: 'chesscom' | 'pgn') {
    if (submitting.current) return;
    submitting.current = true;
    setIsLoading(true);
    setError(null);
    setQuotaReached(null);
    let signedIn = false;
    try {
      const { data } = await supabase.auth.getSession();
      signedIn = Boolean(data.session);
      const response = await submitReport(payload, data.session?.access_token);
      captureEvent('game_submitted', { method: source });
      router.push('/report/' + response.id);
    } catch (err) {
      setQuotaReached(err instanceof ApiError && err.status === 402 ? (signedIn ? 'signed-in' : 'anonymous') : null);
      setError(err instanceof Error ? err.message : 'We could not submit your game. Please try again.');
      submitting.current = false;
      setIsLoading(false);
      setPickingUrl(null);
    }
  }

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    if (submitting.current) return;
    setError(null);
    setQuotaReached(null);
    if (method === 'pgn') {
      if (!pgn.trim()) return setError('Paste the moves from a completed game.');
      return startReview({ pgn: pgn.trim(), player_color: color, hero_variant: 'editorial_v1' }, 'pgn');
    }
    if (!username.trim()) return setError('Enter your Chess.com username to see your recent games.');
    submitting.current = true;
    setIsLoading(true);
    try {
      setGames(await listChessComGames(username.trim()));
      captureEvent('games_listed');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'We could not reach Chess.com. Please try again.');
    } finally {
      submitting.current = false;
      setIsLoading(false);
    }
  }

  function reviewGame(url: string) {
    if (submitting.current) return;
    setPickingUrl(url);
    startReview({ chesscom_username: username.trim(), chesscom_game_url: url, hero_variant: 'editorial_v1' }, 'chesscom');
  }

  return (
    <div className="home-page">
      <section className="home-hero page-width">
        <div className="hero-copy">
          <p className="hero-kicker">Chess review for the rest of us</p>
          <h1>Find the move that <span className="hero-mark">looked right</span> but <em>changed everything.</em></h1>
          <p className="hero-lede">See what your move allowed, why it mattered, and what to notice next time. No engine report card. Just the turning point.</p>
          <div className="submit-panel" id="analyze">
            <div className="method-tabs" aria-label="Choose how to add your game">
              <button
                type="button"
                aria-pressed={method === 'username'}
                disabled={isLoading}
                onClick={() => { setMethod('username'); setError(null); setQuotaReached(null); }}
              >
                Chess.com username
              </button>
              <button
                type="button"
                aria-pressed={method === 'pgn'}
                disabled={isLoading}
                onClick={() => { setMethod('pgn'); setError(null); setQuotaReached(null); }}
              >
                Paste a PGN
              </button>
            </div>
            <form onSubmit={handleSubmit} className="submit-form" aria-busy={isLoading}>
              {method === 'username' ? (
                games ? (
                  <div className="game-picker">
                    <div className="game-picker-head">
                      <p id="game-list-label">Recent games for <strong>{username.trim()}</strong></p>
                      <button type="button" className="text-button" disabled={isLoading} onClick={() => { setGames(null); setError(null); setQuotaReached(null); }}>
                        Change
                      </button>
                    </div>
                    <ul className="game-list" aria-labelledby="game-list-label">
                      {games.map(game => (
                        <li key={game.url}>
                          <button
                            type="button"
                            className="game-row"
                            disabled={isLoading}
                            aria-busy={pickingUrl === game.url}
                            onClick={() => reviewGame(game.url)}
                          >
                            <span className={`game-outcome game-outcome-${game.outcome}`}>{OUTCOME_LABEL[game.outcome]}</span>
                            <span className="game-row-main">
                              <span className="game-opponent">
                                vs {game.opponent}
                                {game.opponentRating !== null && <span className="game-rating">{game.opponentRating}</span>}
                              </span>
                              <span className="game-meta">
                                <span className="game-time-class">{game.timeClass}</span> · {playedAgo(game.endedAt)} · as {game.playerColor}
                              </span>
                            </span>
                            {pickingUrl === game.url
                              ? <LoaderCircle size={17} className="spin" aria-label="Opening your review" />
                              : <ChevronRight size={17} aria-hidden="true" />}
                          </button>
                        </li>
                      ))}
                    </ul>
                  </div>
                ) : (
                  <div className="field-group">
                    <label htmlFor="chess-username">Your Chess.com username</label>
                    <input
                      id="chess-username"
                      name="username"
                      autoComplete="off"
                      autoCapitalize="none"
                      spellCheck={false}
                      value={username}
                      maxLength={100}
                      onChange={e => setUsername(e.target.value)}
                      placeholder="e.g. your_chess_username"
                      disabled={isLoading}
                      aria-describedby="source-help"
                      aria-invalid={!!error}
                    />
                    <p id="source-help" className="field-help">Pick any of your 10 most recent games. No Chess.com password needed.</p>
                  </div>
                )
              ) : (
                <>
                  <div className="field-group">
                    <label htmlFor="game-pgn">Game moves (PGN)</label>
                    <textarea
                      id="game-pgn"
                      rows={4}
                      value={pgn}
                      maxLength={100000}
                      onChange={e => setPgn(e.target.value)}
                      placeholder="1. e4 e5 2. Nf3 Nc6…"
                      disabled={isLoading}
                      aria-describedby="pgn-help"
                      aria-invalid={!!error}
                    />
                    <p id="pgn-help" className="field-help">Open a finished game on Chess.com or Lichess, choose Share or Export, then copy the PGN.</p>
                  </div>
                  <fieldset className="side-choice" disabled={isLoading}>
                    <legend>Which side did you play?</legend>
                    {(['white', 'black'] as const).map(side => (
                      <label key={side}>
                        <input
                          type="radio"
                          name="player-color"
                          value={side}
                          checked={color === side}
                          onChange={() => setColor(side)}
                        />
                        {side === 'white' ? 'White' : 'Black'}
                      </label>
                    ))}
                  </fieldset>
                </>
              )}
              {error && (
                <div className="form-error" role="alert">
                  <p>{error}</p>
                  {quotaReached && (
                    <Link href={quotaReached === 'anonymous' ? '/login' : '/pricing'}>
                      {quotaReached === 'anonymous' ? 'Sign in for your own free reviews' : 'See Premium'} <ArrowRight size={14} />
                    </Link>
                  )}
                </div>
              )}
              {!(method === 'username' && games) && (
                <button className="primary-button" type="submit" disabled={isLoading}>
                  {isLoading ? (
                    <>
                      <LoaderCircle size={17} className="spin" /> {method === 'username' ? 'Finding your games…' : 'Opening your review…'}
                    </>
                  ) : (
                    <>
                      {method === 'username' ? 'Show my recent games' : 'Explain my game'} <ArrowRight size={17} />
                    </>
                  )}
                </button>
              )}
              <p className="form-reassurance">
                <Check size={14} /> 2 free reports every 7 days. No signup required.
              </p>
            </form>
          </div>
          {recentReviews.length > 0 && (
            <div className="recent-reviews-panel mt-6 rounded-xl border border-[var(--w-border)] bg-[var(--w-surface)] p-4 text-left shadow-[var(--shadow-sm)]">
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
          <Link
            className="text-link hero-sample-link"
            href="/report/demo"
            onClick={() => captureEvent('sample_game_clicked', { source: 'hero' })}
          >
            Take a look at a sample first <ArrowRight size={15} />
          </Link>
        </div>
        <aside className="sample-preview" aria-label="Preview of an illustrative turning-point analysis">
          <div className="sample-masthead">
            <span>ILLUSTRATIVE ANALYSIS</span>
            <span>3… Nf6? / 4. Qxf7#</span>
          </div>
          <div className="sample-board">
            <ChessboardView
              key={showMove ? 'sample-after' : 'sample-before'}
              fen={showMove ? sample.fen_after : sample.fen_before}
              orientation="white"
              boardWidth={352}
              arrows={showMove ? [] : sampleArrows}
              highlightSquares={showMove ? [] : sampleHighlights}
            />
          </div>
          <div className="sample-controls">
            <span>Move {sample.move_number} · {showMove ? 'White to move' : 'Black to move'}</span>
            <button type="button" aria-pressed={showMove} onClick={() => setShowMove(!showMove)}>
              {showMove ? 'Reset position' : 'Show the move'} <ChevronRight size={15} />
            </button>
          </div>
          <div className="sample-annotation">
            <span className="annotation-mark"><MoveUpRight size={23} /></span>
            <div>
              <h2>A natural move.<br />An overlooked threat.</h2>
              <p>{sample.what_actually_happens}</p>
            </div>
          </div>
          <Link href="/report/demo" className="sample-read">
            Explore this review <ArrowRight size={16} />
          </Link>
        </aside>
      </section>

      <section className="lesson-section page-width">
        <div className="lesson-header">
          <h2>One game. One turning point. <em>One useful habit.</em></h2>
          <p>Start with the position, follow the consequence, then keep one question for your next game.</p>
        </div>
        <div className="lesson-grid">
          <article className="lesson-card"><span className="lesson-mark" aria-hidden="true">?</span><h3>Before your move</h3><p>What were you trying to do? What could your opponent force next?</p></article>
          <article className="lesson-card"><span className="lesson-mark" aria-hidden="true">!</span><h3>See what changed</h3><p>Replay the move and inspect the threat or continuation it allowed.</p></article>
          <article className="lesson-card"><span className="lesson-mark" aria-hidden="true">→</span><h3>Carry one question</h3><p>Leave with a practical check to use before a similar move next time.</p></article>
        </div>
      </section>
      <section className="questions-section page-width">
        <div className="questions-header">
          <h2>A few things to know.</h2>
        </div>
        <div className="questions-list">
          <details>
            <summary>
              Can I choose a different game?
              <span className="faq-icon" aria-hidden="true">+</span>
            </summary>
            <p>Yes. Enter your Chess.com username and pick any of your 10 most recent games. For an older game, or one from Lichess, paste its PGN and select your side.</p>
          </details>
          <details>
            <summary>
              Do I need an account?
              <span className="faq-icon" aria-hidden="true">+</span>
            </summary>
            <p>No. You get two free reports every seven days without signing up. Free usage is counted by network, so people on a shared connection may share the allowance. <Link href="/login" className="underline">Signing in</Link> gives you your own two free reports each week.</p>
          </details>
          <details>
            <summary>
              How are the explanations made?
              <span className="faq-icon" aria-hidden="true">+</span>
            </summary>
            <p>Stockfish examines positions and possible replies. AI turns that analysis into readable explanations. What a move was going for is read from the board, not your mind, and explanations can be wrong: use the board to check them.</p>
          </details>
          <details>
            <summary>
              Who can see my report?
              <span className="faq-icon" aria-hidden="true">+</span>
            </summary>
            <p>Anyone with a report link can open it. Reports may include the player names and game you submit, so only submit games you are comfortable sharing.</p>
          </details>
        </div>
      </section>
    </div>
  );
}
