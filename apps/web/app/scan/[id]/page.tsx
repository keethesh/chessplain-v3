'use client';

import { use, useEffect, useRef, useState, type CSSProperties } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { ViewTransition } from 'react';
import { Gremlin } from '../../../components/Gremlin';
import { ScanForm, explainScanError, type ScanProblem } from '../../../components/ScanForm';
import {
  ApiError, checkinScan, claimScan, getScan, startScan, submitReport,
  type Checkin, type ConceptId, type ScanDetail, type ScanGame,
} from '../../../lib/api';
import { GREMLINS } from '../../../lib/gremlins';
import { invalidateMe, useMe } from '../../../lib/use-session';
import './scan.css';
import '../../../components/view-transition.css';

const LETTER = { win: 'W', loss: 'L', draw: 'D' } as const;
const TIME = { rapid: 'Rapid', blitz: 'Blitz', daily: 'Daily' } as const;
const CHECKIN: Record<Checkin['answer'], string> = {
  remembered: 'You remembered the check.',
  forgot: 'You forgot the check.',
  did_not_come_up: 'It didn’t come up.',
};

function shortDate(iso: string): string {
  const t = Date.parse(iso);
  return Number.isNaN(t) ? '' : new Intl.DateTimeFormat('en-GB', { day: 'numeric', month: 'short', timeZone: 'UTC' }).format(t);
}

function slipConcept(game: ScanGame): ConceptId | null {
  let best: { id: ConceptId; swing: number } | null = null;
  for (const point of game.turning_points) {
    if (!point.concept_id) continue;
    const swing = Math.abs(point.eval_swing);
    if (!best || swing > best.swing) best = { id: point.concept_id, swing };
  }
  return best?.id ?? null;
}

function statusLine(scan: ScanDetail | null, missing: boolean): string {
  if (missing) return 'Can’t find that scan.';
  if (!scan || scan.status === 'pending' || scan.status === 'fetching') return 'Chessplain is reading your games…';
  if (scan.status === 'failed') return 'Oops, Chess.com didn’t answer.';
  if (scan.status !== 'completed' || !scan.result) {
    const total = scan.progress.total || scan.games.length;
    return `Chessplain is reading your games… ${scan.progress.done} of ${total} so far.`;
  }
  const top = scan.result.top;
  if (scan.result.nothing_decisive || !top) return 'Nothing decisive. Nice!';
  if (!top.recurring) return `No gremlin showed up twice yet. Closest: ${top.concept.gremlin} in ${top.games_with_concept} ${top.games_with_concept === 1 ? 'game' : 'games'}.`;
  return `Found it! ${top.concept.gremlin} showed up in ${top.games_with_concept} of ${scan.result.games_scanned}.`;
}

function Heading({ level, ...props }: { level: 1 | 2; className?: string; id?: string; children: React.ReactNode }) {
  return level === 1 ? <h1 {...props} /> : <h2 {...props} />;
}

/** The ten game slips: live progress while scanning, then the evidence under the result. */
function Slips({ scan, totalSlots, focus }: { scan: ScanDetail | null; totalSlots: number; focus?: ConceptId }) {
  return (
    <ol className="scan-slips" data-focus={focus ? 'true' : undefined}>
      {Array.from({ length: totalSlots }, (_, index) => {
        const game = scan?.games[index];
        if (!game) {
          return (
            <li key={`sk-${index}`} className="scan-slip" aria-hidden="true" style={{ '--i': index } as CSSProperties}>
              <span className="skeleton scan-skel--chip" />
              <span className="skeleton scan-skel" />
              <span className="skeleton scan-skel" style={{ width: '55%' }} />
            </li>
          );
        }
        const concept = game.analyzed ? slipConcept(game) : null;
        const points = game.turning_points.length;
        const hit = focus ? game.turning_points.some((point) => point.concept_id === focus) : false;
        return (
          <li key={game.url} className="scan-slip" data-hit={hit ? 'true' : undefined} style={{ '--i': index } as CSSProperties}>
            <span className="result-chip" data-result={game.outcome}>{LETTER[game.outcome]}</span>
            <span className="scan-opp">vs {game.opponent}</span>
            <span className="small muted">{TIME[game.time_class]} · {shortDate(game.ended_at)}</span>
            <span className="small">{game.analyzed ? (points ? `${points} turning ${points === 1 ? 'point' : 'points'}` : 'Nothing decisive') : 'Reading…'}</span>
            {concept && (
              <span className="scan-sticker">
                <Gremlin concept={hit && focus ? focus : concept} size={64} label={`${GREMLINS[hit && focus ? focus : concept].name} showed up`} />
              </span>
            )}
          </li>
        );
      })}
    </ol>
  );
}

export default function ScanPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  return <Scan key={id} id={id} />;
}

function Scan({ id }: { id: string }) {
  const router = useRouter();
  const { ready, signedIn, session } = useMe();
  const [scan, setScan] = useState<ScanDetail | null>(null);
  const [missing, setMissing] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [checkinHidden, setCheckinHidden] = useState(false);
  const [checkinError, setCheckinError] = useState<string | null>(null);
  const [checkinBusy, setCheckinBusy] = useState(false);
  const [retryProblem, setRetryProblem] = useState<ScanProblem | null>(null);
  const [retryBusy, setRetryBusy] = useState(false);
  const [reviewBusy, setReviewBusy] = useState<string | null>(null);
  const [reviewError, setReviewError] = useState<string | null>(null);
  const claimed = useRef(false);

  useEffect(() => {
    let active = true;
    let timer = 0;
    async function tick() {
      let again = true;
      try {
        const data = await getScan(id);
        if (!active) return;
        setScan(data);
        setMissing(false);
        setLoadError(null);
        again = data.status !== 'completed' && data.status !== 'failed';
      } catch (err) {
        if (!active) return;
        if (err instanceof ApiError && err.status === 404) { setMissing(true); return; }
        setLoadError(err instanceof ApiError && err.message.includes(' ') ? err.message : 'We couldn’t reach Chessplain. Check your connection and try again.');
      }
      if (active && again) timer = window.setTimeout(tick, 1200);
    }
    tick();
    return () => { active = false; window.clearTimeout(timer); };
  }, [id]);

  useEffect(() => {
    if (!session?.access_token || scan?.status !== 'completed' || claimed.current) return;
    claimed.current = true;
    claimScan(id, session.access_token).then(() => invalidateMe()).catch(() => { /* already claimed, or not this player */ });
  }, [session?.access_token, scan?.status, id]);

  async function answer(value: Checkin['answer']) {
    if (!scan?.previous || checkinBusy) return;
    setCheckinBusy(true);
    setCheckinError(null);
    try {
      const { checkin } = await checkinScan(id, { concept_id: scan.previous.concept.id, answer: value }, session?.access_token);
      setScan((current) => current ? { ...current, checkin } : current);
    } catch (err) {
      if (err instanceof ApiError && err.status === 403) setCheckinHidden(true);
      else setCheckinError('We couldn’t save that. Try again.');
    } finally {
      setCheckinBusy(false);
    }
  }

  async function tryAgain() {
    if (!scan || retryBusy) return;
    setRetryBusy(true);
    setRetryProblem(null);
    try {
      const res = await startScan(scan.chesscom_username, session?.access_token);
      invalidateMe();
      router.push('/scan/' + res.id, { transitionTypes: ['nav-forward'] });
    } catch (err) {
      setRetryProblem(explainScanError(err, signedIn, null));
      setRetryBusy(false);
    }
  }

  async function reviewGame(url: string) {
    if (!scan || reviewBusy) return;
    setReviewBusy(url);
    setReviewError(null);
    try {
      const res = await submitReport({ chesscom_username: scan.chesscom_username, chesscom_game_url: url }, session?.access_token);
      invalidateMe();
      router.push('/report/' + res.id, { transitionTypes: ['nav-forward'] });
    } catch (err) {
      setReviewError(err instanceof ApiError && err.status === 402
        ? 'You’ve used your free reviews for this week.'
        : err instanceof ApiError && err.message.includes(' ') ? err.message : 'We couldn’t open that game. Try again.');
      setReviewBusy(null);
    }
  }

  if (missing) {
    return (
      <div className="page scan">
        <h1 className="h1">Can’t find that scan.</h1>
        <p className="lede">The link may be wrong. Start a new one and we’ll read your last 10 games.</p>
        <Link className="btn" href="/#scan">Find my gremlin <span className="arrow" aria-hidden="true">→</span></Link>
      </div>
    );
  }

  const done = scan?.status === 'completed';
  const failed = scan?.status === 'failed';
  const result = scan?.result ?? null;
  const top = result?.top ?? null;
  const quiet = Boolean(done && result && (result.nothing_decisive || !top));
  const showCheckin = Boolean(done && scan?.previous && !checkinHidden);
  const totalSlots = scan
    ? Math.max(scan.progress.total || 0, scan.games.length, scan.status === 'pending' || scan.status === 'fetching' ? 10 : 0)
    : 10;
  const others = result && top ? result.concept_counts.filter((row) => row.concept_id !== top.concept.id) : [];
  const examplePly = result?.example?.ply;
  const exampleHref = scan?.example_report_id
    ? `/report/${scan.example_report_id}${examplePly != null ? `?focus=${examplePly}` : ''}`
    : null;

  return (
    <div className="page scan">
      {(!scan || scan.status === 'pending' || scan.status === 'fetching' || scan.status === 'analyzing') && (
        <h1 className="h2 scan-lead" role="status">{statusLine(scan, false)}</h1>
      )}
      {loadError && <p className="field-note" data-tone="error" role="alert">{loadError}</p>}

      {showCheckin && scan?.previous && (
        <section className={scan.checkin ? 'panel bg-concept scan-checkin' : 'surface scan-checkin'} data-concept={scan.checkin ? scan.previous.concept.id : undefined} aria-labelledby="checkin-title">
          <h1 className="h2" id="checkin-title">Did it come up?</h1>
          <p>Last time it was <span translate="no">{scan.previous.concept.gremlin}</span>.</p>
          {scan.checkin ? (
            <p className="display display--extruded" role="status">{CHECKIN[scan.checkin.answer]}</p>
          ) : (
            <>
              <p className="big">In these games, did you remember the check?</p>
              <div className="scan-checkin-actions" role="group" aria-label="Did you remember the check?">
                <button className="btn btn--key" type="button" disabled={checkinBusy} onClick={() => answer('remembered')}>Remembered</button>
                <button className="btn btn--key" type="button" disabled={checkinBusy} onClick={() => answer('forgot')}>Forgot</button>
                <button className="btn btn--key" type="button" disabled={checkinBusy} onClick={() => answer('did_not_come_up')}>Didn’t come up</button>
              </div>
              {checkinError && <p className="field-note" data-tone="error" role="alert">{checkinError}</p>}
            </>
          )}
        </section>
      )}

      {!scan || scan.status === 'pending' || scan.status === 'fetching' || scan.status === 'analyzing' ? (
        <section className="surface" aria-busy={!done}>
          <p className="muted scan-reassure">About a minute. Leave this page open.</p>
          <Slips scan={scan} totalSlots={totalSlots} />
        </section>
      ) : null}

      {(failed || (done && !result)) && scan && (
        <section className="surface" aria-labelledby="fail-title">
          <h1 className="h1" id="fail-title">{failed ? 'Oops, Chess.com didn’t answer. Try again?' : 'This scan finished without a result.'}</h1>
          <p className="lede">Your username is still <span className="move" translate="no">{scan.chesscom_username}</span>.</p>
          <button className="btn" type="button" onClick={tryAgain} disabled={retryBusy}>Try again</button>
          {retryProblem && (
            <p className="field-note" data-tone="error" role="alert">
              {retryProblem.text}
              {retryProblem.href && <> <Link href={retryProblem.href}>{retryProblem.hrefLabel}</Link></>}
            </p>
          )}
        </section>
      )}

      {done && result && top && !result.nothing_decisive && scan ? (
        <>
          <section className={`panel bg-concept scan-reveal${top.recurring ? ' is-hit' : ''}`} data-concept={top.concept.id} aria-labelledby="result-title">
            <div className="scan-reveal-copy">
              {top.recurring && <p className="display display--extruded scan-found" aria-hidden="true">Found it!</p>}
              <Heading level={showCheckin ? 2 : 1} className="h1 scan-claim" id="result-title">
                {top.recurring
                  ? <><span translate="no">{top.concept.gremlin}</span> showed up in <span className="scan-count">{top.games_with_concept} of {result.games_scanned}</span> games.</>
                  : <>No gremlin showed up twice yet.</>}
              </Heading>
              <p className="lede">
                {top.recurring
                  ? <><strong>{top.concept.name}.</strong> {top.concept.definition}</>
                  : <><span translate="no">{top.concept.gremlin}</span> came closest, in {top.games_with_concept} game. {top.concept.name}: {top.concept.definition.toLowerCase()}</>}
              </p>
              <figure className="scan-habit">
                <figcaption className="label">Your check for the next game</figcaption>
                <blockquote>{top.concept.habit}</blockquote>
              </figure>
              <div className="scan-actions">
                {exampleHref
                  ? <Link className="btn" href={exampleHref} transitionTypes={['nav-forward']}>See it in your game <span className="arrow" aria-hidden="true">→</span></Link>
                  : <button className="btn" type="button" onClick={() => { getScan(id).then(setScan).catch(() => setLoadError('We couldn’t reach Chessplain. Check your connection and try again.')); }}>Check for the example</button>}
                {ready && !signedIn && (
                  <Link className="btn btn--key" href={`/login?next=${encodeURIComponent(`/scan/${id}`)}`}>Sign in to keep tracking it</Link>
                )}
              </div>
              {!exampleHref && <p className="small muted">The example game is still being written. It takes about 20 seconds.</p>}
            </div>
            <ViewTransition name={`gremlin-${top.concept.id}`} share="morph" default="none">
              <div className="scan-gremlin">
                <Gremlin concept={top.concept.id} size={380} priority label={top.concept.gremlin} />
              </div>
            </ViewTransition>
          </section>

          <section className="scan-evidence" data-concept={top.concept.id} aria-labelledby="evidence-title">
            <div className="scan-evidence-head">
              <h2 className="h3" id="evidence-title">The {result.games_scanned} games we read</h2>
              {others.length > 0 && (
                <p className="small muted">Also spotted: {others.map((row) => `${GREMLINS[row.concept_id].name} (${row.games} ${row.games === 1 ? 'game' : 'games'})`).join(', ')}.</p>
              )}
            </div>
            <Slips scan={scan} totalSlots={scan.games.length} focus={top.concept.id} />
          </section>
        </>
      ) : null}

      {quiet && scan && (
        <section className="surface" aria-labelledby="quiet-title">
          {showCheckin
            ? <h2 className="h1" id="quiet-title">Nothing decisive. Nice!</h2>
            : <h1 className="h1" id="quiet-title">Nothing decisive. Nice!</h1>}
          <p className="lede">Nothing here turned a game. Play a few more, then scan again. Or open one game below.</p>
          <ScanForm id="scan-again" initial={scan.chesscom_username} submitLabel="Scan again" note="Same username. New games when you’ve played them." />
          {reviewError && <p className="field-note" data-tone="error" role="alert">{reviewError} {reviewError.includes('free reviews') && <Link href={signedIn ? '/pricing' : '/login?next=' + encodeURIComponent(`/scan/${id}`)}>{signedIn ? 'See Premium' : 'Sign in'}</Link>}</p>}
          <ol className="scan-games">
            {scan.games.map((game) => (
              <li key={game.url}>
                <button type="button" onClick={() => reviewGame(game.url)} disabled={reviewBusy !== null}>
                  <span className="result-chip" data-result={game.outcome}>{LETTER[game.outcome]}</span>
                  <span>
                    <span className="scan-opp">vs {game.opponent}</span>
                    <span className="small muted"> {TIME[game.time_class]} · {shortDate(game.ended_at)}</span>
                  </span>
                  <span className="label">{reviewBusy === game.url ? 'Starting…' : 'Review this game'}</span>
                </button>
              </li>
            ))}
          </ol>
          {ready && !signedIn && (
            <p className="big scan-next">Sign in to keep this scan. <Link href={`/login?next=${encodeURIComponent(`/scan/${id}`)}`}>Sign in</Link></p>
          )}
        </section>
      )}
    </div>
  );
}
