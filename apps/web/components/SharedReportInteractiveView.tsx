'use client';

import { useState, useMemo, useEffect, type ReactNode } from 'react';
import Link from 'next/link';
import { ArrowRight, ArrowLeft, RotateCcw, BookOpen } from 'lucide-react';
import { Chess } from 'chess.js';
import type { ReportDetail, MomentReport } from '../lib/api';
import { ChessboardView } from './ChessboardView';
import { MomentCard, MomentSkeleton } from './MomentCard';

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

  const selectMoment = (index: number) => {
    setActiveIndex(index);
    setStep(0);
    setShowAlternative(false);
    onSelectMoment?.(index);
  };
  const playedArrow = useMemo(() => {
    if (!current || step !== 0) return [];
    try {
      const move = new Chess(current.fen_before).move(current.played.replace(/^\d+\.+\s*/, ''));
      return move ? [{ startSquare: move.from, endSquare: move.to, color: '#aa5939' }] : [];
    } catch { return []; }
  }, [current, step]);

  const alternativeArrow = useMemo(() => {
    if (!showAlternative || !current?.best_move) return [];
    try {
      const board = new Chess(current.fen_before);
      const m = board.move(current.best_move.replace(/^\d+\.+\s*/, ''));
      return m ? [{ startSquare: m.from, endSquare: m.to, color: '#3f744c' }] : [];
    } catch { return []; }
  }, [showAlternative, current]);

  const highlightedSquares = useMemo(() => {
    if (!current) return [];
    try {
      if (showAlternative && alternative && current.best_move) {
        const board = new Chess(current.fen_before);
        const m = board.move(current.best_move.replace(/^\d+\.+\s*/, ''));
        return m ? [m.from, m.to] : [];
      }
      if (step === 0) {
        const board = new Chess(current.fen_before);
        const m = board.move(current.played.replace(/^\d+\.+\s*/, ''));
        return m ? [m.from, m.to] : [];
      }
    } catch { return []; }
    return [];
  }, [current, step, showAlternative, alternative]);

  const activeArrows = showAlternative ? alternativeArrow : playedArrow;
  const result = report.result === '1-0' ? 'White won' : report.result === '0-1' ? 'Black won' : report.result === '1/2-1/2' ? 'Draw' : null;

  return (
    <div className="mx-auto max-w-6xl px-5 py-7 sm:px-8 sm:py-10">
      {(isDemo || !isOwner) && (
        <div className="mb-9 flex flex-col justify-between gap-4 border-b border-[var(--w-border)] pb-6 sm:flex-row sm:items-center">
          <div className="flex items-start gap-3">
            <BookOpen aria-hidden="true" className="mt-1 h-5 w-5 shrink-0 text-[var(--w-accent)]" />
            <div>
              <p className="text-sm font-semibold">{isDemo ? 'An illustrative game review' : 'A shared game review'}</p>
              <p className="mt-1 max-w-lg text-sm leading-relaxed text-[var(--w-ink2)]">{isDemo ? 'A short teaching example. Explore the move, its consequence, and one habit to take away.' : 'Follow the key moments, then try a review of your own game.'}</p>
            </div>
          </div>
          <Link href="/#analyze" className="inline-flex min-h-11 shrink-0 items-center justify-center gap-2 rounded-lg bg-[var(--w-accent)] px-4 text-sm font-semibold text-[var(--w-on-accent)] hover:bg-[var(--w-accent-hover)] active:scale-[0.98] transition-transform">Review your game <ArrowRight aria-hidden="true" className="h-4 w-4" /></Link>
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
        <section aria-label="Explore the key moments" className="border-t border-[var(--w-border)] pt-6">
          <div className="mb-7 flex flex-wrap items-center justify-between gap-4">
            <p className="text-sm text-[var(--w-ink2)]">{moments.length === 1 ? 'One moment to learn from' : `${moments.length} moments to learn from`}</p>
            <div className="flex flex-wrap gap-2" aria-label="Choose a moment">
              {moments.map((moment, index) => (
                <button key={moment.ply} aria-pressed={index === activeIndex} onClick={() => selectMoment(index)} className={`focus-ring min-h-11 rounded-lg border px-4 text-sm font-medium transition-all active:scale-[0.98] ${index === activeIndex ? 'border-[var(--w-ink1)] bg-[var(--w-ink1)] text-[var(--w-canvas)]' : 'border-[var(--w-border)] hover:bg-[var(--w-surface-subtle)]'}`}>Move {moment.move_number}{moment.player_color === 'black' ? '…' : '.'} {moment.played}</button>
              ))}
            </div>
          </div>
          <div className="grid min-w-0 grid-cols-1 items-start gap-8 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)] lg:gap-14">
            <div id="board-view" className="min-w-0 lg:sticky lg:top-8 scroll-mt-6">
              <div className="mb-3 flex items-center justify-between gap-3">
                <p aria-live="polite" className="text-sm font-medium">{activeStep?.label}</p>
                <button onClick={() => setOrientation(prev => prev === 'white' ? 'black' : 'white')} className="focus-ring inline-flex min-h-11 items-center gap-2 rounded-lg px-3 text-sm text-[var(--w-ink2)] hover:bg-[var(--w-surface-subtle)] active:scale-[0.98] transition-transform" aria-label={`Flip board; currently ${orientation} at bottom`}><RotateCcw aria-hidden="true" className="h-4 w-4" />Flip board</button>
              </div>
              {activeStep && (
                <ChessboardView
                  fen={activeStep.fen}
                  orientation={orientation}
                  boardWidth={520}
                  arrows={activeArrows}
                  highlightSquares={highlightedSquares}
                />
              )}
              <div className="mt-3 flex items-center justify-between gap-3" aria-label="Step through the played line" onKeyDown={event => {
                if (event.altKey || event.ctrlKey || event.metaKey) return;
                setShowAlternative(false);
                if (event.key === 'ArrowRight') { event.preventDefault(); setStep(prev => Math.min(steps.length - 1, prev + 1)); }
                if (event.key === 'ArrowLeft') { event.preventDefault(); setStep(prev => Math.max(0, prev - 1)); }
              }}>
                <button disabled={step === 0} onClick={() => { setShowAlternative(false); setStep(prev => Math.max(0, prev - 1)); }} className="focus-ring inline-flex min-h-11 items-center gap-2 rounded-lg border border-[var(--w-border)] px-3 text-sm disabled:cursor-not-allowed disabled:opacity-40 active:scale-[0.98] transition-transform"><ArrowLeft aria-hidden="true" className="h-4 w-4" />Back</button>
                <span className="text-xs tabular-nums text-[var(--w-ink2)]">{showAlternative ? 'Alternative position' : 'Position ' + Math.min(step + 1, steps.length) + ' of ' + steps.length}</span>
                <button disabled={step >= steps.length - 1} onClick={() => { setShowAlternative(false); setStep(prev => Math.min(steps.length - 1, prev + 1)); }} className="focus-ring inline-flex min-h-11 items-center gap-2 rounded-lg bg-[var(--w-ink1)] px-3 text-sm text-[var(--w-canvas)] disabled:cursor-not-allowed disabled:opacity-40 active:scale-[0.98] transition-transform">{step === 0 ? 'Show move' : 'Continue'}<ArrowRight aria-hidden="true" className="h-4 w-4" /></button>
              </div>
              {alternative && <button type="button" aria-pressed={showAlternative} onClick={() => setShowAlternative(value => !value)} className="text-link underline mt-3">{showAlternative ? 'Return to the played line' : 'Compare alternative: ' + current.best_move}</button>}
              {current.refutation_line && <p className="mt-4 break-words text-sm leading-relaxed text-[var(--w-ink2)]"><span className="font-medium">The continuation:</span> <span className="t-notation">{current.refutation_line}</span></p>}
              <a href="#lesson-explanation" className="lg:hidden mt-3 inline-flex items-center gap-1 text-xs text-[var(--w-accent)] font-medium underline">Read lesson explanation ↓</a>
            </div>
            <div id="lesson-explanation" className="min-w-0 pt-1 lg:pt-3 scroll-mt-6">
              <MomentCard moment={current} index={activeIndex} />
              <a href="#board-view" className="lg:hidden mt-6 inline-flex items-center gap-1 text-xs text-[var(--w-accent)] font-medium underline">↑ Back to chessboard</a>
            </div>
          </div>
        </section>
      ) : complete ? (
        <div className="border-t border-[var(--w-border)] py-10"><h2 className="t-heading text-2xl">Nothing in this game turned on one move.</h2><p className="mt-2 max-w-2xl text-[var(--w-ink2)]">No position swung far enough to single out, so there is no moment to step through here. That usually means you kept the game steady, not that every move was the strongest available.</p><Link href="/#analyze" className="mt-5 inline-flex text-sm font-semibold text-[var(--w-accent)] underline">Review another game</Link></div>
      ) : <MomentSkeleton />}

      {complete && report.summary?.focus_habit && <section className="mt-12 border-y border-[var(--w-border)] py-8 sm:py-10"><h2 className="mb-3 text-sm font-semibold text-[var(--w-accent)]">One habit for your next game</h2><p className="t-heading max-w-3xl text-2xl leading-snug sm:text-3xl">{report.summary.focus_habit}</p></section>}
      {children}
    </div>
  );
}
