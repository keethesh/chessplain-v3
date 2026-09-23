'use client';

import { Fragment, type CSSProperties } from 'react';
import { SQUARE_PATTERN } from '../lib/squares';

interface SquareTextProps {
  text: string;
  colors: Record<string, string>;
  onFocusSquare?: (square: string | null) => void;
}

/**
 * Renders explanation text with each square name ("g4") as a coloured chip
 * matching the outline on the board, so a beginner can find it without
 * counting files and ranks.
 */
export function SquareText({ text, colors, onFocusSquare }: SquareTextProps) {
  const parts: Array<string | { square: string }> = [];
  let last = 0;
  for (const match of text.matchAll(SQUARE_PATTERN)) {
    const square = match[0];
    if (!colors[square]) continue;
    parts.push(text.slice(last, match.index), { square });
    last = match.index + square.length;
  }
  parts.push(text.slice(last));

  return parts.map((part, i) => typeof part === 'string'
    ? <Fragment key={i}>{part}</Fragment>
    : (
      <button
        key={i}
        type="button"
        className="sq-chip"
        style={{ '--sq': colors[part.square] } as CSSProperties}
        aria-label={`${part.square}, show on the board`}
        onMouseEnter={() => onFocusSquare?.(part.square)}
        onMouseLeave={() => onFocusSquare?.(null)}
        onFocus={() => onFocusSquare?.(part.square)}
        onBlur={() => onFocusSquare?.(null)}
        // Touch browsers do not always focus a tapped button.
        onClick={() => onFocusSquare?.(part.square)}
      >
        {part.square}
      </button>
    ));
}
