'use client';

import { useEffect, useMemo, useRef, useState, type FormEvent, type ReactNode } from 'react';
import Link from 'next/link';
import { Chess } from 'chess.js';
import type { Me, MomentReport, ReportDetail } from '../lib/api';
import { GREMLINS } from '../lib/gremlins';
import { assignSquareColors, MARK } from '../lib/squares';
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
  /** Their move is on the board; the checked move has not replaced it. */
  hold?: boolean;
  /** Cut back to the original position before the checked move animates. */
  snapping?: boolean;
}

interface Frame { fen: string; san: string; from: string; to: string; }

const REVEAL_PAUSE_MS = 700;
const REVEAL_CUT_MS = 70;

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

function formatTimeControl(raw: string | null): string | null {
  if (!raw || raw === '-' || raw === '?') return null;
  if (/^1\/\d+$/.test(raw)) return 'Daily';
  const plus = raw.match(/^(\d+)\+(\d+)$/);
  if (plus) {
    const base = Number(plus[1]);
    const mins = base >= 60 && base % 60 === 0 ? String(base / 60) : `${base}s`;
    return `${mins}+${plus[2]}`;
  }
  if (/^\d+$/.test(raw)) {
    const seconds = Number(raw);
    if (seconds >= 60 && seconds % 60 === 0) return `${seconds / 60} min`;
    if (seconds > 60) return `${Math.floor(seconds / 60)}m ${seconds % 60}s`;
    return `${seconds}s`;
  }
  return raw;
}

/** Last few moves before this position, from the report PGN. */
function leadIn(pgn: string | undefined, fenBefore: string, count = 4): string | null {
  if (!pgn) return null;
  try {
    const game = new Chess();
    game.loadPgn(pgn);
    const history = game.history({ verbose: true });
    const key = fenBefore.split(' ').slice(0, 4).join(' ');
    const index = history.findIndex(move => move.before.split(' ').slice(0, 4).join(' ') === key);
    if (index <= 0) return null;
    const parts: string[] = [];
    for (let i = Math.max(0, index - count); i < index; i++) {
      const n = Math.floor(i / 2) + 1;
      parts.push(i % 2 === 0 ? `${n}. ${history[i].san}` : `${n}…${history[i].san}`);
    }
    return parts.join(' ');
  } catch {
    return null;
  }
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
  const revealTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const momentsRef = useRef(moments);
  momentsRef.current = moments;

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
  const showWhy = revealed && !attempt.hold && !attempt.snapping;
  const frames = useMemo(() => (moment ? lineFrames(moment) : []), [moment]);
  const line = Math.min(attempt.line ?? 0, Math.max(0, frames.length - 1));
  const best = moment ? stripSan(moment.best_move) : '';
  const played = moment ? stripSan(moment.played) : '';
  const side = moment?.fen_before.split(' ')[1] === 'b' ? 'Black' : 'White';
  const conceptId = moment?.concept?.id ?? moment?.concept_id ?? null;
  const gremlinName = moment?.concept?.gremlin ?? (conceptId ? GREMLINS[conceptId]?.name : null);
  const habit = moment?.concept?.habit || (revealed ? report.summary?.focus_habit : null) || null;
  const atEnd = complete && (moments.length === 0 || safe === moments.length - 1);
  const moveLabel = moment ? `${moment.move_number}${side === 'Black' ? '…' : '.'}${played}` : '';

  const squareColors = useMemo(() => {
    if (!showWhy || !moment) return {};
    return assignSquareColors([moment.probable_thought, moment.what_actually_happens, moment.why_better ?? '']);
  }, [showWhy, moment]);

  useEffect(() => { setTyped(''); setNote(''); setFocusSquare(null); }, [moment?.ply]);
  useEffect(() => {
    const want = land.current;
    if (!want) return;
    land.current = null;
    if (want === 'input') moveRef.current?.focus({ preventScroll: true });
    else (outcomeRef.current ?? ideaRef.current ?? promptRef.current)?.focus({ preventScroll: true });
  });

  useEffect(() => {
    if (!moment || !showWhy || !habit) return;
    if (checksSent.current.has(moment.ply)) return;
    checksSent.current.add(moment.ply);
    captureEvent('check_revealed', {
      report_id: report.id,
      ply: moment.ply,
      concept_id: conceptId,
      is_demo: mode === 'demo',
    });
  }, [moment, showWhy, habit, conceptId, report.id, mode]);

  useEffect(() => {
    if (!focusStepper.current) return;
    focusStepper.current = false;
    const buttons = stepperRef.current?.querySelectorAll<HTMLButtonElement>('button:not(:disabled)');
    buttons?.[buttons.length - 1]?.focus();
  });

  function clearReveal() {
    if (revealTimer.current) clearTimeout(revealTimer.current);
    revealTimer.current = null;
  }

  useEffect(() => () => clearReveal(), [moment?.ply]);

  function playChecked(ply: number) {
    clearReveal();
    const current = momentsRef.current.find(item => item.ply === ply);
    if (!current) return;
    const bestSan = stripSan(current.best_move);
    setTries(prev => {
      const attempt = prev[ply];
      if (!attempt?.hold) return prev;
      return { ...prev, [ply]: { ...attempt, fen: current.fen_before, from: undefined, to: undefined, snapping: true } };
    });
    revealTimer.current = setTimeout(() => {
      let fen = current.fen_before;
      let from: string | undefined;
      let to: string | undefined;
      try {
        const game = new Chess(current.fen_before);
        const move = game.move(bestSan);
        if (move) { fen = game.fen(); from = move.from; to = move.to; }
      } catch { /* The sentence still names the move we checked. */ }
      setTries(prev => {
        const attempt = prev[ply];
        if (!attempt?.snapping && !attempt?.hold) return prev;
        return { ...prev, [ply]: { ...attempt, fen, from, to, hold: false, snapping: false } };
      });
    }, REVEAL_CUT_MS);
  }

  function armReveal(ply: number) {
    clearReveal();
    revealTimer.current = setTimeout(() => playChecked(ply), REVEAL_PAUSE_MS);
  }

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
    // Their move stays where it landed. If it isn't the one we checked, show that
    // one afterwards, played from the original position — never by swapping now.
    const hold = kind === 'other' || (kind === 'played' && conceptId === 'missed_chance');
    const next: Attempt = { kind, fen, san, from, to, line: 0, hold };
    setTries(prev => ({ ...prev, [moment.ply]: next }));
    setNote('');
    setTyped('');
    land.current = 'result';
    trackTry(kind, method);
    if (hold) armReveal(moment.ply);
    else clearReveal();
  }

  function showMe() {
    if (!moment) return;
    clearReveal();
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
    clearReveal();
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
    clearReveal();
    setIndex(next);
    onMoment?.(next);
    const ply = moments[next]?.ply;
    if (ply == null) return;
    const url = new URL(window.location.href);
    url.searchParams.set('focus', String(ply));
    window.history.replaceState(null, '', `${url.pathname}${url.search}`);
    land.current = 'result';
  }

  const showPlayedLine = attempt.kind === 'played' && conceptId !== 'missed_chance' && !attempt.hold && !attempt.snapping;
  const boardFen = !moment ? ''
    : showPlayedLine ? (frames[line]?.fen ?? moment.fen_after)
    : attempt.kind === 'prompt' ? moment.fen_before
    : (attempt.fen ?? moment.fen_before);

  const arrow = !moment || attempt.kind === 'prompt' || attempt.snapping ? []
    : showPlayedLine && frames[line]
      ? [{ startSquare: frames[line].from, endSquare: frames[line].to, color: MARK.played }]
      : attempt.from && attempt.to
        ? [{ startSquare: attempt.from, endSquare: attempt.to, color: attempt.hold ? MARK.played : MARK.checked }]
        : [];

  const outcome = attempt.hold ? `${attempt.san} is on the board. The move we checked is ${best}.`
    : attempt.kind === 'checked' ? 'That’s the move we checked.'
    : attempt.kind === 'played' && conceptId === 'missed_chance' ? `That’s what ${mode === 'owner' ? 'you' : side} played. The win was ${best}.`
    : attempt.kind === 'played' ? `The line after ${played}.`
    : attempt.kind === 'other' ? `Different from the line we checked. We only verified ${best}.`
    : attempt.kind === 'shown' ? `The move we checked is ${best}.`
    : '';

  const pgn = report.source_games?.pgn;
  const whiteName = pgnHeader(pgn, 'White') || (report.player_color === 'black' ? report.opponent_name : report.player_name);
  const blackName = pgnHeader(pgn, 'Black') || (report.player_color === 'black' ? report.player_name : report.opponent_name);
  const whiteElo = pgnHeader(pgn, 'WhiteElo');
  const blackElo = pgnHeader(pgn, 'BlackElo');
  const timeClass = pgnHeader(pgn, 'TimeClass');
  const clock = formatTimeControl(report.time_control || pgnHeader(pgn, 'TimeControl'));
  const timeLabel = [timeClass ? timeClass.charAt(0).toUpperCase() + timeClass.slice(1) : null, clock].filter(Boolean).join(' · ') || null;
  const { gameUrl } = chesscomIdentity(report, null);
  const when = reportWhen(report, mode);
  const result = resultLabel(report.result);
  const arose = moment ? leadIn(pgn, moment.fen_before) : null;
  const headline = report.summary?.headline || (complete ? 'This game.' : 'Reading this game.');
  const noteId = moment ? `try-note-${moment.ply}` : 'try-note';
  const boardMove = attempt.hold ? (attempt.san ?? '')
    : attempt.kind === 'prompt' ? ''
    : showPlayedLine ? (frames[line]?.san ?? played)
    : best;
  const focusedMoment = focusPly == null ? undefined : moments.find(item => item.ply === focusPly);
  const focusedConceptId = focusedMoment?.concept?.id ?? focusedMoment?.concept_id ?? null;
  const focusedGremlin = focusedMoment?.concept?.gremlin ?? (focusedConceptId ? GREMLINS[focusedConceptId]?.name : null);
  const scanExample = report.hero_variant === 'scan' && focusPly != null && mode === 'owner' && Boolean(focusedMoment);
  const hideList = scanExample && !othersOpen;
  const focusedAttempt = focusedMoment ? tries[focusedMoment.ply] : undefined;
  const focusedRevealed = Boolean(focusedAttempt && focusedAttempt.kind !== 'prompt' && !focusedAttempt.hold && !focusedAttempt.snapping);
  const title = scanExample && focusedGremlin ? `Where ${focusedGremlin} showed up.` : headline;
  const guide = !moment ? 1 : showWhy ? 2 : 1;
  const guideState = (n: number) => n === guide ? 'current' : n < guide ? 'done' : n === 3 && guide === 2 && habit ? 'next' : 'upcoming';

  return (
    <article className="page report">
      <header className="report-head">
        <div className="report-head-copy">
          <h1 className="h2 report-title">{title}</h1>
          <div className="report-ident">
            <p className="report-meta">
              {mode === 'demo' && <span className="tag">Sample</span>}
              <span className="report-side" data-side="white" translate="no">{['White', whiteName, whiteElo ? `(${whiteElo})` : null].filter(Boolean).join(' ')}</span>
              <span className="report-side" data-side="black" translate="no">{['Black', blackName, blackElo ? `(${blackElo})` : null].filter(Boolean).join(' ')}</span>
              {result && <span>{result}{report.result ? ` ${report.result}` : ''}</span>}
              {timeLabel && <span>{timeLabel}</span>}
              {when && <span>{when}</span>}
              {gameUrl && <a href={gameUrl} target="_blank" rel="noreferrer">Chess.com</a>}
            </p>
            {conceptId && gremlinName && (
              <p className="report-badge" data-concept={conceptId}>
                <Gremlin concept={conceptId} size={28} priority />
                <span>{gremlinName}</span>
              </p>
            )}
          </div>
        </div>
        {report.share_id && (
          <div className="report-share">
            <button type="button" className="btn btn--key btn--sm" onClick={share}>Copy link</button>
            <p role="status" className={shareNote ? undefined : 'sr-only'}>{shareNote}</p>
            {shareUrl && <input className="input" aria-label="Share link" readOnly value={shareUrl} onFocus={event => event.target.select()} />}
          </div>
        )}
      </header>

      {moment && (
        <div className="report-guide-row">
          <ol className="report-guide" aria-label="How this review works">
            {([[1, 'Find the move'], [2, 'See why'], [3, 'Your check']] as const).map(([n, label]) => (
              <li key={n} data-state={guideState(n)} aria-current={n === guide ? 'step' : undefined}>{n} {label}</li>
            ))}
          </ol>
          {moments.length > 1 && !hideList && <p className="report-count" aria-live="polite">Moment {safe + 1} of {moments.length}</p>}
        </div>
      )}

      {progressNote && <p className="report-status" role="status">{progressNote}</p>}

      {moment ? (
        <div className="report-grid">
          <div className="report-board-col">
            <p className="report-where" translate="no">
              <span>Move {moment.move_number}</span>
              <span>{side} to move</span>
              {boardMove && <span className="move">{boardMove}</span>}
              {arose && <span>After {arose}</span>}
            </p>
            <ChessboardView
              fen={boardFen}
              orientation={moment.player_color || report.player_color || 'white'}
              boardWidth={560}
              arrows={arrow}
              markedSquares={squareColors}
              focusSquare={focusSquare}
              animationMs={attempt.snapping ? 0 : undefined}
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
                  {conceptId === 'missed_chance' ? (
                    <>{mode === 'owner' ? 'You' : side} had a win here.</>
                  ) : (
                    <>In the game, {mode === 'owner' ? 'you' : side} played <span className="move" translate="no">{moveLabel}</span>.</>
                  )}
                  {' '}Drag a piece, or tap it and then the square.
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
            ) : attempt.hold ? (
              <>
                <h2 ref={ideaRef} tabIndex={-1} className="h3">Your move landed.</h2>
                <p className="lede">It stays where you put it. The move we checked was <span className="move" translate="no">{best}</span>, from the same position.</p>
                <button type="button" className="btn" onClick={() => moment && playChecked(moment.ply)}>See the move we checked</button>
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

      {showWhy && habit && (
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
