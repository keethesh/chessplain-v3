'use client';

import { useEffect, type CSSProperties } from 'react';
import dynamic from 'next/dynamic';
import Link from 'next/link';
import { ViewTransition } from 'react';
import { Gremlin } from '../components/Gremlin';
import { Reveal } from '../components/Reveal';
import { ScanForm } from '../components/ScanForm';
import { DEMO_REPORT } from '../lib/demo-report';
import { GREMLIN_ORDER, GREMLINS } from '../lib/gremlins';
import { captureEvent } from '../lib/posthog';
import { useMe } from '../lib/use-session';
import type { Checkin, Me, MeReview } from '../lib/api';
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

function SignedIn({ me }: { me: Me }) {
  const idea = me.open_idea;
  const username = idea?.chesscom_username || me.chesscom_username || '';
  const note = allowanceNote(me) ?? 'Your last 10 rapid, blitz and daily games.';
  const left = me.scan_allowance ? Math.max(0, me.scan_allowance.limit - me.scan_allowance.used) : null;

  return (
    <div className="page home">
      {idea ? (
        <section className="panel bg-concept home-idea" data-concept={idea.concept.id} aria-labelledby="idea-title">
          <div className="home-idea-copy">
            <h1 className="h1" id="idea-title">Your gremlin: {idea.concept.gremlin}</h1>
            <p className="big">{idea.concept.name}: showed up in {idea.games_with_concept} of your last {idea.games_scanned} games.</p>
            <blockquote className="home-habit">{idea.concept.habit}</blockquote>
            {idea.last_checkin && (
              <p className="small">Last check-in, {shortDate(idea.last_checkin.at)}: {CHECKIN[idea.last_checkin.answer]}</p>
            )}
            <div className="home-actions">
              {idea.example_report_id
                ? <Link className="btn" href={`/report/${idea.example_report_id}`} transitionTypes={['nav-forward']}>See it in your game <span className="arrow" aria-hidden="true">→</span></Link>
                : <Link className="btn" href={`/scan/${idea.scan_id}`} transitionTypes={['nav-forward']}>See the scan <span className="arrow" aria-hidden="true">→</span></Link>}
            </div>
            <ScanForm id="scan" initial={username} submitLabel="Scan again" note={note} nextSlot={me.scan_allowance?.next_slot_at} />
            {left === 0 && <p className="small"><Link href="/pricing">Premium removes the weekly limit.</Link></p>}
          </div>
          <ViewTransition name={`gremlin-${idea.concept.id}`} share="morph" default="none">
            <div className="home-idea-art">
              <Gremlin concept={idea.concept.id} size={300} priority />
            </div>
          </ViewTransition>
        </section>
      ) : (
        <section className="home-hero" aria-labelledby="idea-title">
          <h1 className="h1" id="idea-title">Find the mistake you keep making.</h1>
          <p className="lede">We’ll read your last 10 Chess.com games and name the one that shows up most.</p>
          <ScanForm id="scan" initial={username} submitLabel="Find my gremlin" note={note} nextSlot={me.scan_allowance?.next_slot_at} />
          {left === 0 && <p className="small"><Link href="/pricing">Premium removes the weekly limit.</Link></p>}
        </section>
      )}

      <div className="home-records">
        <section className="surface" aria-labelledby="scans-title">
          <h2 className="h3" id="scans-title">Recent scans</h2>
          {me.scans.length === 0 ? <p className="muted">No scans yet. Start one above and it will show up here.</p> : (
            <ul className="home-record-list">
              {me.scans.map((scan) => (
                <li key={scan.id}>
                  <Link href={`/scan/${scan.id}`}>
                    <span className="move muted">{shortDate(scan.created_at)}</span>
                    <span>{scanTitle(scan)}</span>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </section>
        <section className="surface" aria-labelledby="reviews-title">
          <h2 className="h3" id="reviews-title">Recent reviews</h2>
          {me.reviews.length === 0 ? <p className="muted">No reviews yet. Open a game from a scan and it lands here.</p> : (
            <ul className="home-record-list">
              {me.reviews.map((review) => (
                <li key={review.id}>
                  <Link href={`/report/${review.id}`}>
                    <span className="move muted">{shortDate(review.created_at)}</span>
                    <span>{reviewTitle(review)}</span>
                  </Link>
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
  const { signedIn, me, failed, retry } = useMe();
  useEffect(() => { captureEvent('landing_viewed', { hero_variant: 'editorial_v1' }); }, []);
  if (signedIn && me) return <SignedIn me={me} />;
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
