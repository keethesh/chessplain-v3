'use client';

import { useEffect, useRef, useState, type FormEvent } from 'react';
import { Chess } from 'chess.js';
import { ChessboardView } from './ChessboardView';
import { DEMO_REPORT } from '../lib/demo-report';

const MOMENT = DEMO_REPORT.moments[0];
type Outcome = 'idle' | 'checked' | 'played' | 'other';

/** The demo position. Loaded on its own so the board stays out of the signed-in home. */
export function HomeTry() {
  const [fen, setFen] = useState(MOMENT.fen_before);
  const [outcome, setOutcome] = useState<Outcome>('idle');
  const [typed, setTyped] = useState('');
  const [note, setNote] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);
  const outcomeRef = useRef<HTMLParagraphElement>(null);
  const land = useRef<'outcome' | 'input' | null>(null);

  useEffect(() => {
    const want = land.current;
    if (!want) return;
    land.current = null;
    (want === 'input' ? inputRef.current : outcomeRef.current)?.focus();
  });

  function apply(game: Chess, san: string) {
    setFen(game.fen());
    setNote('');
    setTyped('');
    setOutcome(san === MOMENT.best_move ? 'checked' : san === MOMENT.played ? 'played' : 'other');
    land.current = 'outcome';
  }

  function onDrop(from: string, to: string) {
    const game = new Chess(MOMENT.fen_before);
    try {
      const move = game.move({ from, to, promotion: 'q' });
      if (!move) return false;
      apply(game, move.san);
      return true;
    } catch {
      return false;
    }
  }

  function playTyped(event: FormEvent) {
    event.preventDefault();
    const raw = typed.trim();
    const attempts = /^[nbrqk]/i.test(raw) ? [raw, raw[0].toUpperCase() + raw.slice(1)] : [raw];
    for (const san of attempts) {
      try {
        const game = new Chess(MOMENT.fen_before);
        const move = game.move(san);
        if (move) { apply(game, move.san); return; }
      } catch { /* try the next spelling */ }
    }
    setNote('That isn’t a legal move from here.');
  }

  function showChecked() {
    const game = new Chess(MOMENT.fen_before);
    const move = game.move(MOMENT.best_move);
    if (move) apply(game, move.san);
  }

  const arrowSan = outcome === 'checked' ? MOMENT.best_move : outcome === 'played' ? MOMENT.played : null;
  let arrows: Array<{ startSquare: string; endSquare: string; color: string }> = [];
  if (arrowSan) {
    try {
      const probe = new Chess(MOMENT.fen_before);
      const move = probe.move(arrowSan);
      if (move) arrows = [{ startSquare: move.from, endSquare: move.to, color: outcome === 'checked' ? '#2f6bff' : '#ff4d6d' }];
    } catch { /* the line still reads in text */ }
  }

  return (
    <div className="home-try">
      <ChessboardView fen={fen} orientation="black" boardWidth={520} arrows={arrows} onPieceDrop={outcome === 'idle' ? onDrop : undefined} />
      <div className="home-try-copy">
        <p className="sr-only" role="status">{outcome === 'checked' ? 'That’s the move we checked.' : outcome === 'played' ? 'That’s the game move.' : outcome === 'other' ? 'Different from the line we checked.' : ''}</p>
        {outcome === 'idle' ? (
          <>
            <p className="big">Black to move. Find the move that stops the fork.</p>
            <p className="muted">Tap a piece and then a square, drag it, or type the move.</p>
            {note ? <p className="field-note" data-tone="error" role="alert">{note}</p> : null}
            <form className="home-try-actions" onSubmit={playTyped}>
              <label className="sr-only" htmlFor="try-san">Move</label>
              <input ref={inputRef} id="try-san" className="input" name="move" value={typed} onChange={(event) => setTyped(event.target.value)} placeholder="e.g. Be7" autoComplete="off" autoCapitalize="off" autoCorrect="off" spellCheck={false} inputMode="text" />
              <button className="btn btn--key" type="submit">Play move</button>
              <button className="btn btn--key" type="button" onClick={showChecked}>Show the checked move</button>
            </form>
          </>
        ) : (
          <div className="home-outcome" data-outcome={outcome} key={outcome}>
            {outcome === 'checked' ? (
              <>
                <p className="big" ref={outcomeRef} tabIndex={-1}>That’s the move we checked.</p>
                <p>{MOMENT.why_better}</p>
              </>
            ) : null}
            {outcome === 'played' ? (
              <>
                <p className="big" ref={outcomeRef} tabIndex={-1}>That’s the game move.</p>
                <p>{MOMENT.what_actually_happens}</p>
                <p className="move">Checked line: {MOMENT.refutation_line}</p>
              </>
            ) : null}
            {outcome === 'other' ? (
              <>
                <p className="big" ref={outcomeRef} tabIndex={-1}>Different from the line we checked.</p>
                <p>We only verified <span className="move">{MOMENT.best_move}</span>.</p>
              </>
            ) : null}
            <button className="btn btn--key" type="button" onClick={() => { land.current = 'input'; setFen(MOMENT.fen_before); setOutcome('idle'); setNote(''); setTyped(''); }}>Try again</button>
          </div>
        )}
      </div>
    </div>
  );
}
