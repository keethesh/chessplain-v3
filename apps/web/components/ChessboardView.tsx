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
  boardWidth = 340,
  highlightSquares = [],
  arrows = [],
}: ChessboardViewProps) {
  const customSquareStyles: Record<string, React.CSSProperties> = {};

  for (const sq of highlightSquares) {
    customSquareStyles[sq] = {
      backgroundColor: 'rgba(67, 56, 202, 0.35)',
      borderRadius: '4px',
    };
  }

  const customArrows = arrows.map((a) => ({
    startSquare: a.startSquare,
    endSquare: a.endSquare,
    color: a.color || '#4338ca',
  }));

  return (
    <div className="flex justify-center items-center select-none overflow-hidden rounded-lg border border-[var(--w-border)] bg-[var(--w-surface)] p-2 shadow-sm">
      <div style={{ width: `${boardWidth}px`, maxWidth: '100%' }}>
        <Chessboard
          options={{
            position: fen,
            boardOrientation: orientation,
            allowDragging: false,
            squareStyles: customSquareStyles,
            arrows: customArrows,
            darkSquareStyle: { backgroundColor: '#c8c8cf' },
            lightSquareStyle: { backgroundColor: '#ffffff' },
          }}
        />
      </div>
    </div>
  );
}
