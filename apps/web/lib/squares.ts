/**
 * Colours for squares named in explanation text. Kept clear of the lime
 * (actions) and coral (threats) signals, and bright enough to read as an
 * outline on both board square colours.
 */
const SQUARE_COLORS = ['#7cc4ff', '#ffc15e', '#c6a0ff', '#5fdcc4', '#ff9ad5'];

/** A square name standing alone ("the queen on g4"), not inside notation like "Qxg4". */
export const SQUARE_PATTERN = /\b[a-h][1-8]\b/g;

/** Square -> colour, in order of first mention, so the first square read gets the first colour. */
export function assignSquareColors(texts: string[]): Record<string, string> {
  const colors: Record<string, string> = {};
  let next = 0;
  for (const text of texts) {
    for (const [square] of text.matchAll(SQUARE_PATTERN)) {
      if (!colors[square]) colors[square] = SQUARE_COLORS[next++ % SQUARE_COLORS.length];
    }
  }
  return colors;
}
