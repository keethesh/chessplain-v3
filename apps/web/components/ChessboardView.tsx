'use client';

import React, { useEffect, useRef, useState, useSyncExternalStore } from 'react';
import { Chessboard, type PieceDropHandlerArgs, type SquareHandlerArgs } from 'react-chessboard';
import { Chess, type Square } from 'chess.js';

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
  const interactive = Boolean(onPieceDrop);
  const [selected, setSelected] = useState<string | null>(null);
  const [trackedFen, setTrackedFen] = useState(fen);
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

  const customSquareStyles: Record<string, React.CSSProperties> = {};

  for (const sq of highlightSquares) {
    customSquareStyles[sq] = {
      backgroundColor: 'color-mix(in srgb, var(--red-fill) 40%, transparent)',
      borderRadius: '0',
      boxShadow: 'inset 0 0 0 3px var(--red-fill)',
    };
  }
  for (const [sq, color] of Object.entries(markedSquares)) {
    customSquareStyles[sq] = {
      ...customSquareStyles[sq],
      boxShadow: `inset 0 0 0 3px ${color}, inset 0 0 0 5px rgb(10 10 10 / 35%)`,
      ...(sq === focusSquare ? { backgroundColor: `color-mix(in srgb, ${color} 60%, transparent)` } : {}),
    };
  }
  if (interactive && selected) {
    customSquareStyles[selected] = {
      ...customSquareStyles[selected],
      boxShadow: 'inset 0 0 0 3px var(--blue-fill), inset 0 0 0 5px rgb(10 10 10 / 35%)',
      backgroundColor: 'color-mix(in srgb, var(--blue-fill) 60%, transparent)',
    };
  }

  const customArrows = arrows.map((a) => ({
    startSquare: a.startSquare,
    endSquare: a.endSquare,
    color: a.color || 'var(--red-fill)',
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
            darkSquareStyle: { backgroundColor: '#a6d7ff' },
            lightSquareStyle: { backgroundColor: '#ffffff' },
            lightSquareNotationStyle: { color: '#0a0a0a' },
            darkSquareNotationStyle: { color: '#0a0a0a' },
            showAnimations: animate && animationMs !== 0,
            ...(animationMs === undefined ? {} : { animationDurationInMs: animationMs }),
          }}
        />
      </div>
    </div>
  );
}
