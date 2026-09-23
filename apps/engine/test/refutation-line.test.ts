import { describe, expect, it } from 'vitest';
import { buildRefutationLine } from '../src/analysis/select.js';

// Production report d93a5f01, 18.Rd2 (a missed win): the better line
// Kf1 Qc5 Re1 Qxe3 was cut after Black took the queen, so the report said
// the better move "loses your queen" when the next move recaptures it.
const FEN = 'r1b1k2r/2p1b2p/p1p2p2/5pN1/5B2/2qPQ1R1/P1P2P1P/3RK3 w kq - 4 18';

describe('buildRefutationLine', () => {
  it('finishes an exchange instead of stopping right after a capture', () => {
    expect(buildRefutationLine(FEN, 'e1f1 c3c5 d1e1 c5e3 f4e3 a8b8', 4)).toBe('Kf1 Qc5 Re1 Qxe3 Bxe3');
  });

  it('stops past the limit when the next move is not a recapture', () => {
    expect(buildRefutationLine(FEN, 'e1f1 c3c5 d1e1 c5e3 a2a3', 4)).toBe('Kf1 Qc5 Re1 Qxe3');
    expect(buildRefutationLine(FEN, 'e1f1 c3c5 d1e1 a8b8', 3)).toBe('Kf1 Qc5 Re1');
  });
});
