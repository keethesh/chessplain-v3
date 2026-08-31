'use client';

import React, { useEffect, useState, use, useRef } from 'react';
import { useRouter } from 'next/navigation';
import {
  Sparkles,
  Share2,
  Check,
  RotateCcw,
  Mail,
  AlertCircle,
  Clock,
} from 'lucide-react';
import { API_BASE_URL, ReportDetail, MomentReport } from '../../../lib/api';
import { captureEvent } from '../../../lib/posthog';
import { supabase } from '../../../lib/supabase';
import { ChessboardView } from '../../../components/ChessboardView';
import { MomentCard, MomentSkeleton } from '../../../components/MomentCard';
import { EvalSparkline } from '../../../components/EvalSparkline';

interface PageProps {
  params: Promise<{ id: string }>;
}

export default function ReportPage({ params }: PageProps) {
  const { id } = use(params);
  const router = useRouter();

  const [report, setReport] = useState<ReportDetail | null>(null);
  const [status, setStatus] = useState<string>('pending');
  const [moments, setMoments] = useState<MomentReport[]>([]);
  const [activeMomentIndex, setActiveMomentIndex] = useState<number>(0);
  const [isCopied, setIsCopied] = useState(false);
  const [email, setEmail] = useState('');
  const [isEmailSent, setIsEmailSent] = useState(false);
  const [isStalled, setIsStalled] = useState(false);
  const [expandedMoments, setExpandedMoments] = useState<Set<number>>(new Set());
  const engagedRef = useRef(false);

  // 1. Setup SSE streaming and initial fetch
  useEffect(() => {
    captureEvent('report_viewed', { report_id: id, is_shared: false });

    // Initial fetch
    fetch(`${API_BASE_URL}/api/reports/${id}`)
      .then((res) => (res.ok ? res.json() : null))
      .then((data: ReportDetail | null) => {
        if (data) {
          setReport(data);
          setStatus(data.status);
          if (data.moments && data.moments.length > 0) {
            setMoments(data.moments);
          }
        }
      })
      .catch((err) => console.warn('Initial report fetch error:', err));

    // Stall watchdog: 60s without any stream activity (re-armed on every event),
    // not 60s since mount — a slow-but-live stream must never read as stalled
    let stallTimer: ReturnType<typeof setTimeout> | undefined;
    const armStall = () => {
      if (stallTimer) clearTimeout(stallTimer);
      stallTimer = setTimeout(() => setIsStalled(true), 60000);
    };
    armStall();

    let streamFinished = false;

    // Setup SSE
    const eventSource = new EventSource(`${API_BASE_URL}/api/reports/${id}/events`);

    eventSource.onmessage = (event) => {
      armStall(); // any message is stream activity
      try {
        const payload = JSON.parse(event.data);
        if (payload.type === 'stage') {
          setStatus(payload.status);
        } else if (payload.type === 'moment' && payload.moment) {
          setMoments((prev) => {
            const exists = prev.some((m) => m.ply === payload.moment.ply);
            if (exists) return prev;
            const updated = [...prev, payload.moment].sort((a, b) => a.ply - b.ply);
            return updated;
          });
        } else if (payload.type === 'done' && payload.report) {
          streamFinished = true;
          if (stallTimer) clearTimeout(stallTimer);
          setReport(payload.report);
          setStatus('completed');
          if (payload.report.moments) {
            setMoments(payload.report.moments);
          }
          eventSource.close();
        } else if (payload.type === 'failed') {
          streamFinished = true;
          if (stallTimer) clearTimeout(stallTimer);
          setStatus('failed');
          eventSource.close();
        }
      } catch (err) {
        console.error('Error parsing SSE event:', err);
      }
    };

    eventSource.onerror = () => {
      // Keep trying unless the stream reached a terminal state
      if (streamFinished) {
        eventSource.close();
      }
    };

    return () => {
      if (stallTimer) clearTimeout(stallTimer);
      eventSource.close();
    };
  }, [id]);

  // 2. Dwell time & engagement tracking
  useEffect(() => {
    const dwellTimer = setTimeout(() => {
      if (!engagedRef.current) {
        engagedRef.current = true;
        captureEvent('report_engaged', { report_id: id, reason: 'dwell_60s' });
      }
    }, 60000);

    return () => clearTimeout(dwellTimer);
  }, [id]);

  const handleSelectMoment = (index: number) => {
    setActiveMomentIndex(index);
    const m = moments[index];
    if (m && !expandedMoments.has(index)) {
      const nextExpanded = new Set(expandedMoments).add(index);
      setExpandedMoments(nextExpanded);
      captureEvent('moment_expanded', {
        moment_index: index,
        concept_name: m.concept_name,
      });
      if (nextExpanded.size >= 2 && !engagedRef.current) {
        engagedRef.current = true;
        captureEvent('report_engaged', { report_id: id, reason: 'moments_expanded_2' });
      }
    }
  };

  const handleCopyShareLink = () => {
    const shareId = report?.share_id || id;
    const url = `${window.location.origin}/r/${shareId}`;
    navigator.clipboard.writeText(url).then(() => {
      setIsCopied(true);
      setTimeout(() => setIsCopied(false), 2500);
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
    } catch (err) {
      console.warn('Failed to send magic link:', err);
    }
  };

  const currentMoment = moments[activeMomentIndex] || moments[0];
  const activeFen = currentMoment?.fen_before || 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1';

  // Stalled or Failed Callout Screen
  if (status === 'failed' || isStalled) {
    return (
      <div className="mx-auto max-w-xl px-4 py-16 text-center">
        <div className="card-box bg-[var(--w-surface)] p-8 border border-[var(--w-border)]">
          <div className="flex justify-center mb-4 text-[var(--w-accent)]">
            <Clock className="w-10 h-10 animate-pulse" />
          </div>
          <h2 className="t-heading mb-2">This is taking longer than it should.</h2>
          <p className="t-body muted mb-6">
            Your game is queued — try refreshing in a minute.
          </p>
          <div className="flex justify-center gap-3">
            <button
              onClick={() => window.location.reload()}
              className="rounded-md bg-[var(--w-accent)] px-4 py-2 text-sm font-medium text-[var(--w-on-accent)] hover:opacity-90 transition-all flex items-center gap-2"
            >
              <RotateCcw className="w-4 h-4" />
              <span>Try again</span>
            </button>
            <button
              onClick={() => router.push('/')}
              className="rounded-md border border-[var(--w-border)] bg-[var(--w-canvas)] px-4 py-2 text-sm font-medium text-[var(--w-ink1)] hover:bg-[var(--w-surface)]"
            >
              Analyze another
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-6xl px-4 py-8 sm:px-6 sm:py-12">
      {/* Header Meta */}
      <div className="mb-6 flex flex-wrap items-center justify-between gap-3 border-b border-[var(--w-border)] pb-4">
        <div>
          <div className="flex items-center gap-2">
            <span className="badge-muted">
              {report?.result === '1-0' ? 'White won' : report?.result === '0-1' ? 'Black won' : 'Game analysis'}
            </span>
            <span className="t-caption muted">
              {report?.move_count ? `${report.move_count} moves` : ''} · {report?.time_control || 'Rapid'}
            </span>
          </div>
          <p className="t-small muted mt-1">
            {report?.player_name || 'You'} vs {report?.opponent_name || 'Opponent'}
          </p>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={handleCopyShareLink}
            className="flex items-center gap-1.5 rounded-md border border-[var(--w-border)] bg-[var(--w-canvas)] px-3 py-1.5 text-xs font-medium text-[var(--w-ink1)] hover:bg-[var(--w-surface)] transition-all"
          >
            {isCopied ? (
              <>
                <Check className="w-3.5 h-3.5 text-green-600" />
                <span>Copied link!</span>
              </>
            ) : (
              <>
                <Share2 className="w-3.5 h-3.5" />
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
          <div className="w-full flex justify-center">
            <ChessboardView
              fen={activeFen}
              orientation={report?.player_color || 'white'}
              boardWidth={360}
            />
          </div>

          {/* Eval Sparkline */}
          <div className="card-box p-3 bg-[var(--w-surface)]">
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
            <div className="card-box bg-[var(--w-surface)] border-l-4 border-l-[var(--w-accent)]">
              <h1 className="t-display sm:text-2xl text-xl mb-2 text-[var(--w-ink1)]">
                {report.summary.headline}
              </h1>
              <p className="t-body leading-relaxed text-[var(--w-ink1)]">
                {report.summary.story}
              </p>
              <div className="mt-4 pt-3 border-t border-[var(--w-border)]">
                <span className="t-caption font-semibold uppercase tracking-wider text-[var(--w-accent)]">
                  Focus habit for next game
                </span>
                <p className="t-body-strong mt-0.5">{report.summary.focus_habit}</p>
              </div>
            </div>
          ) : (
            <div className="card-box bg-[var(--w-surface)] animate-pulse p-6">
              <div className="skeleton h-7 w-3/4 mb-3"></div>
              <div className="skeleton h-16 w-full mb-2"></div>
              <div className="skeleton h-6 w-1/2"></div>
            </div>
          )}

          {/* Moment Cards List */}
          <div className="flex flex-col gap-4">
            <h2 className="t-section text-sm font-semibold uppercase tracking-wider text-[var(--w-ink2)]">
              Decisive Moments ({moments.length})
            </h2>

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

          {/* Email Capture Section — plan: capture happens AFTER the report renders */}
          {status === 'completed' && (
          <div className="card-box mt-4 border border-[var(--w-border)]">
            <h3 className="t-section text-base mb-1">Want to keep this report?</h3>
            <p className="t-caption muted mb-4">
              Enter your email to receive a private link back to this analysis anytime.
            </p>

            {isEmailSent ? (
              <div className="rounded-md bg-green-50 p-3 text-sm text-green-800 flex items-center gap-2 border border-green-200">
                <Check className="w-4 h-4" />
                <span>Private access link sent to your email!</span>
              </div>
            ) : (
              <form onSubmit={handleSendEmail} className="flex gap-2">
                <input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="you@example.com"
                  className="flex-1 rounded-md border border-[var(--w-border)] bg-[var(--w-canvas)] px-3 py-2 text-sm text-[var(--w-ink1)] focus:border-[var(--w-accent)] focus:outline-none"
                />
                <button
                  type="submit"
                  className="rounded-md bg-[var(--w-accent)] px-4 py-2 text-sm font-medium text-[var(--w-on-accent)] hover:opacity-90 flex items-center gap-1.5"
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
