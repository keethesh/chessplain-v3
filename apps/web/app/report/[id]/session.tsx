'use client';

import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { API_BASE_URL, ApiError, claimReport, getReportById, listChessComGames, normalizeReport, startScan, submitReport, type ChessComGameSummary, type ReportDetail } from '../../../lib/api';
import { DEMO_REPORT } from '../../../lib/demo-report';
import { captureEvent } from '../../../lib/posthog';
import { invalidateMe, useMe } from '../../../lib/use-session';
import { saveRecentReview } from '../../../lib/recent-reviews';
import { AnalysisWaitState } from '../../../components/AnalysisWaitState';
import { SharedReportInteractiveView, chesscomIdentity, sameGame } from '../../../components/SharedReportInteractiveView';

const terminal = (status: string) => status === 'completed' || status === 'failed';
const stages: Record<string, string> = {
  pending: 'Reading the game.',
  sweeping: 'Reading the game.',
  verifying: 'Checking the turning points.',
  explaining: 'Writing the explanation.',
};

export function ReportSession({ id, focusPly }: { id: string; focusPly?: number }) {
  const { session, me } = useMe();
  const isDemo = id === 'demo';
  const [report, setReport] = useState<ReportDetail | null>(isDemo ? DEMO_REPORT : null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [missing, setMissing] = useState(false);
  const [stalled, setStalled] = useState(false);
  const [retry, setRetry] = useState(0);
  const [actionError, setActionError] = useState('');
  const [busy, setBusy] = useState(false);
  const engaged = useRef(false);
  const selected = useRef(new Set<number>());
  const claiming = useRef(false);

  useEffect(() => { captureEvent('report_viewed', { report_id: id, is_demo: isDemo, is_shared: false }); }, [id, isDemo]);
  useEffect(() => { if (!isDemo && report?.status === 'completed') invalidateMe(); }, [isDemo, report?.status]);

  useEffect(() => {
    if (isDemo || claiming.current || !session || !me || report?.status !== 'completed') return;
    if (me.reviews.some(review => review.id === id)) return;
    claiming.current = true;
    claimReport(id, session.access_token).then(() => invalidateMe()).catch(() => { claiming.current = false; });
  }, [isDemo, session, me, report?.status, id]);

  useEffect(() => {
    if (isDemo) return;
    let active = true;
    let done = false;
    let stream: EventSource | undefined;
    let watchdog: ReturnType<typeof setTimeout> | undefined;
    let polling: ReturnType<typeof setTimeout> | undefined;
    setLoadError(null);
    setMissing(false);
    setStalled(false);
    const stop = () => { done = true; stream?.close(); clearTimeout(watchdog); clearTimeout(polling); };
    const activity = () => {
      clearTimeout(watchdog);
      if (!active || done) return;
      setStalled(false);
      watchdog = setTimeout(() => { if (active && !done) setStalled(true); }, 60000);
    };
    const remember = (data: ReportDetail) => {
      if (data.status !== 'completed' || isDemo) return;
      saveRecentReview({
        id: data.id || id,
        shareId: data.share_id,
        headline: data.summary?.headline,
        players: [data.player_name, data.opponent_name].filter(Boolean).join(' vs '),
        createdAt: data.created_at || new Date().toISOString(),
      });
    };
    const accept = (data: ReportDetail) => {
      if (!active) return;
      setReport(data);
      setLoadError(null);
      if (terminal(data.status)) {
        stop();
        setStalled(false);
        remember(data);
      } else {
        activity();
      }
    };
    const poll = async () => {
      if (!active || done) return;
      try { accept(await getReportById(id)); } catch { /* Keep the last snapshot; the stall note offers a reconnect. */ }
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
              stop();
              setStalled(false);
              remember(normalized.id ? normalized : { ...normalized, id });
            } else if (update.type === 'failed') {
              setReport(prev => prev ? { ...prev, status: 'failed' } : prev);
              stop();
              setStalled(false);
            }
          } catch { /* Polling recovers a broken event. */ }
        };
        polling = setTimeout(poll, 12000);
      } catch (error) {
        if (active) {
          setMissing(error instanceof ApiError && error.status === 404);
          setLoadError(error instanceof Error ? error.message : 'We couldn’t open this report.');
        }
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

  async function tryAgain() {
    if (!report || busy) return;
    setBusy(true);
    setActionError('');
    const { username, gameUrl } = chesscomIdentity(report, me);
    try {
      const token = session?.access_token;
      const res = username
        ? await submitReport({ chesscom_username: username, ...(gameUrl ? { chesscom_game_url: gameUrl } : {}) }, token)
        : report.source_games?.pgn
          ? await submitReport({ pgn: report.source_games.pgn, player_color: report.player_color }, token)
          : null;
      if (!res || res.id === id) {
        setReport(null);
        setRetry(n => n + 1);
      } else {
        window.location.assign('/report/' + res.id);
      }
    } catch (error) {
      setActionError(error instanceof ApiError && error.status === 402
        ? (session ? 'You have used your free reviews for this week.' : 'You have used the free reviews for this network. Sign in to use your own.')
        : error instanceof Error ? error.message : 'That did not work. Try again in a moment.');
    } finally {
      setBusy(false);
    }
  }

  if (loadError || report?.status === 'failed') {
    return (
      <div className="page report-missing">
        <h1 className="h2">{missing ? 'This review isn’t available.' : report?.status === 'failed' ? 'This game couldn’t be reviewed.' : 'We couldn’t open this review.'}</h1>
        <p className="lede">{missing ? 'The link may be wrong.' : report?.status === 'failed' ? 'The analysis stopped before it finished. A failed review does not use your free allowance.' : loadError}</p>
        {actionError && <p className="field-note" data-tone="error" role="alert">{actionError}</p>}
        {missing ? <Link className="btn" href="/#scan">Find your own gremlin</Link>
          : report?.status === 'failed'
            ? <button type="button" className="btn" onClick={tryAgain} disabled={busy}>{busy ? 'Trying…' : 'Try again'}</button>
            : <button type="button" className="btn" onClick={() => setRetry(n => n + 1)}>Check again</button>}
      </div>
    );
  }

  const complete = report?.status === 'completed';
  const hasMoments = (report?.moments.length ?? 0) > 0;
  if (!report || (!complete && !hasMoments)) {
    return (
      <AnalysisWaitState
        status={report?.status || 'pending'}
        stalled={stalled}
        onRetry={() => setRetry(n => n + 1)}
        playerNames={[report?.player_name, report?.opponent_name].filter(Boolean).join(' vs ')}
      />
    );
  }

  return (
    <SharedReportInteractiveView
      report={report}
      mode={isDemo ? 'demo' : 'owner'}
      focusPly={focusPly}
      progressNote={!complete ? (stages[report.status] ?? 'Reading the game.') : undefined}
      onMoment={index => {
        selected.current.add(index);
        captureEvent('moment_expanded', { report_id: id, moment_index: index, is_demo: isDemo });
        if (selected.current.size >= 2 && !engaged.current) {
          engaged.current = true;
          captureEvent('report_engaged', { report_id: id, reason: 'moments_selected_2', is_demo: isDemo });
        }
      }}
    >
      <ReportNext report={report} id={id} />
    </SharedReportInteractiveView>
  );
}

function ReportNext({ report, id }: { report: ReportDetail; id: string }) {
  const router = useRouter();
  const { session, me, ready } = useMe();
  const { username, gameUrl } = chesscomIdentity(report, me);
  const [games, setGames] = useState<ChessComGameSummary[] | null>(null);
  const [error, setError] = useState('');
  const [pricing, setPricing] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const [gamesAttempt, setGamesAttempt] = useState(0);

  useEffect(() => {
    if (!username) return;
    let active = true;
    listChessComGames(username)
      .then(rows => { if (active) setGames(rows); })
      .catch(err => { if (active) setError(err instanceof Error ? err.message : 'We couldn’t load recent games.'); });
    return () => { active = false; };
  }, [username, gamesAttempt]);

  async function review(url: string) {
    if (!username || busy) return;
    setBusy(url); setError(''); setPricing(false);
    try {
      const res = await submitReport({ chesscom_username: username, chesscom_game_url: url }, session?.access_token);
      if (res.id === id) router.refresh();
      else router.push('/report/' + res.id);
    } catch (err) {
      setPricing(err instanceof ApiError && err.status === 402 && Boolean(session));
      setError(err instanceof ApiError && err.status === 402
        ? (session ? 'You have used your free reviews for this week.' : 'You have used the free reviews for this network. Sign in to use your own.')
        : err instanceof Error ? err.message : 'That did not work. Try again in a moment.');
      setBusy(null);
    }
  }

  async function scan() {
    if (!username || busy) return;
    setBusy('scan'); setError(''); setPricing(false);
    try {
      const res = await startScan(username, session?.access_token);
      router.push('/scan/' + res.id);
    } catch (err) {
      setPricing(err instanceof ApiError && err.status === 402 && Boolean(session));
      setError(err instanceof ApiError && err.status === 402
        ? (session ? 'You have used your free scans for this week.' : 'You have used the free scans for this network. Sign in to use your own.')
        : err instanceof Error ? err.message : 'That did not work. Try again in a moment.');
      setBusy(null);
    }
  }

  return (
    <section className="report-end">
      {username ? (
        <>
          <h2 className="h2">Your next games.</h2>
          {games === null && !error && (
            <div className="report-skeletons" role="status" aria-label="Loading recent games">
              <div className="skeleton" /><div className="skeleton" /><div className="skeleton" />
            </div>
          )}
          {games && games.length === 0 && <p>No recent rapid, blitz or daily games.</p>}
          {games && games.length > 0 && (
            <div className="report-games">
              {games.map(game => {
                const current = Boolean(gameUrl && sameGame(game.url, gameUrl));
                const played = new Date(game.endedAt);
                const when = Number.isNaN(played.getTime()) ? '' : new Intl.DateTimeFormat('en-GB', { day: 'numeric', month: 'short', year: 'numeric' }).format(played);
                return (
                  <div key={game.url} className="report-game" data-current={current ? 'true' : undefined}>
                    <span className="result-chip" data-result={game.outcome}>{game.outcome === 'win' ? 'W' : game.outcome === 'loss' ? 'L' : 'D'}</span>
                    <div>
                      <p className="report-game-who">{game.opponent}{game.opponentRating != null ? ` (${game.opponentRating})` : ''}</p>
                      <p className="report-game-meta muted small">{game.timeClass}{when ? ` · ${when}` : ''}</p>
                    </div>
                    {current
                      ? <span className="tag">This game</span>
                      : <button type="button" className="btn btn--sm" disabled={busy !== null} onClick={() => review(game.url)}>{busy === game.url ? 'Opening…' : 'Review this game'}</button>}
                  </div>
                );
              })}
            </div>
          )}
          <button type="button" className="btn" disabled={busy !== null} onClick={scan}>{busy === 'scan' ? 'Starting…' : 'Scan your last 10 again'}</button>
        </>
      ) : (
        <>
          <h2 className="h2">Find your own gremlin.</h2>
          <Link className="btn" href="/#scan">Scan your last 10</Link>
        </>
      )}
      {ready && !session && <Link className="btn btn--key" href={`/login?next=${encodeURIComponent('/report/' + id)}`}>Sign in to keep this review</Link>}
      {error && (
        <p className="field-note" data-tone="error" role="alert">
          {error}{' '}
          {games === null && <button type="button" className="btn btn--quiet" onClick={() => { setError(''); setGamesAttempt(n => n + 1); }}>Try again</button>}
          {pricing && <> <Link href="/pricing">See pricing</Link></>}
        </p>
      )}
    </section>
  );
}
