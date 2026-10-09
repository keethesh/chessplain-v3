'use client';

import { useEffect, useRef, useState, type FormEvent } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { Chess } from 'chess.js';
import { ArrowRight, Check, ChevronRight, LoaderCircle, MoveUpRight } from 'lucide-react';
import { ApiError, listChessComGames, submitReport, type ChessComGameSummary, type SubmitReportPayload } from '../lib/api';
import { captureEvent } from '../lib/posthog';
import { supabase } from '../lib/supabase';
import { invalidateMe, useMe } from '../lib/use-session';
import { ReviewsPanel } from '../components/ReviewsPanel';
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

function resetsIn(iso: string): string {
  const days = Math.max(1, Math.ceil((Date.parse(iso) - Date.now()) / 86_400_000));
  return days === 1 ? 'tomorrow' : `in ${days} days`;
}

export default function HomePage() {
  const router = useRouter();
  const { signedIn, me, failed, retry } = useMe();
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
  const [errorField, setErrorField] = useState<'username' | 'pgn' | null>(null);
  const [confirmClear, setConfirmClear] = useState(false);
  const invalidField = error ? errorField : null;
  const sample = DEMO_REPORT.moments[0];
  const sampleBoard = new Chess(sample.fen_before);
  const samplePlayed = sampleBoard.move(sample.played);
  const sampleArrows = samplePlayed ? [{ startSquare: samplePlayed.from, endSquare: samplePlayed.to, color: 'var(--w-error)' }] : [];
  const sampleHighlights = samplePlayed ? [samplePlayed.from, samplePlayed.to] : [];
  const sampleMover = sample.player_color === 'black' ? 'Black' : 'White';
  const reviewedByUrl = new Map((me?.reviews ?? []).filter(r => r.game_url && r.status !== 'failed').map(r => [r.game_url as string, r.id]));
  // A failed review is re-queued without using the allowance, so those games stay clickable.
  const failedUrls = new Set((me?.reviews ?? []).filter(r => r.game_url && r.status === 'failed').map(r => r.game_url as string));
  const left = me?.allowance ? Math.max(0, me.allowance.limit - me.allowance.used) : null;

  useEffect(() => {
    captureEvent('landing_viewed', { hero_variant: 'editorial_v1' });
    setRecentReviews(getRecentReviews());
  }, []);

  // A returning player's Chess.com username is remembered: show their games straight away.
  const remembered = me?.chesscom_username ?? null;
  useEffect(() => {
    if (!remembered) return;
    let active = true;
    setUsername(current => current || remembered);
    listChessComGames(remembered).then(list => { if (active) setGames(current => current ?? list); }).catch(() => { /* The form still works by hand. */ });
    return () => { active = false; };
  }, [remembered]);

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
      invalidateMe();
      router.push('/report/' + response.id);
    } catch (err) {
      setQuotaReached(err instanceof ApiError && err.status === 402 ? (signedIn ? 'signed-in' : 'anonymous') : null);
      setErrorField(null);
      setError(err instanceof Error ? err.message : 'Unable to submit the game. Check your connection and try again.');
      submitting.current = false;
      setIsLoading(false);
      setPickingUrl(null);
    }
  }

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    if (submitting.current) return;
    setError(null); setErrorField(null);
    setQuotaReached(null);
    if (method === 'pgn') {
      if (!pgn.trim()) { setErrorField('pgn'); return setError('Paste the moves from a completed game.'); }
      return startReview({ pgn: pgn.trim(), player_color: color, hero_variant: 'editorial_v1' }, 'pgn');
    }
    if (!username.trim()) { setErrorField('username'); return setError('Enter your Chess.com username to see your recent games.'); }
    submitting.current = true;
    setIsLoading(true);
    try {
      setGames(await listChessComGames(username.trim()));
      captureEvent('games_listed');
    } catch (err) {
      setErrorField('username');
      setError(err instanceof Error ? err.message : 'Unable to reach Chess.com. Check your connection and try again.');
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
          {signedIn ? (
            <>
              <p className="hero-kicker">Welcome back</p>
              <h1>Which game should we <em>look at next?</em></h1>
              <p className="hero-lede">Pick a recent game and read the one moment that decided it. Games you’ve already reviewed are marked, and open straight away.</p>
            </>
          ) : (
            <>
              <p className="hero-kicker">Chess review for the rest of us</p>
              <h1>Find the move that <span className="hero-mark">looked right</span> but <em>changed everything.</em></h1>
              <p className="hero-lede">See what your move allowed, why it mattered, and what to notice next time. No engine report card. Just the turning point.</p>
            </>
          )}
          <div className="submit-panel" id="analyze">
            <div className="method-tabs" role="group" aria-label="Choose how to add your game">
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
                    {left === 0 && (
                      <p className="game-limit-note" role="status">
                        No free reviews left this week{me?.allowance?.next_slot_at ? `. Your next one is ${resetsIn(me.allowance.next_slot_at)}` : ''}. <Link href="/pricing" className="underline">Upgrade</Link> for no weekly limit. Games you’ve reviewed still open.
                      </p>
                    )}
                    <ul className="game-list" aria-labelledby="game-list-label">
                      {games.map(game => {
                        const reviewId = reviewedByUrl.get(game.url);
                        return (
                          <li key={game.url}>
                            <button
                              type="button"
                              className="game-row"
                              disabled={isLoading || (left === 0 && !reviewId && !failedUrls.has(game.url))}
                              aria-busy={pickingUrl === game.url}
                              onClick={() => (reviewId ? router.push('/report/' + reviewId) : reviewGame(game.url))}
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
                              {reviewId && <span className="game-reviewed"><Check size={13} aria-hidden="true" /><span className="game-reviewed-label">Reviewed</span></span>}
                              {pickingUrl === game.url
                                ? <LoaderCircle size={17} className="spin" aria-label="Opening your review" />
                                : <ChevronRight size={17} aria-hidden="true" />}
                            </button>
                          </li>
                        );
                      })}
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
                      aria-describedby={invalidField === 'username' ? 'source-help form-error-message' : 'source-help'}
                      aria-invalid={invalidField === 'username'}
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
                      aria-describedby={invalidField === 'pgn' ? 'pgn-help form-error-message' : 'pgn-help'}
                      aria-invalid={invalidField === 'pgn'}
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
                  <p id="form-error-message">{error}</p>
                  {quotaReached && (
                    <Link href={quotaReached === 'anonymous' ? '/login?next=%2F%23analyze' : '/pricing'}>
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
              {!(left === 0 && method === 'username' && games) && (
                <p className="form-reassurance">
                  <Check size={14} />
                  {!signedIn
                    ? ' 2 free reviews every 7 days. No signup required.'
                    : !me ? (failed ? ' We couldn’t check your allowance.' : ' Checking your allowance…')
                    : left === null ? ' Premium: no weekly limit.'
                    : left > 0 ? ` ${left} of ${me.allowance!.limit} free reviews left this week.`
                    : ` No free reviews left this week. ${me.allowance!.next_slot_at ? `Your next one is ${resetsIn(me.allowance!.next_slot_at)}.` : ''}`}
                </p>
              )}
            </form>
          </div>
          {!signedIn && recentReviews.length > 0 && (
            <div className="recent-reviews-panel mt-6 rounded-md border border-[var(--w-border)] bg-[var(--w-surface)] p-4 text-left shadow-[var(--shadow-sm)]">
              <div className="flex items-center justify-between mb-2.5 text-xs text-[var(--w-ink2)]">
                <span className="font-semibold uppercase tracking-wider">Your recent reviews</span>
                <button
                  type="button"
                  onClick={() => {
                    if (!confirmClear) return setConfirmClear(true);
                    clearRecentReviews(); setRecentReviews([]); setConfirmClear(false);
                  }}
                  onBlur={() => setConfirmClear(false)}
                  className="inline-flex min-h-11 items-center px-2 text-[var(--w-ink2)] hover:text-[var(--w-ink1)] underline"
                >
                  {confirmClear ? 'Confirm clear' : 'Clear'}
                </button>
              </div>
              <div className="space-y-1.5">
                {recentReviews.map((rev) => (
                  <Link
                    key={rev.id}
                    href={`/report/${rev.id}`}
                    className="flex items-center justify-between p-2.5 rounded hover:bg-[var(--w-surface-subtle)] text-sm transition-colors"
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
          {!signedIn && (
            <Link
              className="text-link hero-sample-link"
              href="/report/demo"
              onClick={() => captureEvent('sample_game_clicked', { source: 'hero' })}
            >
              See a sample review first <ArrowRight size={15} />
            </Link>
          )}
        </div>
        {signedIn ? <ReviewsPanel me={me} failed={failed} onRetry={retry} /> : (
        <aside className="sample-preview" aria-label="Preview of a sample turning-point review">
          <div className="sample-masthead">
            <span>SAMPLE REVIEW</span>
            <span>Paris, 1858 · Move {sample.move_number}</span>
          </div>
          <div className="sample-board">
            <ChessboardView
              key={showMove ? 'sample-after' : 'sample-before'}
              fen={showMove ? sample.fen_after : sample.fen_before}
              orientation={sample.player_color}
              boardWidth={352}
              arrows={showMove ? [] : sampleArrows}
              highlightSquares={showMove ? [] : sampleHighlights}
            />
          </div>
          <div className="sample-controls">
            <span>Move {sample.move_number} · {sampleMover} to move{showMove ? ' · played' : ''}</span>
            <button type="button" onClick={() => setShowMove(!showMove)}>
              {showMove ? 'Reset position' : 'Show the move'} <ChevronRight size={15} />
            </button>
          </div>
          <div className="sample-annotation">
            <span className="annotation-mark"><MoveUpRight size={23} /></span>
            <div>
              <h2>A natural move.<br />Two things hanging.</h2>
              <p>{sample.what_actually_happens}</p>
            </div>
          </div>
          <Link href="/report/demo" className="sample-read">
            Explore the sample review <ArrowRight size={16} />
          </Link>
        </aside>
        )}
      </section>

      {!signedIn && <>
      <section className="lesson-section page-width">
        <div className="lesson-header">
          <h2>One game. One turning point. <em>One useful habit.</em></h2>
          <p>Start with the position, follow the consequence, then keep one question for your next game.</p>
        </div>
        <div className="lesson-grid">
          <article className="lesson-card"><span className="lesson-mark" aria-hidden="true">?</span><h3>Before your move</h3><p>Every moment starts with one idea, in plain words. <strong>{sample.concept_name}</strong> means {sample.concept_definition}</p></article>
          <article className="lesson-card"><span className="lesson-mark" aria-hidden="true">!</span><h3>See what changed</h3><p>{sample.what_actually_happens} Replay it on the board.</p></article>
          <article className="lesson-card"><span className="lesson-mark" aria-hidden="true">→</span><h3>Carry one question</h3><p>{DEMO_REPORT.summary?.focus_habit}</p></article>
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
            <p>No. You get two free reviews every seven days without signing up. Free usage is counted by network, so people on a shared connection may share the allowance. <Link href="/login" className="underline">Signing in</Link> gives you your own two free reviews each week.</p>
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
      <section className="closing-cta page-width">
        <h2>Bring a game you’re still thinking about.</h2>
        <a href="#analyze" className="primary-button">Review a game <ArrowRight size={17} /></a>
      </section>
      </>}
    </div>
  );
}
