'use client';

import { useEffect, useMemo, useRef, useState, type FormEvent, type ReactNode } from 'react';
import Link from 'next/link';
import { Chess } from 'chess.js';
import type { Me, MomentReport, ReportDetail } from '../lib/api';
import { GREMLINS } from '../lib/gremlins';
import { assignSquareColors } from '../lib/squares';
import { captureEvent } from '../lib/posthog';
import { ChessboardView } from './ChessboardView';
import { Gremlin } from './Gremlin';
import { SquareText } from './SquareText';

type Mode = 'owner' | 'shared' | 'demo';
type Kind = 'prompt' | 'checked' | 'played' | 'other' | 'shown';

interface Attempt {
  kind: Kind;
  fen?: string;
  san?: string;
  from?: string;
  to?: string;
  line?: number;
}

interface Frame { fen: string; san: string; from: string; to: string; }

const BLUE = '#2f6bff';
const RED = '#ff4d6d';

function stripSan(move: string): string {
  return move.replace(/^\d+\.+\s*/, '').trim();
}

function pgnHeader(pgn: string | undefined, key: string): string | null {
  if (!pgn) return null;
  const match = pgn.match(new RegExp(`\\[${key}\\s+"([^"]*)"\\]`, 'i'));
  const value = match?.[1]?.trim();
  return value || null;
}

/** Chess.com username and game URL when this report is one of that player's games. */
export function chesscomIdentity(report: ReportDetail, me: Me | null): { username: string | null; gameUrl: string | null } {
  const mine = me?.reviews.find(review => review.id === report.id);
  const link = pgnHeader(report.source_games?.pgn, 'Link');
  const site = pgnHeader(report.source_games?.pgn, 'Site');
  const httpChess = (value: string | null) => Boolean(value && /^https?:\/\/([^/]+\.)?chess\.com/i.test(value));
  const gameUrl = mine?.game_url || (httpChess(link) ? link : null) || (httpChess(site) ? site : null);
  const chesscom = Boolean(gameUrl) || /chess\.com/i.test(`${site ?? ''} ${link ?? ''}`);
  if (!chesscom) return { username: null, gameUrl: null };
  const headerName = pgnHeader(report.source_games?.pgn, report.player_color === 'black' ? 'Black' : 'White');
  const username = headerName || (mine?.game_url ? me?.chesscom_username ?? null : null) || report.player_name || null;
  return { username, gameUrl };
}

export function sameGame(a: string, b: string): boolean {
  if (a === b) return true;
  const id = (url: string) => url.split('?')[0].split('/').filter(Boolean).pop() ?? '';
  const left = id(a);
  return /^\d+$/.test(left) && left === id(b);
}

function formatDate(iso?: string | null): string | null {
  if (!iso) return null;
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return null;
  return new Intl.DateTimeFormat('en-GB', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' }).format(date);
}

function reportWhen(report: ReportDetail, mode: Mode): string | null {
  const raw = pgnHeader(report.source_games?.pgn, 'Date');
  if (raw && /^\d{4}\.\d{2}\.\d{2}$/.test(raw)) return formatDate(raw.replace(/\./g, '-'));
  if (mode === 'demo') return null;
  return formatDate(report.created_at);
}

function resultLabel(result?: string): string | null {
  if (result === '1-0') return 'White won';
  if (result === '0-1') return 'Black won';
  if (result === '1/2-1/2') return 'Draw';
  return null;
}

function lineFrames(moment: MomentReport): Frame[] {
  try {
    const game = new Chess(moment.fen_before);
    const played = game.move(stripSan(moment.played));
    if (!played) return [];
    const frames: Frame[] = [{ fen: game.fen(), san: played.san, from: played.from, to: played.to }];
    for (const token of moment.refutation_line.replace(/\d+\.+\s*/g, ' ').trim().split(/\s+/)) {
      if (!token || token === '1-0' || token === '0-1' || token === '1/2-1/2' || token === '*') continue;
      const move = game.move(token);
      if (!move) break;
      frames.push({ fen: game.fen(), san: move.san, from: move.from, to: move.to });
    }
    return frames;
  } catch {
    return [];
  }
}

function classify(san: string, moment: MomentReport): Kind {
  if (san === stripSan(moment.best_move)) return 'checked';
  if (san === stripSan(moment.played)) return 'played';
  return 'other';
}

export function SharedReportInteractiveView({
  report, mode = 'owner', focusPly, progressNote, onMoment, children,
}: {
  report: ReportDetail;
  mode?: Mode;
  focusPly?: number;
  progressNote?: string;
  onMoment?: (index: number) => void;
  children?: ReactNode;
}) {
  const moments = report.moments || [];
  const complete = report.status === 'completed';
  const [index, setIndex] = useState(() => {
    if (focusPly == null) return 0;
    const found = moments.findIndex(moment => moment.ply === focusPly);
    return found >= 0 ? found : 0;
  });
  const jumped = useRef(moments.some(moment => moment.ply === focusPly));
  const [tries, setTries] = useState<Record<number, Attempt>>({});
  const [typed, setTyped] = useState('');
  const [note, setNote] = useState('');
  const [focusSquare, setFocusSquare] = useState<string | null>(null);
  const [shareNote, setShareNote] = useState('');
  const [shareUrl, setShareUrl] = useState('');
  const [othersOpen, setOthersOpen] = useState(false);
  const moveRef = useRef<HTMLInputElement>(null);
  const outcomeRef = useRef<HTMLParagraphElement>(null);
  const ideaRef = useRef<HTMLHeadingElement>(null);
  const promptRef = useRef<HTMLHeadingElement>(null);
  const land = useRef<'result' | 'input' | null>(null);
  const checksSent = useRef(new Set<number>());
  const stepperRef = useRef<HTMLDivElement>(null);
  const focusStepper = useRef(false);

  useEffect(() => {
    if (jumped.current || focusPly == null) return;
    const found = moments.findIndex(moment => moment.ply === focusPly);
    if (found < 0) return;
    jumped.current = true;
    setIndex(found);
  }, [moments, focusPly]);

  const safe = moments.length ? Math.min(index, moments.length - 1) : 0;
  const moment = moments[safe];
  const attempt: Attempt = moment ? tries[moment.ply] ?? { kind: 'prompt' } : { kind: 'prompt' };
  const revealed = attempt.kind !== 'prompt';
  const frames = useMemo(() => (moment ? lineFrames(moment) : []), [moment]);
  const line = Math.min(attempt.line ?? (frames.length > 1 ? 1 : 0), Math.max(0, frames.length - 1));
  const best = moment ? stripSan(moment.best_move) : '';
  const played = moment ? stripSan(moment.played) : '';
  const side = moment?.fen_before.split(' ')[1] === 'b' ? 'Black' : 'White';
  const conceptId = moment?.concept?.id ?? moment?.concept_id ?? null;
  const gremlinName = moment?.concept?.gremlin ?? (conceptId ? GREMLINS[conceptId]?.name : null);
  const habit = moment?.concept?.habit || (revealed ? report.summary?.focus_habit : null) || null;
  const atEnd = complete && (moments.length === 0 || safe === moments.length - 1);
  const moveLabel = moment ? `${moment.move_number}${side === 'Black' ? '…' : '.'}${played}` : '';

  const squareColors = useMemo(() => {
    if (!revealed || !moment) return {};
    return assignSquareColors([moment.probable_thought, moment.what_actually_happens, moment.why_better ?? '']);
  }, [revealed, moment]);

  useEffect(() => { setTyped(''); setNote(''); setFocusSquare(null); }, [moment?.ply]);
  useEffect(() => {
    const want = land.current;
    if (!want) return;
    land.current = null;
    if (want === 'input') moveRef.current?.focus();
    else (outcomeRef.current ?? ideaRef.current ?? promptRef.current)?.focus();
  });

  useEffect(() => {
    if (!moment || !revealed || !habit) return;
    if (checksSent.current.has(moment.ply)) return;
    checksSent.current.add(moment.ply);
    captureEvent('check_revealed', {
      report_id: report.id,
      ply: moment.ply,
      concept_id: conceptId,
      is_demo: mode === 'demo',
    });
  }, [moment, revealed, habit, conceptId, report.id, mode]);

  useEffect(() => {
    if (!focusStepper.current) return;
    focusStepper.current = false;
    const buttons = stepperRef.current?.querySelectorAll<HTMLButtonElement>('button:not(:disabled)');
    buttons?.[buttons.length - 1]?.focus();
  });

  function trackTry(kind: Kind, method: 'drag' | 'tap' | 'type' | 'show_me') {
    if (!moment) return;
    captureEvent('try_move', {
      report_id: report.id,
      ply: moment.ply,
      concept_id: conceptId,
      outcome: kind,
      method,
      is_demo: mode === 'demo',
    });
  }

  function commit(san: string, fen: string, from: string | undefined, to: string | undefined, method: 'drag' | 'tap' | 'type') {
    if (!moment) return;
    const kind = classify(san, moment);
    let next: Attempt = { kind, fen, san, from, to, line: kind === 'played' && frames.length > 1 ? 1 : 0 };
    // A missed chance lost nothing: show the win, the same way Show me does.
    if (kind === 'other' || (kind === 'played' && conceptId === 'missed_chance')) {
      try {
        const game = new Chess(moment.fen_before);
        const move = game.move(best);
        if (move) next = { kind, fen: game.fen(), san, from: move.from, to: move.to };
      } catch { /* Keep the move they played; the sentence names the one we checked. */ }
    }
    setTries(prev => ({ ...prev, [moment.ply]: next }));
    setNote('');
    setTyped('');
    land.current = 'result';
    trackTry(kind, method);
  }

  function showMe() {
    if (!moment) return;
    try {
      const game = new Chess(moment.fen_before);
      const move = game.move(best);
      setTries(prev => ({
        ...prev,
        [moment.ply]: move
          ? { kind: 'shown', fen: game.fen(), san: move.san, from: move.from, to: move.to }
          : { kind: 'shown', fen: moment.fen_before, san: best },
      }));
    } catch {
      setTries(prev => ({ ...prev, [moment.ply]: { kind: 'shown', fen: moment.fen_before, san: best } }));
    }
    setNote('');
    land.current = 'result';
    trackTry('shown', 'show_me');
  }

  function onDrop(from: string, to: string, method: 'drag' | 'tap' = 'drag'): boolean {
    if (!moment) return false;
    try {
      const game = new Chess(moment.fen_before);
      // ponytail: queen promotion only; type the SAN for an underpromotion
      const move = game.move({ from, to, promotion: 'q' });
      if (!move) return false;
      commit(move.san, game.fen(), move.from, move.to, method);
      return true;
    } catch {
      return false;
    }
  }

  function onType(event: FormEvent) {
    event.preventDefault();
    if (!moment) return;
    const san = typed.trim();
    if (!san) return;
    try {
      const game = new Chess(moment.fen_before);
      const move = game.move(san);
      if (!move) throw new Error('illegal');
      commit(move.san, game.fen(), move.from, move.to, 'type');
    } catch {
      setNote('That move isn’t legal from here. Try another, or press Show me.');
      moveRef.current?.focus();
    }
  }

  function resetTry() {
    if (!moment) return;
    setTries(prev => ({ ...prev, [moment.ply]: { kind: 'prompt' } }));
    setNote('');
    setTyped('');
    land.current = 'input';
  }

  async function share() {
    const url = window.location.origin + (mode === 'demo' ? '/report/demo' : '/r/' + report.share_id);
    setShareNote('');
    setShareUrl('');
    try {
      await navigator.clipboard.writeText(url);
      setShareNote('Link copied.');
      captureEvent('report_shared', { report_id: report.id, is_demo: mode === 'demo', method: 'clipboard' });
    } catch {
      setShareUrl(url);
      setShareNote('Copy this link.');
    }
  }

  function go(next: number) {
    setIndex(next);
    onMoment?.(next);
    const ply = moments[next]?.ply;
    if (ply == null) return;
    const url = new URL(window.location.href);
    url.searchParams.set('focus', String(ply));
    window.history.replaceState(null, '', `${url.pathname}${url.search}`);
    land.current = 'result';
  }

  const showPlayedLine = attempt.kind === 'played' && conceptId !== 'missed_chance';
  const boardFen = !moment ? ''
    : showPlayedLine ? (frames[line]?.fen ?? moment.fen_after)
    : attempt.kind === 'prompt' ? moment.fen_before
    : (attempt.fen ?? moment.fen_before);

  const arrow = !moment || attempt.kind === 'prompt' ? []
    : showPlayedLine && frames[line]
      ? [{ startSquare: frames[line].from, endSquare: frames[line].to, color: RED }]
      : attempt.from && attempt.to
        ? [{ startSquare: attempt.from, endSquare: attempt.to, color: BLUE }]
        : [];

  const outcome = attempt.kind === 'checked' ? 'That’s the move we checked.'
    : attempt.kind === 'played' && conceptId === 'missed_chance' ? `That’s what ${mode === 'owner' ? 'you' : side} played. The win was ${best}.`
    : attempt.kind === 'played' ? `The line after ${played}.`
    : attempt.kind === 'other' ? `Different from the line we checked. We only verified ${best}.`
    : attempt.kind === 'shown' ? `The move we checked is ${best}.`
    : '';

  const players = [report.player_name, report.opponent_name].filter(Boolean).join(' vs ');
  const when = reportWhen(report, mode);
  const result = resultLabel(report.result);
  const headline = report.summary?.headline || (complete ? 'This game.' : 'Reading this game.');
  const noteId = moment ? `try-note-${moment.ply}` : 'try-note';
  const boardMove = attempt.kind === 'prompt' ? `${side} to move` : showPlayedLine ? (frames[line]?.san ?? played) : best;
  const focusedMoment = focusPly == null ? undefined : moments.find(item => item.ply === focusPly);
  const focusedConceptId = focusedMoment?.concept?.id ?? focusedMoment?.concept_id ?? null;
  const focusedGremlin = focusedMoment?.concept?.gremlin ?? (focusedConceptId ? GREMLINS[focusedConceptId]?.name : null);
  const scanExample = report.hero_variant === 'scan' && focusPly != null && mode === 'owner' && Boolean(focusedMoment);
  const hideList = scanExample && !othersOpen;
  const focusedRevealed = focusedMoment ? (tries[focusedMoment.ply]?.kind ?? 'prompt') !== 'prompt' : false;
  const title = scanExample && focusedGremlin ? `Where ${focusedGremlin} showed up.` : headline;

  return (
    <article className="page report">
      <header className="report-head">
        <div className="report-head-copy">
          <div className="report-kicker">
            <p className="report-meta">
              {mode === 'demo' && <span className="tag">Sample</span>}
              {players && <span translate="no">{players}</span>}
              {result && <span>{result}</span>}
              {when && <span>{when}</span>}
            </p>
            {conceptId && gremlinName && (
              <p className="report-badge" data-concept={conceptId}>
                <Gremlin concept={conceptId} size={48} priority />
                <span>{gremlinName}</span>
              </p>
            )}
          </div>
          <h1 className="h2 report-title">{title}</h1>
        </div>
        {report.share_id && (
          <div className="report-share">
            <button type="button" className="btn btn--key btn--sm" onClick={share}>Copy link</button>
            <p role="status" className={shareNote ? undefined : 'sr-only'}>{shareNote}</p>
            {shareUrl && <input className="input" aria-label="Share link" readOnly value={shareUrl} onFocus={event => event.target.select()} />}
          </div>
        )}
      </header>

      {progressNote && <p className="report-status" role="status">{progressNote}</p>}
      {moments.length > 1 && !hideList && <p className="report-count" aria-live="polite">Moment {safe + 1} of {moments.length}</p>}

      {moment ? (
        <div className="report-grid">
          <div className="report-board-col">
            <p className="report-board-label" translate="no">{boardMove}</p>
            <ChessboardView
              fen={boardFen}
              orientation={moment.player_color || report.player_color || 'white'}
              boardWidth={560}
              arrows={arrow}
              markedSquares={squareColors}
              focusSquare={focusSquare}
              onPieceDrop={attempt.kind === 'prompt' ? onDrop : undefined}
            />
            {showPlayedLine && frames.length > 0 && (
              <ol className="report-line" translate="no" aria-label={`The line after ${played}`}>
                {frames.map((frame, frameIndex) => (
                  <li key={`${frame.san}-${frameIndex}`}>
                    <button type="button" className="move" aria-pressed={frameIndex === line} onClick={() => setTries(prev => ({ ...prev, [moment.ply]: { ...attempt, line: frameIndex } }))}>
                      {frame.san}
                    </button>
                  </li>
                ))}
              </ol>
            )}
          </div>

          <div className="report-copy">
            <p ref={outcome ? outcomeRef : undefined} tabIndex={outcome ? -1 : undefined} className={outcome ? 'report-outcome' : 'sr-only'} role="status" data-outcome={outcome ? attempt.kind : undefined}>{outcome}</p>
            {attempt.kind === 'prompt' ? (
              <>
                <h2 ref={promptRef} tabIndex={-1} className="h3">Your move.</h2>
                <p className="lede report-context">
                  In the game, {mode === 'owner' ? 'you' : side} played <span className="move" translate="no">{moveLabel}</span> here.
                  {conceptId === 'missed_chance' ? (
                    <>{mode === 'owner' ? 'You' : side} had a win. Find it: tap a piece, or type the move.</>
                  ) : (
                    <>
                      {gremlinName ? <> That let <strong translate="no">{gremlinName}</strong> in.</> : null}
                      {' '}Find a better move: tap a piece, or type the move.
                    </>
                  )}
                </p>
                <form className="report-try-form" onSubmit={onType}>
                  <label className="report-try-label" htmlFor={noteId + '-input'}>
                    Type a move
                    <input
                      ref={moveRef}
                      id={noteId + '-input'}
                      name="move"
                      className="input"
                      value={typed}
                      onChange={event => { setTyped(event.target.value); setNote(''); }}
                      placeholder="e.g. Nf3"
                      autoComplete="off"
                      inputMode="text"
                      autoCapitalize="off"
                      spellCheck={false}
                      aria-invalid={note ? true : undefined}
                      aria-describedby={note ? noteId : undefined}
                    />
                  </label>
                  <button type="submit" className="btn">Play</button>
                  <button type="button" className="btn btn--quiet" onClick={showMe}>Show me</button>
                </form>
                {note && <p id={noteId} className="field-note" data-tone="error" role="alert">{note}</p>}
              </>
            ) : (
              <>
                <div className="report-explain">
                  <h2 ref={ideaRef} tabIndex={-1} className="h3">The idea</h2>
                  <div className="report-prose"><SquareText text={moment.probable_thought} colors={squareColors} onFocusSquare={setFocusSquare} /></div>
                  <h3 className="h3">What happens</h3>
                  <div className="report-prose"><SquareText text={moment.what_actually_happens} colors={squareColors} onFocusSquare={setFocusSquare} /></div>
                  {moment.why_better && (
                    <>
                      <h3 className="h3">Why it works</h3>
                      <div className="report-prose"><SquareText text={moment.why_better} colors={squareColors} onFocusSquare={setFocusSquare} /></div>
                    </>
                  )}
                </div>
                <button type="button" className="btn btn--quiet" onClick={resetTry}>Try again</button>
              </>
            )}
          </div>
        </div>
      ) : complete ? (
        <div>
          <h2 className="h2">Nothing decisive in this game.</h2>
          <p className="lede">No move changed the result enough to single out.</p>
        </div>
      ) : null}

      {revealed && habit && (
        <section className="report-check" data-concept={conceptId ?? undefined} aria-label="Your check for the next game">
          <h2 className="h3">Your check for the next game.</h2>
          <p className="big">{habit}</p>
        </section>
      )}

      {hideList && focusedRevealed && moments.length > 1 && (
        <button type="button" className="btn btn--quiet report-more" onClick={() => { focusStepper.current = true; setOthersOpen(true); }}>
          See the other turning points in this game ({moments.length - 1})
        </button>
      )}

      {moments.length > 1 && !hideList && (
        <div className="report-stepper" ref={stepperRef}>
          <button type="button" className="btn btn--key" onClick={() => go(Math.max(0, safe - 1))} disabled={safe === 0}>Previous</button>
          {safe < moments.length - 1 && (
            <button type="button" className="btn" onClick={() => go(safe + 1)}>Next moment <span className="arrow" aria-hidden="true">→</span></button>
          )}
        </div>
      )}

      {/* The example's next step must not wait behind the other moments. */}
      {(atEnd || (hideList && focusedRevealed)) && mode === 'owner' && children}
      {atEnd && mode !== 'owner' && (
        <section className="report-end">
          <h2 className="h2">Find your own gremlin.</h2>
          <Link className="btn" href="/#scan">Find your own gremlin</Link>
        </section>
      )}
    </article>
  );
}
