'use client';

import React from 'react';
import { Chessboard } from 'react-chessboard';
import { Chess } from 'chess.js';

interface ChessboardViewProps {
  fen: string;
  orientation?: 'white' | 'black';
  boardWidth?: number;
  highlightSquares?: string[];
  arrows?: Array<{ startSquare: string; endSquare: string; color?: string }>;
}

export function ChessboardView({
  fen,
  orientation = 'white',
  boardWidth = 360,
  highlightSquares = [],
  arrows = [],
}: ChessboardViewProps) {
  const customSquareStyles: Record<string, React.CSSProperties> = {};

  for (const sq of highlightSquares) {
    customSquareStyles[sq] = {
      backgroundColor: 'color-mix(in srgb, var(--w-error) 45%, transparent)',
      borderRadius: '0',
      boxShadow: 'inset 0 0 0 3px var(--w-error)',
    };
  }

  const customArrows = arrows.map((a) => ({
    startSquare: a.startSquare,
    endSquare: a.endSquare,
    color: a.color || 'var(--w-accent)',
  }));
  const turn = fen.split(' ')[1] === 'w' ? 'White' : 'Black';
  let positionLabel = `${turn} to move`;
  try {
    const game = new Chess(fen);
    if (game.isCheckmate()) positionLabel = `${turn} is checkmated`;
    else if (game.isCheck()) positionLabel += ', in check';
    else if (game.isDraw()) positionLabel = 'Drawn position';
  } catch {
    // Keep the side-to-move label if a partial analysis FEN is not parseable.
  }


  return (
    <div className="w-full select-none overflow-hidden rounded-xl bg-[var(--w-surface)]" style={{ maxWidth: boardWidth }}>
      <div className="w-full" role="img" aria-label={`Chess position, ${orientation} pieces nearest you. ${positionLabel}.`}>
        <Chessboard
          options={{
            position: fen,
            boardOrientation: orientation,
            allowDragging: false,
            squareStyles: customSquareStyles,
            arrows: customArrows,
            darkSquareStyle: { backgroundColor: '#566956' },
            lightSquareStyle: { backgroundColor: '#d9dfca' },
          }}
        />
      </div>
    </div>
  );
}
