'use client';

import React from 'react';
import { Chessboard } from 'react-chessboard';

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
      backgroundColor: 'color-mix(in srgb, var(--w-accent) 35%, transparent)',
      borderRadius: '2px',
    };
  }

  const customArrows = arrows.map((a) => ({
    startSquare: a.startSquare,
    endSquare: a.endSquare,
    color: a.color || 'var(--w-accent)',
  }));

  return (
    <div className="w-full select-none overflow-hidden rounded-xl bg-[var(--w-surface)]" style={{ maxWidth: boardWidth }}>
      <div className="w-full" role="img" aria-label={`Chess position, ${orientation} pieces nearest you. ${fen.split(' ')[1] === 'w' ? 'White' : 'Black'} to move.`}>
        <Chessboard
          options={{
            position: fen,
            boardOrientation: orientation,
            allowDragging: false,
            squareStyles: customSquareStyles,
            arrows: customArrows,
            darkSquareStyle: { backgroundColor: '#8b9b83' },
            lightSquareStyle: { backgroundColor: '#ede8dc' },
          }}
        />
      </div>
    </div>
  );
}
