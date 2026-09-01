'use client';

import React, { useEffect, useState, use, useRef, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import {
  Sparkles,
  Share2,
  Check,
  RotateCcw,
  Mail,
  Clock,
  ArrowRight,
  BookOpen,
} from 'lucide-react';
import { API_BASE_URL, getReportById, ReportDetail, MomentReport } from '../../../lib/api';
import { captureEvent } from '../../../lib/posthog';
import { supabase } from '../../../lib/supabase';
import { ChessboardView } from '../../../components/ChessboardView';
import { MomentCard, MomentSkeleton } from '../../../components/MomentCard';
import { EvalSparkline } from '../../../components/EvalSparkline';
import { Chess } from 'chess.js';

interface PageProps {
  params: Promise<{ id: string }>;
}

const DEMO_REPORT: ReportDetail = {
  id: 'demo',
  share_id: 'demo-sample',
  player_name: 'You (1185)',
  opponent_name: 'Opponent (1210)',
  player_color: 'black',
  time_control: '10 min Rapid',
  move_count: 42,
  result: '0-1',
  status: 'completed',
  created_at: '2026-09-01T12:00:00Z',
  summary: {
    headline: "You didn't lose this in the endgame. Move 23 was the real turning point.",
    story:
      "For 20 moves, you played solid, principled chess and held an active position on the queenside. But on move 23, you focused entirely on snatching an isolated center pawn and missed your opponent's bishop battery pointing straight at your king. By the time the endgame arrived, you were fighting three connected passed pawns.",
    focus_habit: 'Before capturing an inviting free pawn, always check which diagonal your defending piece just abandoned.',
  },
  moments: [
    {
      ply: 45,
      move_number: 23,
      played: 'Nxd4',
      fen_before: 'r4rk1/pp1q1ppp/2n1p3/3p4/3Pn3/2NQ1N2/PPP2PPP/R4RK1 b - - 0 23',
      fen_after: 'r4rk1/pp1q1ppp/2n1p3/3p4/3n4/2NQ1N2/PPP2PPP/R4RK1 w - - 0 24',
      player_color: 'black',
      best_move: 'f5',
      refutation_line: '24.Nxd4 Nxd4 25.Bxh7+',
      eval_swing: 2.6,
      severity_label: 'Turning point',
      probable_thought: 'That d4 pawn is hanging, and I can trade off knights while winning central material.',
      what_actually_happens:
        "Capturing with the knight immediately undefended your f7 square, allowing White's queen and bishop to align directly on your kingside with decisive pressure.",
      concept_name: 'Abandonment of Defense',
      concept_definition: 'Moving an active piece that had an invisible duty protecting key king squares.',
      takeaway: 'Always ask: "What was my piece guarding before I move it to attack?"',
    },
    {
      ply: 61,
      move_number: 31,
      played: 'Rd8',
      fen_before: '5rk1/pp1q2pp/4p3/3p4/8/1P1Q1N2/P1P2PPP/5RK1 b - - 0 31',
      fen_after: '3r2k1/pp1q2pp/4p3/3p4/8/1P1Q1N2/P1P2PPP/5RK1 w - - 1 32',
      player_color: 'black',
      best_move: 'h6',
      refutation_line: '32.Re1 Qf7 33.Qe3',
      eval_swing: 2.6,
      severity_label: 'Last chance',
      probable_thought: 'I should contest the open d-file with my rook to activate my pieces.',
      what_actually_happens:
        "Placing the rook on d8 left your 8th rank vulnerable. White used the pin to force a queen invasion onto your back rank.",
      concept_name: 'Back-Rank Vulnerability',
      concept_definition: 'A king trapped behind its own unmoved pawns cannot defend against vertical file infiltration.',
      takeaway: 'Push a pawn (h6 or g6) to give your king an escape square before opening files.',
    },
    {
      ply: 75,
      move_number: 38,
      played: 'Kf8',
      fen_before: '3r2k1/p4ppp/4p3/8/8/1P2QN2/P1P2PPP/5RK1 b - - 0 38',
      fen_after: '3r1k2/p4ppp/4p3/8/8/1P2QN2/P1P2PPP/5RK1 w - - 1 39',
      player_color: 'black',
      best_move: 'Qd6',
      refutation_line: '39.Qxa7 Qd6 40.c4',
      eval_swing: 2.6,
      severity_label: 'Quiet drift',
      probable_thought: 'I will bring my king toward the center to participate in the endgame.',
      what_actually_happens:
        "Stepping onto f8 allowed White's queen to deliver check on a7 with tempo, cleaning up your remaining queenside pawns.",
      concept_name: 'King Step With Tempo',
      concept_definition: 'Moving the king onto a square that hands your opponent a check with capture.',
      takeaway: 'Keep your king sheltered until queens are traded off the board.',
    },
  ],
};

export default function ReportPage({ params }: PageProps) {
  const { id } = use(params);
  const router = useRouter();

  const isDemo = id === 'demo';

  const [report, setReport] = useState<ReportDetail | null>(isDemo ? DEMO_REPORT : null);
  const [status, setStatus] = useState<string>(isDemo ? 'completed' : 'pending');
  const [moments, setMoments] = useState<MomentReport[]>(isDemo ? DEMO_REPORT.moments : []);
  const [activeMomentIndex, setActiveMomentIndex] = useState<number>(0);
  const [orientation, setOrientation] = useState<'white' | 'black'>(isDemo ? 'black' : 'white');
  const [isCopied, setIsCopied] = useState(false);
  const [email, setEmail] = useState('');
  const [isEmailSent, setIsEmailSent] = useState(false);
  const [isStalled, setIsStalled] = useState(false);
  const engagedRef = useRef(false);
  const selectedMomentsRef = useRef<Set<number>>(new Set());

  // Auto-orient board when report loads
  useEffect(() => {
    if (report?.player_color) {
      setOrientation(report.player_color);
    }
  }, [report?.player_color]);

  // Funnel step 2: report_viewed (plan section 6.6)
  useEffect(() => {
    captureEvent('report_viewed', { report_id: id, is_shared: false, is_demo: isDemo });
  }, [id, isDemo]);

  // 1. Setup SSE streaming and initial fetch (skip if demo)
  useEffect(() => {
    if (isDemo) return;

    let eventSource: EventSource | null = null;
    let isMounted = true;
    let streamFinished = false;
    let stallTimer: ReturnType<typeof setTimeout> | undefined;

    // Stall watchdog: 60s without ANY stream activity (re-armed on every SSE
    // message), not 60s since mount — a slow-but-live stream never reads as stalled
    const armStall = () => {
      if (stallTimer) clearTimeout(stallTimer);
      stallTimer = setTimeout(() => setIsStalled(true), 60000);
    };
    armStall();

    const fetchInitialData = async () => {
      try {
        const data = await getReportById(id);
        if (!isMounted) return;
        armStall();

        setReport(data);
        setStatus(data.status);
        if (data.moments && data.moments.length > 0) {
          setMoments(data.moments);
        }

        if (data.status === 'completed' || data.status === 'failed') {
          return;
        }

        // Connect SSE if report is still processing (engine route: /api/reports/:id/events)
        eventSource = new EventSource(`${API_BASE_URL}/api/reports/${id}/events`);

        eventSource.onmessage = (event) => {
          if (!isMounted) return;
          armStall(); // any message (stage/moment/done/ping) is stream activity
          try {
            const update = JSON.parse(event.data);
            if (update.type === 'stage' && update.status) {
              setStatus(update.status);
            } else if (update.type === 'moment' && update.moment) {
              // Engine re-sends moments from 0 on reconnect — dedupe by ply
              setMoments((prev) =>
                prev.some((m) => m.ply === update.moment.ply) ? prev : [...prev, update.moment]
              );
            } else if (update.type === 'done' && update.report) {
              setReport((prev) => (prev ? { ...prev, ...update.report } : update.report));
              setStatus('completed');
              streamFinished = true;
              eventSource?.close();
            } else if (update.type === 'failed' || update.type === 'error') {
              streamFinished = true;
              setStatus('failed');
              eventSource?.close();
            }
            // {type:'ping'} needs no handling beyond the re-arm above
          } catch (e) {
            console.error('Failed to parse SSE payload:', e);
          }
        };

        eventSource.onerror = () => {
          // Native EventSource auto-reconnects; only stop once terminal
          if (streamFinished) {
            eventSource?.close();
          }
        };
      } catch (err) {
        console.error('Fetch error:', err);
        if (isMounted) setStatus('failed');
      }
    };

    fetchInitialData();

    return () => {
      isMounted = false;
      eventSource?.close();
      if (stallTimer) clearTimeout(stallTimer);
    };
  }, [id, isDemo]);

  // 2. Engagement tracking — report_engaged fires at 60s dwell (single-fire);
  // the other trigger (2+ distinct moments selected) lives in handleSelectMoment
  useEffect(() => {
    const dwellTimer = setTimeout(() => {
      if (!engagedRef.current) {
        engagedRef.current = true;
        captureEvent('report_engaged', { report_id: id, reason: 'dwell_60s', is_demo: isDemo });
      }
    }, 60000);

    return () => clearTimeout(dwellTimer);
  }, [id, isDemo]);

  const handleSelectMoment = useCallback(
    (index: number) => {
      setActiveMomentIndex(index);
      captureEvent('moment_expanded', {
        report_id: id,
        moment_index: index,
        concept_name: moments[index]?.concept_name,
        is_demo: isDemo,
      });
      // Plan funnel: report_engaged fires on 2+ distinct moments viewed OR 60s dwell
      selectedMomentsRef.current.add(index);
      if (selectedMomentsRef.current.size >= 2 && !engagedRef.current) {
        engagedRef.current = true;
        captureEvent('report_engaged', { report_id: id, reason: 'moments_selected_2', is_demo: isDemo });
      }
    },
    [id, isDemo, moments]
  );

  const toggleOrientation = useCallback(() => {
    setOrientation((prev) => (prev === 'white' ? 'black' : 'white'));
  }, []);

  // Keyboard navigation shortcuts (← / → to cycle moments, F to flip board)
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

  const handleCopyShareLink = () => {
    const shareId = report?.share_id || id;
    const url = `${window.location.origin}/r/${shareId}`;
    navigator.clipboard.writeText(url).then(() => {
      setIsCopied(true);
      setTimeout(() => setIsCopied(false), 2500);
      captureEvent('report_shared', { report_id: id, is_demo: isDemo });
    });
  };

  const handleSendEmail = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email.trim()) return;

    try {
      await supabase.auth.signInWithOtp({
        email: email.trim(),
        options: {
          emailRedirectTo: `${window.location.origin}/auth/callback?report_id=${id}`,
        },
      });
      setIsEmailSent(true);
      captureEvent('email_saved', { report_id: id });
    } catch (err) {
      console.warn('Failed to send magic link:', err);
    }
  };

  const currentMoment = moments[activeMomentIndex] || moments[0];
  const activeFen =
    currentMoment?.fen_before || 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1';

  // Played-move arrow for the active moment
  const playedArrow = (() => {
    if (!currentMoment) return undefined;
    try {
      const mv = new Chess(currentMoment.fen_before).move(currentMoment.played);
      return mv ? { startSquare: mv.from, endSquare: mv.to, color: 'rgba(180, 83, 9, 0.85)' } : undefined;
    } catch {
      return undefined;
    }
  })();

  // Stalled or Failed Callout Screen
  if (status === 'failed' || isStalled) {
    return (
      <div className="mx-auto max-w-xl px-4 py-16 text-center">
        <div className="card-box bg-[var(--w-surface)] p-8 border border-[var(--w-border-strong)] shadow-md">
          <div className="flex justify-center mb-4 text-[var(--w-accent)]">
            <Clock className="w-10 h-10 animate-pulse" />
          </div>
          <h2 className="t-heading mb-2">This is taking a moment longer than usual.</h2>
          <p className="t-body text-[var(--w-ink2)] mb-6">
            Your game analysis is running on the engine queue — try refreshing or check a demo game.
          </p>
          <div className="flex justify-center gap-3">
            <button
              onClick={() => window.location.reload()}
              className="rounded-lg bg-[var(--w-accent)] px-4 py-2.5 text-sm font-semibold text-[var(--w-on-accent)] hover:bg-[var(--w-accent-hover)] transition-all flex items-center gap-2 cursor-pointer"
            >
              <RotateCcw className="w-4 h-4" />
              <span>Retry</span>
            </button>
            <Link
              href="/report/demo"
              className="rounded-lg border border-[var(--w-border)] bg-[var(--w-canvas)] px-4 py-2.5 text-sm font-semibold text-[var(--w-ink1)] hover:bg-[var(--w-surface-subtle)] transition-colors flex items-center gap-1.5"
            >
              <BookOpen className="w-4 h-4" />
              <span>View demo report</span>
            </Link>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-6xl px-4 py-6 sm:px-6 sm:py-10">
      {/* Demo Banner */}
      {isDemo && (
        <div className="mb-6 rounded-xl bg-[var(--w-surface-subtle)] p-4 border border-[var(--w-border-strong)] flex flex-col sm:flex-row items-center justify-between gap-3 shadow-sm">
          <div className="flex items-center gap-2.5">
            <div className="w-7 h-7 rounded-full bg-[var(--w-accent-soft)] flex items-center justify-center text-[var(--w-accent)]">
              <BookOpen className="w-4 h-4" />
            </div>
            <div>
              <p className="t-body-strong text-[var(--w-ink1)]">Sample Game Report (1200 Elo)</p>
              <p className="t-caption text-[var(--w-ink2)]">
                This is an authentic sample of how Chessplain breaks down a lost game into teachable habits.
              </p>
            </div>
          </div>
          <Link
            href="/"
            className="inline-flex items-center gap-1.5 rounded-lg bg-[var(--w-accent)] px-3.5 py-2 text-xs font-bold text-[var(--w-on-accent)] hover:bg-[var(--w-accent-hover)] shadow-sm transition-all shrink-0"
          >
            <span>Explain your own game free</span>
            <ArrowRight className="w-3.5 h-3.5" />
          </Link>
        </div>
      )}

      {/* Header Meta */}
      <div className="mb-6 flex flex-wrap items-center justify-between gap-3 border-b border-[var(--w-border)] pb-4">
        <div>
          <div className="flex items-center gap-2">
            <span className="badge-muted">
              {report?.result === '1-0' ? 'White won' : report?.result === '0-1' ? 'Black won' : 'Game analysis'}
            </span>
            <span className="t-caption text-[var(--w-ink2)]">
              {report?.move_count ? `${report.move_count} moves` : ''} · {report?.time_control || 'Rapid'}
            </span>
          </div>
          <p className="t-small font-semibold text-[var(--w-ink1)] mt-1">
            {report?.player_name || 'You'} vs {report?.opponent_name || 'Opponent'}
          </p>
        </div>

        <div className="flex items-center gap-2">
          {/* Flip board button */}
          <button
            onClick={toggleOrientation}
            title="Flip board perspective (F)"
            className="flex items-center gap-1.5 rounded-lg border border-[var(--w-border)] bg-[var(--w-surface)] px-3 py-1.5 text-xs font-medium text-[var(--w-ink1)] hover:border-[var(--w-border-strong)] transition-all cursor-pointer"
          >
            <RotateCcw className="w-3.5 h-3.5 text-[var(--w-ink2)]" />
            <span className="hidden sm:inline">Flip: {orientation === 'white' ? 'White' : 'Black'}</span>
          </button>

          {/* Share button */}
          <button
            onClick={handleCopyShareLink}
            className="flex items-center gap-1.5 rounded-lg border border-[var(--w-border)] bg-[var(--w-surface)] px-3 py-1.5 text-xs font-semibold text-[var(--w-ink1)] hover:border-[var(--w-border-strong)] shadow-sm transition-all cursor-pointer"
          >
            {isCopied ? (
              <>
                <Check className="w-3.5 h-3.5 text-[var(--w-success)]" />
                <span className="text-[var(--w-success)] font-bold">Copied link!</span>
              </>
            ) : (
              <>
                <Share2 className="w-3.5 h-3.5 text-[var(--w-accent)]" />
                <span>Share report</span>
              </>
            )}
          </button>
        </div>
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

            {/* Micro keyboard hint for desktop */}
            <div className="hidden lg:flex items-center gap-3 text-[var(--t-xs)] text-[var(--w-ink3)] mt-2">
              <span className="inline-flex items-center gap-1">
                <kbd className="px-1.5 py-0.5 rounded bg-[var(--w-surface-subtle)] border border-[var(--w-border)] font-mono text-[10px]">←</kbd>
                <kbd className="px-1.5 py-0.5 rounded bg-[var(--w-surface-subtle)] border border-[var(--w-border)] font-mono text-[10px]">→</kbd>
                <span>Navigate</span>
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

        {/* Right Column: Story Summary & Moment Cards */}
        <div className="lg:col-span-7 flex flex-col gap-6">
          {/* Summary / Headline Block */}
          {report?.summary ? (
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
          ) : (
            <div className="card-box p-6 bg-[var(--w-surface)] animate-pulse border border-[var(--w-border)]">
              <div className="skeleton h-7 w-3/4 mb-3"></div>
              <div className="skeleton h-20 w-full mb-3"></div>
              <div className="skeleton h-12 w-full"></div>
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

            {status !== 'completed' && status !== 'failed' && (
              <MomentSkeleton index={moments.length + 1} />
            )}
          </div>

          {/* Email Capture Section */}
          {status === 'completed' && (
            <div className="card-box p-6 bg-[var(--w-surface)] border border-[var(--w-border)]">
              <h3 className="t-section text-base font-bold text-[var(--w-ink1)] mb-1">
                Want to keep this report in your inbox?
              </h3>
              <p className="t-caption text-[var(--w-ink2)] mb-4">
                Enter your email to receive a private access link back to this analysis anytime.
              </p>

              {isEmailSent ? (
                <div className="rounded-lg bg-[var(--w-success-soft)] p-3 text-sm text-[var(--w-success)] flex items-center gap-2 border border-[var(--w-success)]/20 font-medium">
                  <Check className="w-4 h-4" />
                  <span>Private access link sent! Check your inbox.</span>
                </div>
              ) : (
                <form onSubmit={handleSendEmail} className="flex gap-2">
                  <input
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="you@example.com"
                    className="flex-1 rounded-lg border border-[var(--w-border)] bg-[var(--w-canvas)] px-3.5 py-2.5 text-sm text-[var(--w-ink1)] placeholder-[var(--w-ink3)] focus:border-[var(--w-accent)] focus:outline-none focus:ring-1 focus:ring-[var(--w-accent)]"
                  />
                  <button
                    type="submit"
                    className="rounded-lg bg-[var(--w-accent)] px-4 py-2.5 text-sm font-semibold text-[var(--w-on-accent)] hover:bg-[var(--w-accent-hover)] transition-all flex items-center gap-1.5 cursor-pointer"
                  >
                    <Mail className="w-4 h-4" />
                    <span>Email link</span>
                  </button>
                </form>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
