'use client';

import { useState, useMemo, useEffect, useRef, type ReactNode } from 'react';
import Link from 'next/link';
import { ArrowRight, ArrowLeft, RotateCcw, BookOpen } from 'lucide-react';
import { Chess } from 'chess.js';
import type { ReportDetail, MomentReport } from '../lib/api';
import { ChessboardView } from './ChessboardView';
import { MomentCard, MomentSkeleton, stageTexts } from './MomentCard';
import { assignSquareColors } from '../lib/squares';

type LessonStage = 'before' | 'played' | 'alternative' | 'takeaway';

interface SharedReportInteractiveViewProps {
  report: ReportDetail;
  shareId?: string;
  isOwner?: boolean;
  actions?: ReactNode;
  children?: ReactNode;
  onSelectMoment?: (index: number) => void;
}

function positionSteps(moment: MomentReport) {
  const steps = [{ fen: moment.fen_before, label: 'Before your move' }];
  try {
    const game = new Chess(moment.fen_before);
    const played = game.move(moment.played.replace(/^\d+\.+\s*/, ''));
    if (!played) return steps;
    steps.push({ fen: game.fen(), label: `You played ${played.san}` });
    const moves = moment.refutation_line.replace(/\d+\.(?:\.\.)?/g, ' ').trim().split(/\s+/);
    for (const san of moves) {
      if (!san || ['1-0', '0-1', '1/2-1/2', '*'].includes(san)) continue;
      const move = game.move(san);
      if (!move) break;
      steps.push({ fen: game.fen(), label: `${(move.color === 'w' ? 'white' : 'black') === moment.player_color ? 'Your continuation' : 'Opponent’s reply'}: ${move.san}` });
    }
  } catch {
    // Only show positions successfully replayed from the actual board.
  }
  return steps;
}

export function SharedReportInteractiveView({ report, shareId, isOwner = false, actions, children, onSelectMoment }: SharedReportInteractiveViewProps) {
  const moments = report.moments || [];
  const [activeIndex, setActiveIndex] = useState(0);
  const [orientation, setOrientation] = useState<'white' | 'black'>(report.player_color || 'white');
  const [step, setStep] = useState(0);
  const [showAlternative, setShowAlternative] = useState(false);
  const [hasInteracted, setHasInteracted] = useState(false);
  const [focusSquare, setFocusSquare] = useState<string | null>(null);
  const stageHeadingRef = useRef<HTMLHeadingElement>(null);
  useEffect(() => { if (report.player_color) setOrientation(report.player_color); }, [report.player_color]);
  const current = moments[activeIndex] || moments[0];
  const steps = useMemo(() => current ? positionSteps(current) : [], [current]);
  const alternative = useMemo(() => {
    if (!current?.best_move) return null;
    try { const board = new Chess(current.fen_before); const move = board.move(current.best_move.replace(/^\d+\.+\s*/, '')); return move ? { fen: board.fen(), label: 'Alternative: ' + move.san } : null; } catch { return null; }
  }, [current]);
  const activeStep = showAlternative && alternative ? alternative : steps[Math.min(step, steps.length - 1)];
  const isDemo = report.id === 'demo' || shareId === 'demo-sample';
  const complete = report.status === 'completed';
  const lessonStage: LessonStage = showAlternative ? 'alternative' : step === 0 ? 'before' : step === 1 ? 'played' : step === steps.length - 1 ? 'takeaway' : 'played';
  const nextLabel = step === 0 ? 'Show what changed' : step >= steps.length - 1 ? 'Line complete' : 'Continue';
  useEffect(() => {
    if (hasInteracted) stageHeadingRef.current?.focus();
  }, [hasInteracted, activeIndex, step, showAlternative]);
  useEffect(() => setFocusSquare(null), [activeIndex, step, showAlternative]);
  // Board outlines only for squares the visible text names; the colour map
  // also covers the full explanation so a square keeps one colour everywhere.
  const visibleTexts = useMemo(() => current ? stageTexts(current, lessonStage) : [], [current, lessonStage]);
  const squareColors = useMemo(() => current ? assignSquareColors([...visibleTexts, current.probable_thought, current.what_actually_happens, current.why_better ?? '', current.takeaway]) : {}, [current, visibleTexts]);
  const markedSquares = useMemo(() => {
    const visible = assignSquareColors(visibleTexts);
    return Object.fromEntries(Object.keys(visible).map(sq => [sq, squareColors[sq]]));
  }, [visibleTexts, squareColors]);
  const selectMoment = (index: number) => {
    setActiveIndex(index);
    setStep(0);
    setShowAlternative(false);
    setHasInteracted(true);
    onSelectMoment?.(index);
  };

  const playedMove = useMemo(() => {
    if (!current) return null;
    try { return new Chess(current.fen_before).move(current.played.replace(/^\d+\.+\s*/, '')); } catch { return null; }
  }, [current]);

  const nextMove = useMemo(() => {
    if (!playedMove || !current) return null;
    try {
      const board = new Chess(current.fen_before);
      board.move(current.played.replace(/^\d+\.+\s*/, ''));
      const san = current.refutation_line.replace(/^\d+\.+\s*/, '').trim().split(/\s+/)[0];
      return san ? board.move(san) : null;
    } catch { return null; }
  }, [current, playedMove]);

  const selectStage = (nextStep: number, alternative = false) => {
    setHasInteracted(true);
    setShowAlternative(alternative);
    setStep(nextStep);
  };

  const playedArrow = useMemo(() => {
    if (!playedMove || showAlternative || step > 1) return [];
    return [{ startSquare: playedMove.from, endSquare: playedMove.to, color: 'var(--w-error)' }];
  }, [playedMove, step, showAlternative]);

  const alternativeArrow = useMemo(() => {
    if (!alternative || !showAlternative) return [];
    try {
      const board = new Chess(current.fen_before);
      const move = board.move(current.best_move.replace(/^\d+\.+\s*/, ''));
      return move ? [{ startSquare: move.from, endSquare: move.to, color: 'var(--w-success)' }] : [];
    } catch { return []; }
  }, [alternative, showAlternative, current]);

  const highlightedSquares = useMemo(() => {
    if (step === 0 && playedMove) return [playedMove.from, playedMove.to];
    if (showAlternative && alternative) {
      try {
        const move = new Chess(current.fen_before).move(current.best_move.replace(/^\d+\.+\s*/, ''));
        return move ? [move.from, move.to] : [];
      } catch { return []; }
    }
    if (step >= 1 && nextMove) return [nextMove.from, nextMove.to];
    return [];
  }, [step, showAlternative, playedMove, nextMove, alternative, current]);

  const activeArrows = showAlternative ? alternativeArrow : playedArrow;
  const result = report.result === '1-0' ? 'White won' : report.result === '0-1' ? 'Black won' : report.result === '1/2-1/2' ? 'Draw' : null;

  return (
    <div className="report-shell mx-auto max-w-6xl px-5 py-7 sm:px-8 sm:py-10">
      {(isDemo || !isOwner) && (
        <div className="report-notice mb-5 flex flex-col justify-between gap-3 border-b border-[var(--w-border)] pb-4 sm:flex-row sm:items-center">
          <div>
            <p className="text-sm font-semibold">{isDemo ? 'Illustrative review' : 'Shared game review'}</p>
            <p className="mt-1 max-w-lg text-sm text-[var(--w-ink2)]">{isDemo ? 'Explore one turning point and the lesson it reveals.' : 'Explore the key moments, then review a game of your own.'}</p>
          </div>
          <Link href="/#analyze" className="primary-button min-h-11 shrink-0">Review your game <ArrowRight aria-hidden="true" className="h-4 w-4" /></Link>
        </div>
      )}

      <header className="mb-9">
        <div className="mb-5 flex flex-wrap items-center justify-between gap-4 text-sm text-[var(--w-ink2)]">
          <p>{report.player_name || 'Your game'}{report.opponent_name ? ` vs ${report.opponent_name}` : ''}{result ? ` · ${result}` : ''}{report.move_count ? ` · ${report.move_count} moves` : ''}{report.time_control ? ` · ${report.time_control}` : ''}</p>
          {actions}
        </div>
        <h1 className="t-heading max-w-4xl text-4xl leading-[1.1] sm:text-5xl lg:text-[3.5rem]">{report.summary?.headline || (complete ? 'Your game, a little clearer.' : 'Finding the moments that matter.')}</h1>
        {report.summary?.story && <p className="mt-5 max-w-3xl text-base leading-relaxed text-[var(--w-ink2)] sm:text-lg">{report.summary.story}</p>}
      </header>

      {moments.length > 0 ? (
        <section aria-label="Explore the key moments" className="report-analysis border-t border-[var(--w-border)] pt-6">
          <div className="mb-7 flex flex-wrap items-center justify-between gap-4">
            <p className="text-sm text-[var(--w-ink2)]">{moments.length === 1 ? 'One moment to learn from' : `${moments.length} moments to learn from`}</p>
            <div className="flex flex-wrap gap-2" aria-label="Choose a moment">
              {moments.map((moment, index) => (
                <button key={moment.ply} aria-pressed={index === activeIndex} onClick={() => selectMoment(index)} className={`focus-ring min-h-11 rounded-lg border px-4 text-sm font-medium transition-all active:scale-[0.98] ${index === activeIndex ? 'border-[var(--w-ink1)] bg-[var(--w-ink1)] text-[var(--w-canvas)]' : 'border-[var(--w-border)] hover:bg-[var(--w-surface-subtle)]'}`}>Move {moment.move_number}{moment.player_color === 'black' ? '…' : '.'} {moment.played.replace(/^\d+\.+\s*/, '')}</button>
              ))}
            </div>
          </div>
          <div className="grid min-w-0 grid-cols-1 items-start gap-8 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)] lg:gap-14">
            <div id="board-view" className="min-w-0 lg:sticky lg:top-8 scroll-mt-6">
              <div className="mb-3 flex items-center justify-between gap-3">
                <p aria-live="polite" className="text-sm font-medium">{activeStep?.label}</p>
                <button onClick={() => setOrientation(prev => prev === 'white' ? 'black' : 'white')} className="focus-ring inline-flex min-h-11 items-center gap-2 rounded-lg px-3 text-sm text-[var(--w-ink2)] hover:bg-[var(--w-surface-subtle)] active:scale-[0.98] transition-transform" aria-label={`Flip board; currently ${orientation} at bottom`}><RotateCcw aria-hidden="true" className="h-4 w-4" />Flip board</button>
              </div>
              {activeStep && <ChessboardView fen={activeStep.fen} orientation={orientation} boardWidth={520} arrows={activeArrows} highlightSquares={highlightedSquares} markedSquares={markedSquares} focusSquare={focusSquare} />}
              <div className="mt-3 grid grid-cols-[1fr_auto_1fr] items-center gap-2 rounded-lg" aria-label="Step through the played line" role="group" tabIndex={0} onKeyDown={event => {
                if (event.altKey || event.ctrlKey || event.metaKey) return;
                if (event.key === 'ArrowRight') { event.preventDefault(); selectStage(Math.min(steps.length - 1, step + 1)); }
                if (event.key === 'ArrowLeft') { event.preventDefault(); selectStage(Math.max(0, step - 1)); }
              }}>
                <button disabled={step === 0 && !showAlternative} onClick={() => selectStage(Math.max(0, step - 1))} className="focus-ring inline-flex min-h-11 min-w-0 items-center justify-center gap-1 rounded-lg border border-[var(--w-border)] bg-[var(--w-surface)] px-2 text-sm text-[var(--w-ink1)] hover:bg-[var(--w-surface-subtle)] disabled:cursor-not-allowed disabled:opacity-40 sm:gap-2 sm:px-3"><ArrowLeft aria-hidden="true" className="h-4 w-4 shrink-0" /><span>Back</span></button>
                <span aria-live="polite" className="text-center text-xs tabular-nums text-[var(--w-ink2)]">{showAlternative ? 'Alternative' : `${Math.min(step + 1, steps.length)} / ${steps.length}`}</span>
                <button disabled={step >= steps.length - 1} onClick={() => selectStage(Math.min(steps.length - 1, step + 1))} className="focus-ring inline-flex min-h-11 min-w-0 items-center justify-center gap-1 rounded-lg bg-[var(--w-accent)] px-2 text-sm font-semibold text-[var(--w-on-accent)] hover:bg-[var(--w-accent-hover)] disabled:cursor-not-allowed disabled:opacity-40 sm:gap-2 sm:px-3"><span className="truncate text-[var(--w-on-accent)]">{nextLabel}</span><ArrowRight aria-hidden="true" className="h-4 w-4 shrink-0 text-[var(--w-on-accent)]" /></button>
              </div>
              {alternative && <button type="button" aria-pressed={showAlternative} onClick={() => selectStage(step, !showAlternative)} className="focus-ring text-link underline mt-3">{showAlternative ? 'Return to the played line' : 'Compare alternative: ' + current.best_move}</button>}
              {current.refutation_line && <p className="mt-4 break-words text-sm leading-relaxed text-[var(--w-ink2)]"><span className="font-medium">The continuation:</span> <span className="t-notation">{current.refutation_line}</span></p>}
              <a href="#lesson-explanation" className="lg:hidden mt-3 inline-flex min-h-11 items-center gap-1 text-sm text-[var(--w-accent)] font-medium underline">Read lesson explanation ↓</a>
            </div>
            <div id="lesson-explanation" className="min-w-0 pt-1 lg:pt-3 scroll-mt-6">
              <MomentCard moment={current} index={activeIndex} stage={lessonStage} headingRef={stageHeadingRef} squareColors={squareColors} onFocusSquare={setFocusSquare} />
              <a href="#board-view" className="lg:hidden mt-6 inline-flex min-h-11 items-center gap-1 text-sm text-[var(--w-accent)] font-medium underline">↑ Back to chessboard</a>
            </div>
          </div>
        </section>
      ) : complete ? (
        <div className="border-t border-[var(--w-border)] py-10"><h2 className="t-heading text-2xl">Nothing in this game turned on one move.</h2><p className="mt-2 max-w-2xl text-[var(--w-ink2)]">No position swung far enough to single out, so there is no moment to step through here. That usually means you kept the game steady, not that every move was the strongest available.</p><Link href="/#analyze" className="mt-5 inline-flex text-sm font-semibold text-[var(--w-accent)] underline">Review another game</Link></div>
      ) : <MomentSkeleton />}

      {complete && report.summary?.focus_habit && moments.length > 1 && <section className="mt-12 border-y border-[var(--w-border)] py-8 sm:py-10"><h2 className="mb-3 text-sm font-semibold text-[var(--w-accent)]">One habit for your next game</h2><p className="t-heading max-w-3xl text-2xl leading-snug sm:text-3xl">{report.summary.focus_habit}</p></section>}
      {children}
    </div>
  );
}
