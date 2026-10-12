'use client';

import { useEffect, useState, type CSSProperties, type FormEvent } from 'react';
import dynamic from 'next/dynamic';
import Link from 'next/link';
import { ViewTransition } from 'react';
import { Gremlin } from '../components/Gremlin';
import { Reveal } from '../components/Reveal';
import { ScanForm } from '../components/ScanForm';
import { DEMO_REPORT } from '../lib/demo-report';
import { GREMLIN_ORDER, GREMLINS } from '../lib/gremlins';
import { captureEvent } from '../lib/posthog';
import { saveChesscomUsername, useMe } from '../lib/use-session';
import { ApiError, CHESSCOM_USERNAME_RE, getScan, type Checkin, type Me, type MeReview, type ScanGame } from '../lib/api';
import './home.css';
import '../components/view-transition.css';

const HomeTry = dynamic(() => import('../components/HomeTry').then((mod) => mod.HomeTry), {
  loading: () => <div className="home-try" aria-busy="true"><div className="skeleton home-try-fallback" /></div>,
});

const MOMENT = DEMO_REPORT.moments[0];

// Labelled sample. Counts in the verdict are derived from this list.
const SAMPLE = [
  { opp: 'knightowl_92', result: 'loss', time: '10 min', hit: true },
  { opp: 'mateo.plays', result: 'win', time: '10 min', hit: false },
  { opp: 'Ravenclawed', result: 'loss', time: '15 | 10', hit: true },
  { opp: 'petra_k', result: 'draw', time: '10 min', hit: false },
  { opp: 'sicilian_sam', result: 'win', time: '10 min', hit: false },
  { opp: 'b4_or_bust', result: 'loss', time: '5 min', hit: true },
  { opp: 'lu.chess', result: 'win', time: '10 min', hit: false },
  { opp: 'Grandpa_Gambit', result: 'loss', time: '10 min', hit: false },
  { opp: 'quietqueen', result: 'win', time: '15 | 10', hit: false },
  { opp: 'tomasz_e4', result: 'win', time: '10 min', hit: false },
] as const;

const LETTER = { win: 'W', loss: 'L', draw: 'D' } as const;
const CHECKIN: Record<Checkin['answer'], string> = {
  remembered: 'You remembered the check.',
  forgot: 'You forgot the check.',
  did_not_come_up: 'It didn’t come up.',
};

function shortDate(iso: string): string {
  const t = Date.parse(iso);
  return Number.isNaN(t) ? '' : new Intl.DateTimeFormat('en-GB', { day: 'numeric', month: 'short', timeZone: 'UTC' }).format(t);
}

function scanTitle(scan: Me['scans'][number]): string {
  if (scan.status === 'failed') return 'Didn’t finish';
  if (scan.status !== 'completed') return 'Reading';
  return scan.top_concept_id ? GREMLINS[scan.top_concept_id].name : 'Nothing decisive';
}

function reviewTitle(review: MeReview): string {
  if (review.headline) return review.headline;
  return review.status === 'failed' ? 'This review didn’t finish' : 'Review in progress';
}

function allowanceNote(me: Me): string | undefined {
  const slot = me.scan_allowance;
  if (me.tier === 'premium' || !slot) return undefined;
  const left = Math.max(0, slot.limit - slot.used);
  if (left === 0) {
    return slot.next_slot_at
      ? `No free scans left this week. The next one frees up ${shortDate(slot.next_slot_at)}.`
      : 'No free scans left this week.';
  }
  return `${left} of ${slot.limit} free scans left this week.`;
}

function Anonymous() {
  const hits = SAMPLE.filter((game) => game.hit).length;
  return (
    <div className="page home">
      <section className="home-hero">
        <div className="home-hero-stage">
          <h1 className="display home-hero-title">
            <span className="home-line home-line--lead">
              <span className="home-word" style={{ '--i': 0 } as CSSProperties}>Your</span>{' '}
              <span className="home-word" style={{ '--i': 1 } as CSSProperties}>chess</span>
            </span>
            <span className="home-line">
              <span className="home-word" style={{ '--i': 2 } as CSSProperties}>has</span>{' '}
              <span className="home-word" style={{ '--i': 3 } as CSSProperties}>a</span>
              <span className="home-walker" aria-hidden="true">
                <Gremlin concept="hanging_piece" size={160} priority />
              </span>
            </span>
            <span className="home-line">
              <span className="home-word hl" style={{ '--i': 4 } as CSSProperties}>gremlin.</span>
            </span>
          </h1>
        </div>
        <div className="home-hero-foot">
          <p className="lede">Chessplain reads your last 10 Chess.com games and finds the mistake that keeps costing you. Then it shows you where, on the board.</p>
          <ScanForm id="scan" />
        </div>
      </section>

      <Reveal className="home-scene home-sample">
        <div className="panel bg-butter">
          <p className="tag">Sample</p>
          <h2 className="h1" id="sample-title">We read your last 10 games.</h2>
          <ol className="home-slips">
            {SAMPLE.map((game, index) => (
              <li key={game.opp} className="home-slip" style={{ '--i': index } as CSSProperties}>
                <span className="result-chip" data-result={game.result}>{LETTER[game.result]}</span>
                <span className="home-opp">vs {game.opp}</span>
                <span className="small muted">{game.time}</span>
                {game.hit && (
                  <span className="home-sticker">
                    <Gremlin concept="double_attack" size={64} />
                  </span>
                )}
              </li>
            ))}
          </ol>
          <p className="h1 home-verdict">
            {GREMLINS.double_attack.name} showed up in <span className="hl">{hits} of {SAMPLE.length}.</span>
          </p>
        </div>
      </Reveal>

      <section className="home-scene" aria-labelledby="meet-title">
        <h2 className="h1" id="meet-title">Meet the gremlin.</h2>
        <ul className="home-cast">
          {GREMLIN_ORDER.map((id, index) => (
            <Reveal as="li" key={id} index={index} className="home-cast-card">
              <div className="home-cast-inner bg-concept" data-concept={id}>
                <div className="home-cast-art">
                  <Gremlin concept={id} size={220} />
                </div>
                <div className="home-cast-copy">
                  <h3 className="h3">{GREMLINS[id].name}</h3>
                  <p>{GREMLINS[id].tagline}</p>
                </div>
              </div>
            </Reveal>
          ))}
        </ul>
      </section>

      <section className="home-scene" aria-labelledby="move-title">
        <div className="panel bg-mint">
          <h2 className="h1" id="move-title">Your move.</h2>
          <HomeTry />
          <p className="small home-source">From the Opera Game: Duke and Count vs Paul Morphy, Paris 1858.</p>
        </div>
      </section>

      <section className="home-scene" aria-labelledby="check-title">
        <div className="panel bg-sky">
          <h2 className="h1" id="check-title">One check for your next game.</h2>
          <blockquote className="home-habit">{MOMENT.takeaway}</blockquote>
          <p className="big">Scan again after a few games and we’ll tell you if it came back.</p>
        </div>
      </section>

      <section className="home-scene" aria-labelledby="trust-title">
        <div className="panel">
          <h2 className="h1" id="trust-title">How a scan works.</h2>
          <div className="home-trust">
            <div>
              <p className="big">Stockfish reads every position.</p>
              <p className="muted">Every move of the 10 games, not a shortlist.</p>
            </div>
            <div>
              <p className="big">Turning points get checked again.</p>
              <p className="muted">The moments that swing the game are looked at more carefully.</p>
            </div>
            <div>
              <p className="big">Code names the pattern.</p>
              <p className="muted">The words you read come from those checks.</p>
            </div>
          </div>
        </div>
      </section>

      <section className="home-close" aria-labelledby="close-title">
        <h2 className="display" id="close-title">Go find yours.</h2>
        <ScanForm id="scan-close" />
      </section>
    </div>
  );
}

function UsernameStep({ initial, token }: { initial: string; token: string }) {
  const [name, setName] = useState(initial);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const noteId = 'home-user-note';
  useEffect(() => { setName((current) => current || initial); }, [initial]);

  async function onSubmit(event: FormEvent) {
    event.preventDefault();
    const username = name.trim();
    if (!CHESSCOM_USERNAME_RE.test(username)) {
      setError('Enter a valid Chess.com username.');
      return;
    }
    setBusy(true);
    setError('');
    try {
      await saveChesscomUsername(token, username);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Couldn’t save that username. Try again?');
    } finally {
      setBusy(false);
    }
  }

  return (
    <form className="home-form" onSubmit={onSubmit}>
      <label className="sr-only" htmlFor="home-user">Chess.com username</label>
      <input
        id="home-user"
        className="input"
        name="username"
        placeholder="Your Chess.com username"
        autoComplete="off"
        autoCapitalize="off"
        autoCorrect="off"
        spellCheck={false}
        value={name}
        autoFocus
        aria-invalid={error ? true : undefined}
        aria-describedby={noteId}
        onChange={(event) => { setName(event.target.value); if (error) setError(''); }}
      />
      <button className="btn" type="submit" disabled={busy} aria-busy={busy}>
        {busy ? 'Checking…' : initial ? 'Confirm username' : 'Save username'} <span className="arrow" aria-hidden="true">→</span>
      </button>
      <p id={noteId} className="field-note" data-tone={error ? 'error' : undefined} role={error ? 'alert' : undefined}>
        {error || (initial ? 'From your games. Save it once, then scanning is one click.' : 'Enter it once. Then scanning is one click.')}
      </p>
    </form>
  );
}

function GamesStrip({ scanId, earlier }: { scanId: string; earlier: Me['scans'] }) {
  const [games, setGames] = useState<ScanGame[] | null>(null);
  useEffect(() => {
    let active = true;
    getScan(scanId).then((scan) => { if (active) setGames(scan.games); }).catch(() => { if (active) setGames([]); });
    return () => { active = false; };
  }, [scanId]);
  return (
    <section className="dash-games" aria-labelledby="games-title">
      <div className="dash-games-head">
        <h2 className="h3" id="games-title">Latest scan</h2>
        <Link href={`/scan/${scanId}`}>Open this scan <span className="arrow" aria-hidden="true">→</span></Link>
      </div>
      {games === null ? <div className="skeleton dash-games-skel" aria-hidden="true" /> : games.length === 0 ? (
        <p className="small muted">No games in this scan yet.</p>
      ) : (
        <ol className="dash-strip">
          {games.map((game) => (
            <li key={game.url}>
              <Link href={`/scan/${scanId}`}>
                <span className="result-chip" data-result={game.outcome}>{LETTER[game.outcome]}</span>
                <span className="dash-opp">vs {game.opponent}</span>
              </Link>
            </li>
          ))}
        </ol>
      )}
      {earlier.length > 0 && (
        <p className="small dash-earlier">
          Earlier: {earlier.map((scan, index) => (
            <span key={scan.id}>{index > 0 && ' · '}<Link href={`/scan/${scan.id}`}>{shortDate(scan.created_at)} {scanTitle(scan)}</Link></span>
          ))}
        </p>
      )}
    </section>
  );
}

function SignedIn({ me, token }: { me: Me; token: string }) {
  const idea = me.open_idea;
  const saved = me.chesscom_username_saved;
  const username = me.chesscom_username || '';
  const note = allowanceNote(me) ?? 'Your last 10 rapid, blitz and daily games.';
  const left = me.scan_allowance ? Math.max(0, me.scan_allowance.limit - me.scan_allowance.used) : null;
  const latest = me.scans[0];
  const reviews = me.reviews.slice(0, 5);

  return (
    <div className="page home dash">
      <div className={saved ? 'dash-top' : 'dash-top dash-top--setup'}>
        {idea ? (
          <section className="panel dash-idea bg-concept" data-concept={idea.concept.id} aria-labelledby="idea-title">
            <ViewTransition name={`gremlin-${idea.concept.id}`} share="morph" default="none">
              <div className="dash-art">
                <Gremlin concept={idea.concept.id} size={96} priority />
              </div>
            </ViewTransition>
            <div className="dash-idea-copy">
              <p className="label">Your gremlin</p>
              <h1 className="dash-title" id="idea-title">{idea.concept.gremlin}</h1>
              <p className="dash-count">{idea.concept.name}. Showed up in {idea.games_with_concept} of your last {idea.games_scanned} games.</p>
              <p className="label">For your next game</p>
              <p className="dash-habit">{idea.concept.habit}</p>
              {idea.last_checkin && (
                <p className="small">Last check-in, {shortDate(idea.last_checkin.at)}: {CHECKIN[idea.last_checkin.answer]}</p>
              )}
              {idea.example_report_id
                ? <Link className="btn" href={`/report/${idea.example_report_id}`} transitionTypes={['nav-forward']}>See it in your game <span className="arrow" aria-hidden="true">→</span></Link>
                : <Link className="btn" href={`/scan/${idea.scan_id}`} transitionTypes={['nav-forward']}>See the scan <span className="arrow" aria-hidden="true">→</span></Link>}
            </div>
          </section>
        ) : (
          <section className="surface dash-idea dash-idea--empty" aria-labelledby="idea-title">
            <div className="dash-idea-copy">
              <p className="label">Your gremlin</p>
              <h1 className="dash-title" id="idea-title">None yet</h1>
              <p className="dash-habit">Scan your last 10 games. We’ll name the mistake that keeps showing up.</p>
            </div>
          </section>
        )}

        <section className="surface dash-scan" aria-labelledby="scan-title">
          <h2 className="h3" id="scan-title">{saved ? 'Scan again' : 'Chess.com username'}</h2>
          {saved ? (
            <>
              <ScanForm id="scan" fixedUsername={username} submitLabel="Scan my last 10 games" note={note} nextSlot={me.scan_allowance?.next_slot_at} />
              <p className="dash-change">
                <span className="move" translate="no">{username}</span>
                <Link href="/account#chesscom">Change</Link>
              </p>
              {left === 0 && <p className="small"><Link href="/pricing">Premium removes the weekly limit.</Link></p>}
            </>
          ) : (
            <UsernameStep initial={username} token={token} />
          )}
        </section>
      </div>

      {latest && <GamesStrip scanId={latest.id} earlier={me.scans.slice(1, 4)} />}

      <div className="dash-cols">
        <section className="surface" aria-labelledby="reviews-title">
          <h2 className="h3" id="reviews-title">Recent reviews</h2>
          {reviews.length === 0 ? <p className="muted">No reviews yet. Open a game from a scan and it lands here.</p> : (
            <ul className="dash-list">
              {reviews.map((review) => (
                <li key={review.id}>
                  <Link href={`/report/${review.id}`}>
                    <span>{reviewTitle(review)}</span>
                    <span className="small muted move">{shortDate(review.created_at)}</span>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </section>
        <section className="surface" aria-labelledby="patterns-title">
          <h2 className="h3" id="patterns-title">What came back</h2>
          {me.patterns.length === 0 ? <p className="muted">Nothing has come back twice. Scan again after you’ve played more.</p> : (
            <ul className="dash-patterns">
              {me.patterns.slice(0, 4).map((pattern) => (
                <li key={pattern.concept.id}>
                  <Gremlin concept={pattern.concept.id} size={40} />
                  <p>{pattern.concept.gremlin} <span className="small muted">{pattern.count === 1 ? '1 review' : `${pattern.count} reviews`}</span></p>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>
    </div>
  );
}

function Pending() {
  return (
    <div className="page home home-pending" aria-busy="true">
      <p className="sr-only">Loading your home</p>
      <div className="skeleton" style={{ height: 160, width: '72%' }} />
      <div className="skeleton" style={{ height: 56, maxWidth: 640 }} />
    </div>
  );
}

export default function HomePage() {
  const { signedIn, me, failed, retry, session } = useMe();
  useEffect(() => { captureEvent('landing_viewed', { hero_variant: 'editorial_v1' }); }, []);
  if (signedIn && me && session) return <SignedIn me={me} token={session.access_token} />;
  if (signedIn && failed) {
    return (
      <div className="page home">
        <section className="home-hero">
          <h1 className="h1">Oops, that didn’t load. Try again?</h1>
          <p className="lede">Check your connection. You can still start a scan.</p>
          <button className="btn btn--key" type="button" onClick={retry}>Try again</button>
          <ScanForm id="scan" />
        </section>
      </div>
    );
  }
  if (signedIn) return <Pending />;
  return <Anonymous />;
}
