'use client';

import React, { useEffect, useRef, useState, useSyncExternalStore } from 'react';
import { Chessboard, defaultArrowOptions, type PieceDropHandlerArgs, type SquareHandlerArgs } from 'react-chessboard';
import { Chess, type Square } from 'chess.js';
import { MARK } from '../lib/squares';

/** True when one legal move (either direction) joins the two positions. Halfmove clocks are ignored. */
function differsByOneMove(a: string, b: string): boolean {
  if (!a || !b || a === b) return false;
  return reaches(a, b) || reaches(b, a);
}

function fenKey(fen: string): string {
  return fen.split(' ').slice(0, 4).join(' ');
}

function reaches(fromFen: string, toFen: string): boolean {
  try {
    const game = new Chess(fromFen);
    const target = fenKey(toFen);
    for (const mv of game.moves({ verbose: true })) {
      game.move(mv);
      const key = fenKey(game.fen());
      game.undo();
      if (key === target) return true;
    }
    return false;
  } catch {
    return false;
  }
}

interface ChessboardViewProps {
  fen: string;
  orientation?: 'white' | 'black';
  boardWidth?: number;
  highlightSquares?: string[];
  arrows?: Array<{ startSquare: string; endSquare: string; color?: string }>;
  /** Squares named in the explanation, outlined in the chip colour. */
  markedSquares?: Record<string, string>;
  /** The square the reader is pointing at; filled, not just outlined. */
  focusSquare?: string | null;
  /** Piece movement duration; 0 disables animation. */
  animationMs?: number;
  /**
   * Enables dragging and tap-to-move. Return true to accept the move.
   * `method` defaults to drag; a tap passes 'tap'.
   */
  onPieceDrop?: (from: string, to: string, method?: 'drag' | 'tap') => boolean;
}

function legalTargets(fen: string, from: string): Array<{ to: string; capture: boolean }> {
  try {
    const game = new Chess(fen);
    return game.moves({ square: from as Square, verbose: true }).map(move => ({ to: move.to, capture: Boolean(move.captured) }));
  } catch {
    return [];
  }
}

function isOwnPiece(fen: string, square: string): boolean {
  try {
    const game = new Chess(fen);
    return game.get(square as Square)?.color === game.turn();
  } catch {
    return false;
  }
}

export function ChessboardView({
  fen,
  orientation = 'white',
  boardWidth = 360,
  highlightSquares = [],
  arrows = [],
  markedSquares = {},
  focusSquare = null,
  animationMs,
  onPieceDrop,
}: ChessboardViewProps) {
  const boardRef = useRef<HTMLDivElement>(null);
  const prevFen = useRef(fen);
  const interactive = Boolean(onPieceDrop);
  const [selected, setSelected] = useState<string | null>(null);
  const [trackedFen, setTrackedFen] = useState(fen);
  useEffect(() => { prevFen.current = fen; });
  // Drop the selection with the position, and when the board stops accepting moves.
  if (trackedFen !== fen) {
    setTrackedFen(fen);
    if (selected !== null) setSelected(null);
  } else if (!interactive && selected !== null) {
    setSelected(null);
  }
  // onSquareClick is fired from touchend and, on some phones, the click that follows.
  const recentSquare = useRef<{ square: string; at: number } | null>(null);
  const animate = useSyncExternalStore(
    (onChange) => {
      const mq = window.matchMedia('(prefers-reduced-motion: reduce)');
      mq.addEventListener('change', onChange);
      return () => mq.removeEventListener('change', onChange);
    },
    () => !window.matchMedia('(prefers-reduced-motion: reduce)').matches,
    () => true,
  );
  // Slide only when the new position is exactly one legal move away. A jump of
  // several plies, or the cut back to the original position, does not glide
  // unrelated pieces. animationMs 0 forces that cut.
  const slide = animate && animationMs !== 0 && differsByOneMove(prevFen.current, fen);
  useEffect(() => {
    const root = boardRef.current;
    if (!root) return;
    const lock = () => {
      root.querySelectorAll<HTMLElement>('[tabindex]').forEach((el) => { if (el.tabIndex !== -1) el.tabIndex = -1; });
    };
    lock();
    const obs = new MutationObserver(lock);
    obs.observe(root, { subtree: true, childList: true, attributes: true, attributeFilter: ['tabindex'] });
    return () => obs.disconnect();
  }, [fen, onPieceDrop]);

  function rememberSquare(square: string) {
    recentSquare.current = { square, at: performance.now() };
  }

  function repeatSquare(square: string) {
    const recent = recentSquare.current;
    return Boolean(recent && recent.square === square && performance.now() - recent.at < 400);
  }

  function dropPiece(from: string, to: string, method: 'drag' | 'tap') {
    if (!onPieceDrop) return false;
    rememberSquare(to);
    return onPieceDrop(from, to, method);
  }

  function onSquareClick({ square }: SquareHandlerArgs) {
    if (!onPieceDrop || repeatSquare(square)) return;
    rememberSquare(square);
    if (isOwnPiece(fen, square)) {
      setSelected(selected === square ? null : square);
      return;
    }
    if (!selected) return;
    const accepted = dropPiece(selected, square, 'tap');
    if (accepted) setSelected(null);
  }

  const legal = interactive && selected ? legalTargets(fen, selected) : [];
  const customSquareStyles: Record<string, React.CSSProperties> = {};

  for (const sq of highlightSquares) {
    customSquareStyles[sq] = { boxShadow: `inset 0 0 0 4px ${MARK.played}` };
  }
  for (const target of legal) {
    customSquareStyles[target.to] = target.capture
      ? { backgroundImage: `radial-gradient(circle, transparent 54%, ${MARK.legal} 56% 70%, transparent 72%)` }
      : { backgroundImage: `radial-gradient(circle, ${MARK.legal} 16%, transparent 18%)` };
  }
  for (const a of arrows) {
    const ring = `inset 0 0 0 4px ${a.color || MARK.checked}`;
    for (const sq of [a.startSquare, a.endSquare]) {
      customSquareStyles[sq] = { ...customSquareStyles[sq], boxShadow: ring };
    }
  }
  for (const [sq, color] of Object.entries(markedSquares)) {
    customSquareStyles[sq] = {
      ...customSquareStyles[sq],
      boxShadow: `inset 0 0 0 4px ${color}`,
      ...(sq === focusSquare ? { backgroundColor: `${color}55` } : {}),
    };
  }
  if (interactive && selected) {
    customSquareStyles[selected] = {
      ...customSquareStyles[selected],
      boxShadow: `inset 0 0 0 4px ${MARK.selected}`,
    };
  }

  const customArrows = arrows.map((a) => ({
    startSquare: a.startSquare,
    endSquare: a.endSquare,
    color: a.color || MARK.checked,
  }));
  const turn = fen.split(' ')[1] === 'w' ? 'White' : 'Black';
  let positionLabel = `${turn} to move`;
  let piecePlacement = '';
  try {
    const game = new Chess(fen);
    if (game.isCheckmate()) positionLabel = `${turn} is checkmated`;
    else if (game.isCheck()) positionLabel += ', in check';
    else if (game.isDraw()) positionLabel = 'Drawn position';
    // Screen readers get the position itself, not just whose move it is.
    const pieces = game.board().flat().filter((p): p is NonNullable<typeof p> => p !== null);
    const list = (color: 'w' | 'b') => {
      const own = pieces.filter(p => p.color === color);
      const major = own.filter(p => p.type !== 'p').map(p => p.type.toUpperCase() + p.square);
      const pawns = own.filter(p => p.type === 'p').map(p => p.square);
      return [...major, pawns.length ? `pawns ${pawns.join(' ')}` : ''].filter(Boolean).join(', ');
    };
    piecePlacement = `White: ${list('w')}. Black: ${list('b')}.`;
  } catch {
    // Keep the side-to-move label if a partial analysis FEN is not parseable.
  }


  return (
    <div className="w-full select-none overflow-hidden board-frame" style={{ maxWidth: boardWidth }}>
      <div ref={boardRef} className="w-full" role="img" aria-label={`Chess position, ${orientation} pieces nearest you. ${positionLabel}. ${piecePlacement}`}>
        <Chessboard
          options={{
            position: fen,
            boardOrientation: orientation,
            allowDragging: interactive,
            ...(onPieceDrop ? {
              onPieceDrop: ({ sourceSquare, targetSquare }: PieceDropHandlerArgs) => (targetSquare ? dropPiece(sourceSquare, targetSquare, 'drag') : false),
              onSquareClick,
            } : {}),
            squareStyles: customSquareStyles,
            arrows: customArrows,
            arrowOptions: { ...defaultArrowOptions, opacity: 1, activeOpacity: 1 },
            dropSquareStyle: { boxShadow: `inset 0 0 0 4px ${MARK.legal}` },
            darkSquareStyle: { backgroundColor: 'var(--board-dark)' },
            lightSquareStyle: { backgroundColor: 'var(--board-light)' },
            lightSquareNotationStyle: { color: '#0a0a0a' },
            darkSquareNotationStyle: { color: '#0a0a0a' },
            showAnimations: slide,
            animationDurationInMs: slide ? (animationMs ?? 300) : 0,
          }}
        />
      </div>
    </div>
  );
}
