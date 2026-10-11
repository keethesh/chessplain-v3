'use client';

import { useEffect, useRef, useState, type FormEvent } from 'react';
import { Chessboard } from 'react-chessboard';
import { Chess } from 'chess.js';
import { DEMO_REPORT } from '../../lib/demo-report';

const MOMENT = DEMO_REPORT.moments[0];

// Illustrative scan for the prototype only. Real scans come from the player's games.
const SAMPLE_GAMES = [
  { opp: 'knightowl_92', result: 'L', time: '10 min', gremlin: true },
  { opp: 'mateo.plays', result: 'W', time: '10 min', gremlin: false },
  { opp: 'Ravenclawed', result: 'L', time: '15 | 10', gremlin: true },
  { opp: 'petra_k', result: 'D', time: '10 min', gremlin: false },
  { opp: 'sicilian_sam', result: 'W', time: '10 min', gremlin: false },
  { opp: 'b4_or_bust', result: 'L', time: '5 min', gremlin: true },
  { opp: 'lu.chess', result: 'W', time: '10 min', gremlin: false },
  { opp: 'Grandpa_Gambit', result: 'L', time: '10 min', gremlin: false },
  { opp: 'quietqueen', result: 'W', time: '15 | 10', gremlin: false },
  { opp: 'tomasz_e4', result: 'W', time: '10 min', gremlin: false },
];

const GREMLINS = [
  { src: '/prototype/double.png', name: 'Double Trouble', line: 'One move, two threats, and you can only stop one.', tint: 'pink' },
  { src: '/prototype/hanger.png', name: 'The Hanger', line: 'Walks off with the piece you forgot to defend.', tint: 'lilac' },
  { src: '/prototype/sleeper.png', name: 'The Back-Rank Sleeper', line: 'Naps while a rook slides onto your back rank.', tint: 'sky' },
  { src: '/prototype/misser.png', name: 'The Mate Misser', line: 'Looks everywhere except at the mate in two.', tint: 'butter' },
];

type Outcome = 'idle' | 'checked' | 'played' | 'other';

const OUTCOME_COPY: Record<Exclude<Outcome, 'idle'>, { title: string; body: string }> = {
  checked: {
    title: 'That’s the move we checked.',
    body: `${MOMENT.best_move} defends f7 before the queen gets there. Double Trouble has nothing left to fork.`,
  },
  played: {
    title: 'Double Trouble says thanks.',
    body: `That’s the game move. ${MOMENT.what_actually_happens}`,
  },
  other: {
    title: 'Different from the line we checked.',
    body: `We only verified ${MOMENT.best_move} here, so we won’t call your move right or wrong. Try again, or see the checked move.`,
  },
};

function useReveal() {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const root = ref.current;
    if (!root) return;
    const io = new IntersectionObserver(
      (entries) => {
        for (const e of entries) if (e.isIntersecting) { e.target.classList.add('is-in'); io.unobserve(e.target); }
      },
      { threshold: 0.25 },
    );
    root.classList.add('pt-ready');
    root.querySelectorAll('[data-scene]').forEach((el) => io.observe(el));
    return () => io.disconnect();
  }, []);
  return ref;
}

function ScanForm({ id }: { id: string }) {
  const [name, setName] = useState('');
  const [error, setError] = useState('');
  return (
    <form
      className="pt-form"
      onSubmit={(e: FormEvent) => {
        e.preventDefault();
        setError(name.trim() ? 'Prototype only: the scan isn’t wired up yet.' : 'Type your Chess.com username first.');
      }}
    >
      <label htmlFor={id} className="pt-sr">Chess.com username</label>
      <input
        id={id}
        className="pt-input"
        placeholder="Your Chess.com username"
        autoComplete="username"
        value={name}
        onChange={(e) => { setName(e.target.value); setError(''); }}
        aria-invalid={error && !name.trim() ? true : undefined}
        aria-describedby={`${id}-note`}
      />
      <button className="pt-btn" type="submit">Find my gremlin <span aria-hidden="true">→</span></button>
      <p id={`${id}-note`} className="pt-note" role={error ? 'status' : undefined}>
        {error || 'Free. No signup. No Chess.com password.'}
      </p>
    </form>
  );
}

function TryIt() {
  const [fen, setFen] = useState(MOMENT.fen_before);
  const [outcome, setOutcome] = useState<Outcome>('idle');
  const arrows =
    outcome === 'played'
      ? [
          { startSquare: 'f3', endSquare: 'b3', color: '#ff4d6d' },
          { startSquare: 'b3', endSquare: 'f7', color: '#ff4d6d' },
          { startSquare: 'b3', endSquare: 'b7', color: '#ff4d6d' },
        ]
      : outcome === 'checked'
        ? [{ startSquare: 'd8', endSquare: 'f6', color: '#2f6bff' }]
        : [];

  function play(from: string, to: string) {
    const game = new Chess(MOMENT.fen_before);
    try {
      const move = game.move({ from, to, promotion: 'q' });
      setFen(game.fen());
      setOutcome(move.san === MOMENT.best_move ? 'checked' : move.san === MOMENT.played ? 'played' : 'other');
      return true;
    } catch {
      return false;
    }
  }

  return (
    <div className="pt-try">
      <div className="pt-board" role="img" aria-label="Chess position from the Opera Game, Black to move, move 6.">
        <Chessboard
          options={{
            position: fen,
            boardOrientation: 'black',
            allowDragging: outcome === 'idle',
            arrows,
            darkSquareStyle: { backgroundColor: '#a6d7ff' },
            lightSquareStyle: { backgroundColor: '#ffffff' },
            onPieceDrop: ({ sourceSquare, targetSquare }) => (targetSquare ? play(sourceSquare, targetSquare) : false),
          }}
        />
      </div>
      <div className="pt-try-copy" aria-live="polite">
        {outcome === 'idle' ? (
          <>
            <p className="pt-big-line">Black to move. Find the move that stops Double Trouble before it starts.</p>
            <p className="pt-muted">Drag a piece. Hint: something on f7 is about to feel lonely.</p>
            <button className="pt-btn pt-btn-ghost" type="button" onClick={() => play('d8', 'f6')}>Show the checked move</button>
          </>
        ) : (
          <div className={`pt-result pt-result-${outcome}`} key={outcome}>
            <p className="pt-big-line">{OUTCOME_COPY[outcome].title}</p>
            <p className="pt-muted">{OUTCOME_COPY[outcome].body}</p>
            <button className="pt-btn pt-btn-ghost" type="button" onClick={() => { setFen(MOMENT.fen_before); setOutcome('idle'); }}>
              Try again
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

export function Prototype() {
  const root = useReveal();
  const hits = SAMPLE_GAMES.filter((g) => g.gremlin).length;

  return (
    <div className="pt" ref={root}>
      <header className="pt-header">
        <a href="#top" className="pt-logo">CHESSPLAIN</a>
        <a href="#scan" className="pt-btn pt-btn-small">Find my gremlin</a>
      </header>

      <section id="top" className="pt-hero" data-scene>
        <div className="pt-hero-stage">
        <h1 className="pt-display pt-hero-title">
          <span className="pt-line pt-line-split">
            <span className="pt-word" style={{ '--i': 0 } as React.CSSProperties}>Your</span>{' '}
            <span className="pt-word" style={{ '--i': 1 } as React.CSSProperties}>chess</span>
          </span>{' '}
          <span className="pt-line">
            <span className="pt-word" style={{ '--i': 2 } as React.CSSProperties}>has</span>{' '}
            <span className="pt-word" style={{ '--i': 3 } as React.CSSProperties}>a</span>
          </span>{' '}
          <span className="pt-line">
            <span className="pt-word pt-word-mark" style={{ '--i': 4 } as React.CSSProperties}>gremlin.</span>
          </span>
        </h1>
        <div className="pt-walker" aria-hidden="true">
          <img src="/prototype/hanger.png" alt="" width={320} height={320} />
        </div>
        </div>
        <div className="pt-hero-foot">
          <p className="pt-lede">
            Chessplain reads your last 10 Chess.com games and finds the mistake that keeps costing you. Then it helps you stop making it.
          </p>
          <ScanForm id="hero-user" />
        </div>
      </section>

      <section id="scan" className="pt-scene" data-scene>
        <div className="pt-frame pt-butter">
          <p className="pt-tag">Sample scan</p>
          <h2 className="pt-display pt-h2">We read your last 10 games.</h2>
          <ol className="pt-slips">
            {SAMPLE_GAMES.map((g, i) => (
              <li key={g.opp} className="pt-slip" style={{ '--i': i } as React.CSSProperties}>
                <span className={`pt-result-chip r-${g.result}`}>{g.result}</span>
                <span className="pt-slip-opp">vs {g.opp}</span>
                <span className="pt-slip-time">{g.time}</span>
                {g.gremlin && <img className="pt-sticker" src="/prototype/double.png" alt="Double Trouble showed up" width={64} height={64} />}
              </li>
            ))}
          </ol>
          <p className="pt-display pt-verdict">
            Double Trouble showed up in <span className="pt-hl">{hits} of 10.</span>
          </p>
        </div>
      </section>

      <section className="pt-scene" data-scene>
        <div className="pt-frame pt-pink pt-meet">
          <img className="pt-meet-img" src="/prototype/double.png" alt="Double Trouble, a pink two-headed gremlin pointing two ways" width={420} height={420} />
          <div>
            <h2 className="pt-display pt-h2">Meet Double Trouble.</h2>
            <p className="pt-big-line">One move, two threats, and you can only stop one.</p>
            <p className="pt-muted">
              In your games it shows up right after you develop a piece and leave a square loose. The opponent’s queen lands
              somewhere that hits two things at once.
            </p>
          </div>
        </div>
      </section>

      <section className="pt-scene" data-scene>
        <div className="pt-frame pt-mint">
          <h2 className="pt-display pt-h2">Your move.</h2>
          <TryIt />
          <p className="pt-tag pt-source">From a real game: Duke and Count vs Paul Morphy, Paris 1858. Checked by Stockfish.</p>
        </div>
      </section>

      <section className="pt-scene" data-scene>
        <div className="pt-frame pt-sky pt-habit">
          <h2 className="pt-display pt-h2">One check for your next game.</h2>
          <blockquote className="pt-habit-card">{MOMENT.takeaway}</blockquote>
          <p className="pt-big-line">Scan again after a few games and we’ll tell you if Double Trouble came back.</p>
        </div>
      </section>

      <section className="pt-scene" data-scene>
        <div className="pt-frame pt-frame-plain">
          <h2 className="pt-display pt-h2">The gremlin gallery.</h2>
          <ul className="pt-cast">
            {GREMLINS.map((g, i) => (
              <li key={g.name} className={`pt-cast-card t-${g.tint}`} style={{ '--i': i } as React.CSSProperties}>
                <img src={g.src} alt="" width={240} height={240} />
                <h3 className="pt-cast-name">{g.name}</h3>
                <p>{g.line}</p>
              </li>
            ))}
          </ul>
        </div>
      </section>

      <section className="pt-close" data-scene>
        <p className="pt-display pt-close-title">Go find yours.</p>
        <ScanForm id="close-user" />
      </section>

      <footer className="pt-footer">
        <span className="pt-logo">CHESSPLAIN</span>
        <span>Prototype. Sample data is illustrative.</span>
      </footer>
    </div>
  );
}
