import { ImageResponse } from 'next/og';

// Share card for every page that does not define its own. Organic traffic from
// social platforms arrives via pasted links, so a bare link preview is
// lost reach. Colours mirror DESIGN.md: graphite #111310, ink #f0f1e9,
// Signal Lime #c9f36d.
export const size = { width: 1200, height: 630 };
export const contentType = 'image/png';
export const alt = 'Chessplain: a little more understanding, every game.';

export default function OpengraphImage() {
  return new ImageResponse(
    (
      <div
        style={{
          width: '100%',
          height: '100%',
          display: 'flex',
          flexDirection: 'column',
          justifyContent: 'space-between',
          backgroundColor: '#111310',
          padding: '72px 80px',
          fontFamily: 'Helvetica, Arial, sans-serif',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 16, color: '#f0f1e9', fontSize: 36, fontWeight: 600, letterSpacing: -0.8 }}>
          <svg width="40" height="41" viewBox="0 0 29 30" fill="none">
            <path
              d="M5 25h19M7 21h15L18 15V8H11v7l-4 6ZM10 8h9M14.5 2v6M11.5 5h6"
              stroke="#c9f36d"
              strokeWidth="1.8"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
          <span>chessplain</span>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 28 }}>
          <div style={{ fontSize: 84, fontWeight: 600, lineHeight: 1.03, color: '#f0f1e9', letterSpacing: -3, maxWidth: 940 }}>
            A little more understanding, every game.
          </div>
          <div style={{ fontSize: 32, lineHeight: 1.35, color: '#aab1a3', maxWidth: 880 }}>
            The few moments that decided your chess game. Explained, and playable on the board.
          </div>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: 14, fontSize: 26, color: '#c9f36d' }}>
          <div style={{ width: 44, height: 3, backgroundColor: '#c9f36d' }} />
          <span>getchessplain.com</span>
        </div>
      </div>
    ),
    size
  );
}
