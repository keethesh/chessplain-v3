/**
 * Colours for squares named in explanation text, and for board marks.
 * The board is light #deecf7 and dark #5eaae8, so only dark marks clear 3:1
 * on both. Chip fills use the same hex as the board outline; chip text is
 * white (ink on these fills is about 2.5:1).
 *
 * Contrast vs #deecf7 / #5eaae8, then white text on the fill:
 *   #a70000  6.60 / 3.17   white 7.95
 *   #674d00  6.61 / 3.18   white 7.96
 *   #005f20  6.56 / 3.16   white 7.90
 *   #7700cc  6.57 / 3.16   white 7.91
 *   #99007f  6.56 / 3.15   white 7.89
 * Marks (not chip fills):
 *   selected / checked arrow  #0a0a0a  16.45 / 7.91
 *   legal targets             #005d46   6.57 / 3.16
 *   played move / its arrow   #952d00   6.58 / 3.16
 */
const SQUARE_COLORS = ['#a70000', '#674d00', '#005f20', '#7700cc', '#99007f'];

export const MARK = {
  selected: '#0a0a0a',
  legal: '#005d46',
  played: '#952d00',
  checked: '#0a0a0a',
} as const;

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
