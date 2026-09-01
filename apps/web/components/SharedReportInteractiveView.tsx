'use client';

import React, { useState, useEffect, useCallback } from 'react';
import Link from 'next/link';
import { Sparkles, ArrowRight, RotateCcw, Check, BookOpen } from 'lucide-react';
import { ReportDetail, MomentReport } from '../lib/api';
import { ChessboardView } from './ChessboardView';
import { MomentCard } from './MomentCard';
import { EvalSparkline } from './EvalSparkline';
import { Chess } from 'chess.js';

interface SharedReportInteractiveViewProps {
  report: ReportDetail;
  shareId: string;
}

export function SharedReportInteractiveView({ report, shareId }: SharedReportInteractiveViewProps) {
  const moments = report.moments || [];
  const [activeMomentIndex, setActiveMomentIndex] = useState<number>(0);
  const [orientation, setOrientation] = useState<'white' | 'black'>(
    report.player_color || 'white'
  );

  const handleSelectMoment = useCallback((index: number) => {
    setActiveMomentIndex(index);
  }, []);

  const toggleOrientation = useCallback(() => {
    setOrientation((prev) => (prev === 'white' ? 'black' : 'white'));
  }, []);

  // Keyboard navigation shortcuts
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) {
        return;
      }

      if (e.key === 'ArrowRight' || e.key === 'j') {
        if (moments.length > 0) {
          handleSelectMoment((activeMomentIndex + 1) % moments.length);
        }
      } else if (e.key === 'ArrowLeft' || e.key === 'k') {
        if (moments.length > 0) {
          handleSelectMoment((activeMomentIndex - 1 + moments.length) % moments.length);
        }
      } else if (e.key === 'f' || e.key === 'F') {
        toggleOrientation();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [activeMomentIndex, moments.length, handleSelectMoment, toggleOrientation]);

  const currentMoment = moments[activeMomentIndex] || moments[0];
  const activeFen =
    currentMoment?.fen_before || 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1';

  const playedArrow = (() => {
    if (!currentMoment) return undefined;
    try {
      const mv = new Chess(currentMoment.fen_before).move(currentMoment.played);
      return mv ? { startSquare: mv.from, endSquare: mv.to, color: 'rgba(180, 83, 9, 0.85)' } : undefined;
    } catch {
      return undefined;
    }
  })();

  return (
    <div className="mx-auto max-w-6xl px-4 py-6 sm:px-6 sm:py-10">
      {/* Banner Call to Action */}
      <div className="mb-6 rounded-xl bg-[var(--w-surface-subtle)] p-4 border border-[var(--w-border-strong)] flex flex-col sm:flex-row items-center justify-between gap-4 shadow-sm">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-full bg-[var(--w-accent-soft)] flex items-center justify-center text-[var(--w-accent)] shrink-0">
            <Sparkles className="w-4 h-4" />
          </div>
          <div>
            <p className="t-body-strong text-[var(--w-ink1)]">Shared Chessplain Game Review</p>
            <p className="t-caption text-[var(--w-ink2)]">
              Turn your own lost games into clear, human explanations without engine jargon.
            </p>
          </div>
        </div>
        <Link
          href="/"
          className="flex items-center gap-1.5 rounded-lg bg-[var(--w-accent)] px-4 py-2.5 text-xs font-bold text-[var(--w-on-accent)] hover:bg-[var(--w-accent-hover)] shadow-sm transition-all shrink-0 cursor-pointer"
        >
          <span>Explain your game free</span>
          <ArrowRight className="w-3.5 h-3.5" />
        </Link>
      </div>

      {/* Header Meta */}
      <div className="mb-6 flex flex-wrap items-center justify-between gap-3 border-b border-[var(--w-border)] pb-4">
        <div>
          <div className="flex items-center gap-2">
            <span className="badge-muted">
              {report.result === '1-0' ? 'White won' : report.result === '0-1' ? 'Black won' : 'Game analysis'}
            </span>
            <span className="t-caption text-[var(--w-ink2)]">
              {report.move_count ? `${report.move_count} moves` : ''} · {report.time_control || 'Rapid'}
            </span>
          </div>
          <p className="t-small font-semibold text-[var(--w-ink1)] mt-1">
            {report.player_name || 'Player'} vs {report.opponent_name || 'Opponent'}
          </p>
        </div>

        {/* Flip button */}
        <button
          onClick={toggleOrientation}
          title="Flip board perspective (F)"
          className="flex items-center gap-1.5 rounded-lg border border-[var(--w-border)] bg-[var(--w-surface)] px-3 py-1.5 text-xs font-medium text-[var(--w-ink1)] hover:border-[var(--w-border-strong)] transition-all cursor-pointer"
        >
          <RotateCcw className="w-3.5 h-3.5 text-[var(--w-ink2)]" />
          <span>Flip: {orientation === 'white' ? 'White' : 'Black'}</span>
        </button>
      </div>

      {/* Main 2-Column Responsive Layout */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
        {/* Left Column: Interactive Chessboard */}
        <div className="lg:col-span-5 lg:sticky lg:top-6 flex flex-col gap-4">
          <div className="w-full flex flex-col items-center">
            <ChessboardView
              fen={activeFen}
              orientation={orientation}
              boardWidth={360}
              arrows={playedArrow ? [playedArrow] : []}
            />

            <div className="hidden lg:flex items-center gap-3 text-[var(--t-xs)] text-[var(--w-ink3)] mt-2">
              <span className="inline-flex items-center gap-1">
                <kbd className="px-1.5 py-0.5 rounded bg-[var(--w-surface-subtle)] border border-[var(--w-border)] font-mono text-[10px]">←</kbd>
                <kbd className="px-1.5 py-0.5 rounded bg-[var(--w-surface-subtle)] border border-[var(--w-border)] font-mono text-[10px]">→</kbd>
                <span>Navigate moments</span>
              </span>
              <span>·</span>
              <span className="inline-flex items-center gap-1">
                <kbd className="px-1.5 py-0.5 rounded bg-[var(--w-surface-subtle)] border border-[var(--w-border)] font-mono text-[10px]">F</kbd>
                <span>Flip</span>
              </span>
            </div>
          </div>

          {/* Eval Sparkline */}
          <div className="card-box p-3.5 bg-[var(--w-surface)]">
            <EvalSparkline
              moments={moments}
              activePly={currentMoment?.ply}
              onSelectPly={(ply) => {
                const idx = moments.findIndex((m) => m.ply === ply);
                if (idx !== -1) handleSelectMoment(idx);
              }}
            />
          </div>
        </div>

        {/* Right Column: Story & Moments */}
        <div className="lg:col-span-7 flex flex-col gap-6">
          {/* Summary / Headline Block */}
          {report.summary && (
            <div className="card-box p-6 sm:p-7 bg-[var(--w-surface)] shadow-md border border-[var(--w-border-strong)]">
              <div className="inline-flex items-center gap-1.5 text-xs font-bold uppercase tracking-wider text-[var(--w-accent)] mb-2">
                <Sparkles className="w-3.5 h-3.5" />
                <span>The Story of the Game</span>
              </div>
              <h1 className="t-heading text-2xl sm:text-3xl text-[var(--w-ink1)] mb-3 leading-snug">
                {report.summary.headline}
              </h1>
              <p className="t-body text-[var(--w-ink1)] leading-relaxed">
                {report.summary.story}
              </p>
              
              {/* Focus Habit Callout */}
              <div className="mt-5 pt-4 border-t border-[var(--w-border)]">
                <div className="takeaway-box">
                  <div className="w-5 h-5 rounded-full bg-[var(--w-accent-soft)] flex items-center justify-center shrink-0 mt-0.5">
                    <Check className="w-3.5 h-3.5 text-[var(--w-accent)]" />
                  </div>
                  <div>
                    <span className="t-caption font-bold text-[var(--w-accent)] uppercase tracking-wider">
                      Single Focus Habit For Next Game
                    </span>
                    <p className="t-body-strong text-[var(--w-ink1)] mt-0.5">
                      {report.summary.focus_habit}
                    </p>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* Moment Cards List */}
          <div className="flex flex-col gap-4">
            <div className="flex items-center justify-between">
              <h2 className="t-section text-base font-bold text-[var(--w-ink1)]">
                Decisive Moments ({moments.length})
              </h2>
              <span className="t-caption text-[var(--w-ink3)]">
                Click any card to inspect on board
              </span>
            </div>

            {moments.map((moment, idx) => (
              <MomentCard
                key={moment.ply}
                moment={moment}
                index={idx}
                isActive={idx === activeMomentIndex}
                onSelect={() => handleSelectMoment(idx)}
              />
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
