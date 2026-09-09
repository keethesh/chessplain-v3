import { ImageResponse } from 'next/og';

// Share card for every page that does not define its own. Organic traffic from
// X, Instagram and TikTok arrives via pasted links, so a bare link preview is
// lost reach. Colours mirror DESIGN.md: canvas #f8f6f0, ink #1c2826,
// accent #2d5a3d.
export const size = { width: 1200, height: 630 };
export const contentType = 'image/png';
export const alt = 'Chessplain — a little clarity, a better next game.';

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
          backgroundColor: '#f8f6f0',
          padding: '72px 80px',
          fontFamily: 'Georgia, serif',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 16, color: '#1c2826', fontSize: 34, letterSpacing: -0.5 }}>
          <svg width="40" height="41" viewBox="0 0 29 30" fill="none">
            <path
              d="M5 25h19M7 21h15L18 15V8H11v7l-4 6ZM10 8h9M14.5 2v6M11.5 5h6"
              stroke="#2d5a3d"
              strokeWidth="1.8"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
          <span>chessplain</span>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 28 }}>
          <div style={{ fontSize: 82, lineHeight: 1.05, color: '#1c2826', letterSpacing: -2, maxWidth: 900 }}>
            A little clarity. A better next game.
          </div>
          <div style={{ fontSize: 34, lineHeight: 1.35, color: '#4a5754', maxWidth: 880 }}>
            The few moments that decided your chess game — explained, and playable on the board.
          </div>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: 14, fontSize: 26, color: '#2d5a3d' }}>
          <div style={{ width: 44, height: 3, backgroundColor: '#2d5a3d' }} />
          <span>getchessplain.com</span>
        </div>
      </div>
    ),
    size
  );
}
