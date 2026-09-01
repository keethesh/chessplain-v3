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
    <div className="flex justify-center items-center select-none overflow-hidden rounded-xl border border-[var(--w-border-strong)] bg-[var(--w-surface)] p-2 shadow-sm">
      <div style={{ width: `${boardWidth}px`, maxWidth: '100%' }}>
        <Chessboard
          options={{
            position: fen,
            boardOrientation: orientation,
            allowDragging: false,
            squareStyles: customSquareStyles,
            arrows: customArrows,
            darkSquareStyle: { backgroundColor: '#b58863' },
            lightSquareStyle: { backgroundColor: '#f0d9b5' },
          }}
        />
      </div>
    </div>
  );
}
