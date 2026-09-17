'use client';

import { use, useEffect, useRef, useState, type FormEvent } from 'react';
import Link from 'next/link';
import { ArrowRight, Check, Download, LoaderCircle, Share2 } from 'lucide-react';
import { API_BASE_URL, getReportById, normalizeReport, type ReportDetail } from '../../../lib/api';
import { DEMO_REPORT } from '../../../lib/demo-report';
import { captureEvent } from '../../../lib/posthog';
import { supabase } from '../../../lib/supabase';
import { SharedReportInteractiveView } from '../../../components/SharedReportInteractiveView';
import { AnalysisWaitState } from '../../../components/AnalysisWaitState';
import { saveRecentReview } from '../../../lib/recent-reviews';

const terminal = (status: string) => status === 'completed' || status === 'failed';
const stages: Record<string, string> = {
  pending: 'Your game is in the queue.',
  sweeping: 'Looking through your game.',
  verifying: 'Checking the important continuations.',
  explaining: 'Writing your lessons.',
};

export default function ReportPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  return <ReportSession key={id} id={id} />;
}

function ReportSession({ id }: { id: string }) {
  const isDemo = id === 'demo';
  const [report, setReport] = useState<ReportDetail | null>(isDemo ? DEMO_REPORT : null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [stalled, setStalled] = useState(false);
  const [retry, setRetry] = useState(0);
  const [shareMessage, setShareMessage] = useState('');
  const [shareUrl, setShareUrl] = useState('');
  const [email, setEmail] = useState('');
  const [emailBusy, setEmailBusy] = useState(false);
  const [emailSent, setEmailSent] = useState(false);
  const [emailError, setEmailError] = useState('');
  const engaged = useRef(false);
  const selected = useRef(new Set<number>());

  useEffect(() => { captureEvent('report_viewed', { report_id: id, is_demo: isDemo, is_shared: false }); }, [id, isDemo]);

  useEffect(() => {
    if (isDemo) return;
    let active = true;
    let done = false;
    let stream: EventSource | undefined;
    let watchdog: ReturnType<typeof setTimeout> | undefined;
    let polling: ReturnType<typeof setTimeout> | undefined;
    setLoadError(null);
    setStalled(false);
    const stop = () => { done = true; stream?.close(); clearTimeout(watchdog); clearTimeout(polling); };
    const activity = () => {
      clearTimeout(watchdog);
      if (!active || done) return;
      setStalled(false);
      watchdog = setTimeout(() => { if (active && !done) setStalled(true); }, 60000);
    };
    const accept = (data: ReportDetail) => {
      if (!active) return;
      setReport(data);
      setLoadError(null);
      if (terminal(data.status)) {
        stop();
        setStalled(false);
        if (data.status === 'completed' && !isDemo) {
          saveRecentReview({
            id: data.id,
            shareId: data.share_id,
            headline: data.summary?.headline,
            players: [data.player_name, data.opponent_name].filter(Boolean).join(' vs '),
            createdAt: data.created_at || new Date().toISOString(),
          });
        }
      } else {
        activity();
      }
    };
    // Periodic snapshots recover missed terminal events and blocked SSE connections.
    const poll = async () => {
      if (!active || done) return;
      try { accept(await getReportById(id)); } catch { /* Keep existing progress and offer recovery if disconnected. */ }
      if (active && !done) polling = setTimeout(poll, 12000);
    };
    const start = async () => {
      activity();
      try {
        const data = await getReportById(id);
        if (!active) return;
        accept(data);
        if (done) return;
        stream = new EventSource(API_BASE_URL + '/api/reports/' + encodeURIComponent(id) + '/events');
        stream.onmessage = event => {
          if (!active || done) return;
          activity();
          try {
            const update = JSON.parse(event.data);
            if (update.type === 'stage' && typeof update.status === 'string') {
              setReport(prev => prev ? { ...prev, status: update.status } : prev);
            } else if (update.type === 'moment' && update.moment) {
              setReport(prev => prev ? { ...prev, moments: [...prev.moments.filter(m => m.ply !== update.moment.ply), update.moment].sort((a, b) => a.ply - b.ply) } : prev);
            } else if (update.type === 'done' && update.report) {
              const normalized = normalizeReport({ ...update.report, status: 'completed', moments: update.report.moments ?? [] });
              setReport(prev => normalizeReport({ ...prev, ...normalized }));
              stop(); setStalled(false);
              if (!isDemo) {
                saveRecentReview({
                  id: normalized.id || id,
                  shareId: normalized.share_id,
                  headline: normalized.summary?.headline,
                  players: [normalized.player_name, normalized.opponent_name].filter(Boolean).join(' vs '),
                  createdAt: normalized.created_at || new Date().toISOString(),
                });
              }
            } else if (update.type === 'failed') {
              setReport(prev => prev ? { ...prev, status: 'failed' } : prev);
              stop(); setStalled(false);
            } else if (update.type === 'error') {
              setStalled(true);
            }
          } catch { /* Polling recovers malformed or interrupted stream updates. */ }
        };
        polling = setTimeout(poll, 12000);
      } catch (error) {
        if (active) setLoadError(error instanceof Error ? error.message : 'We couldn’t open this report.');
        stop();
      }
    };
    void start();
    return () => { active = false; stop(); };
  }, [id, isDemo, retry]);

  useEffect(() => {
    if (report?.status !== 'completed') return;
    const timer = setTimeout(() => {
      if (!engaged.current && document.visibilityState === 'visible') {
        engaged.current = true;
        captureEvent('report_engaged', { report_id: id, reason: 'completed_dwell_60s', is_demo: isDemo });
      }
    }, 60000);
    return () => clearTimeout(timer);
  }, [report?.status, id, isDemo]);

  async function downloadImageCard() {
    if (!report?.share_id && !isDemo) return;
    const imgUrl = isDemo ? '/opengraph-image' : `/r/${report?.share_id}/opengraph-image`;
    try {
      const res = await fetch(imgUrl);
      const blob = await res.blob();
      const blobUrl = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = blobUrl;
      a.download = `chessplain-review-${report?.share_id || 'demo'}.png`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(blobUrl);
      captureEvent('report_image_downloaded', { report_id: id });
    } catch {
      window.open(imgUrl, '_blank');
    }
  }

  async function share() {
    const url = window.location.origin + (isDemo ? '/report/demo' : '/r/' + report?.share_id);
    const title = report?.summary?.headline || 'My Chessplain Game Review';
    if (typeof navigator !== 'undefined' && navigator.share) {
      try {
        await navigator.share({
          title,
          text: report?.summary?.headline ? `"${report.summary.headline}"` : 'Check out my game review on Chessplain',
          url,
        });
        captureEvent('report_shared', { report_id: id, is_demo: isDemo, method: 'web_share' });
        return;
      } catch {
        // User dismissed share dialog
      }
    }
    setShareMessage('');
    try {
      await navigator.clipboard.writeText(url);
      setShareMessage('Review link copied to clipboard.');
      captureEvent('report_shared', { report_id: id, is_demo: isDemo, method: 'clipboard' });
    } catch {
      setShareUrl(url);
      setShareMessage('Copy the link below to share this review.');
    }
  }

  async function sendEmail(event: FormEvent) {
    event.preventDefault();
    if (emailBusy) return;
    setEmailBusy(true); setEmailError('');
    try {
      const { error } = await supabase.auth.signInWithOtp({
        email: email.trim(),
        options: { emailRedirectTo: window.location.origin + '/auth/callback?report_id=' + encodeURIComponent(id) },
      });
      if (error) throw error;
      setEmailSent(true);
      captureEvent('email_saved', { report_id: id });
    } catch (error) {
      setEmailError(error instanceof Error ? error.message : 'We couldn’t send the email. Please try again.');
    } finally { setEmailBusy(false); }
  }

  if (loadError || report?.status === 'failed') return <div className="page-width py-16 max-w-2xl">
    <h1 className="t-display mb-5">{loadError ? 'We couldn’t open this review.' : 'This game couldn’t be reviewed.'}</h1>
    <p className="t-body text-[var(--w-ink2)] mb-7">{loadError || 'The analysis did not finish. You can submit the game again; failed analyses do not use your free allowance.'}</p>
    <div className="flex flex-wrap gap-3">{loadError ? <button className="primary-button" onClick={() => setRetry(n => n + 1)}>Check again</button> : <Link className="primary-button" href="/#analyze">Try the game again</Link>}<Link className="secondary-button" href="/report/demo">Read a sample</Link></div>
  </div>;

  const complete = report?.status === 'completed';
  const hasMoments = (report?.moments?.length || 0) > 0;

  if (!complete && !hasMoments) {
    return (
      <AnalysisWaitState
        status={report?.status || 'pending'}
        stalled={stalled}
        onRetry={() => setRetry(n => n + 1)}
        playerNames={[report?.player_name, report?.opponent_name].filter(Boolean).join(' vs ')}
      />
    );
  }

  return <>
    {!complete && hasMoments && (
      <div className="page-width pt-9" role="status" aria-live="polite">
        <div className="flex items-center gap-3 text-sm">
          <LoaderCircle className="spin text-[var(--w-accent)]" size={18} />
          <p>{stages[report?.status || 'pending']} Early moments are ready below.</p>
        </div>
      </div>
    )}
    {report ? <SharedReportInteractiveView report={report} isOwner actions={complete && (
      <div className="flex items-center gap-3">
        <button className="text-link" onClick={downloadImageCard}><Download size={15} />Save card</button>
        <button className="text-link" onClick={share}><Share2 size={15} />Share review</button>
      </div>
    )} onSelectMoment={index => {
      selected.current.add(index);
      captureEvent('moment_expanded', { report_id: id, moment_index: index, is_demo: isDemo });
      if (selected.current.size >= 2 && !engaged.current) { engaged.current = true; captureEvent('report_engaged', { report_id: id, reason: 'moments_selected_2', is_demo: isDemo }); }
    }}>
      {shareMessage && <p className="mt-5 text-sm text-[var(--w-accent)]" role="status">{shareMessage}</p>}
      {shareUrl && <input className="email-input mt-3" aria-label="Shareable review link" readOnly value={shareUrl} onFocus={event => event.target.select()} />}
      {complete && !isDemo && <section className="mt-10 flex flex-col gap-7 sm:flex-row sm:justify-between">
        <div className="max-w-md"><h2 className="t-heading text-2xl">Keep this lesson close.</h2><p className="mt-2 mb-4 text-sm leading-relaxed text-[var(--w-ink2)]">Send yourself a sign-in link that brings you back to this review.</p>
          {emailSent ? <p role="status" className="flex items-center gap-2 text-sm text-[var(--w-accent)]"><Check size={16} />Check your inbox. Open the link in this browser.</p> : <form onSubmit={sendEmail} className="flex flex-wrap gap-2"><label className="sr-only" htmlFor="save-email">Email address</label><input id="save-email" className="email-input flex-1 min-w-0" type="email" autoComplete="email" value={email} onChange={e => setEmail(e.target.value)} placeholder="you@example.com" required disabled={emailBusy} /><button className="primary-button" disabled={emailBusy}>{emailBusy ? 'Sending…' : 'Email me a link'}</button></form>}
          {emailError && <p className="form-error mt-3" role="alert">{emailError}</p>}
        </div><Link href="/#analyze" className="text-link self-start">Review another game <ArrowRight size={16} /></Link>
      </section>}
    </SharedReportInteractiveView> : <AnalysisWaitState status="pending" stalled={stalled} onRetry={() => setRetry(n => n + 1)} />}
  </>;
}
