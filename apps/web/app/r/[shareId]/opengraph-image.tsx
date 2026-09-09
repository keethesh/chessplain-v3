import { ImageResponse } from 'next/og';
import { DEMO_REPORT } from '../../../lib/demo-report';
import { getReportByShareId } from '../../../lib/api';

// A shared review is the main organic distribution path: someone posts their
// link on X or in a Discord and the preview has to earn the click. Render the
// report's real headline rather than the generic site card.
export const size = { width: 1200, height: 630 };
export const contentType = 'image/png';
export const alt = 'A Chessplain game review';

function clamp(text: string, max: number): string {
  return text.length > max ? `${text.slice(0, max - 1).trimEnd()}…` : text;
}

export default async function ShareOpengraphImage({ params }: { params: Promise<{ shareId: string }> }) {
  const { shareId } = await params;
  let report = null;

  try {
    report = shareId === 'demo-sample' ? DEMO_REPORT : await getReportByShareId(shareId);
  } catch {
    // Fall through to the generic wording below.
  }

  const headline = clamp(report?.summary?.headline?.trim() || 'A chess game, a little clearer.', 96);
  const players = [report?.player_name, report?.opponent_name].filter(Boolean).join('  vs  ');
  const momentCount = report?.moments?.length ?? 0;
  const meta = [
    players || 'A reviewed game',
    momentCount === 1 ? '1 key moment' : momentCount > 0 ? `${momentCount} key moments` : null,
    report?.move_count ? `${report.move_count} moves` : null,
  ]
    .filter(Boolean)
    .join('   ·   ');

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
          padding: '68px 76px',
          fontFamily: 'Georgia, serif',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 14, color: '#1c2826', fontSize: 30 }}>
            <svg width="36" height="37" viewBox="0 0 29 30" fill="none">
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
          <div style={{ fontSize: 24, color: '#4a5754' }}>Game review</div>
        </div>

        <div
          style={{
            display: 'flex',
            fontSize: headline.length > 60 ? 62 : 74,
            lineHeight: 1.08,
            color: '#1c2826',
            letterSpacing: -1.5,
            maxWidth: 1000,
          }}
        >
          {headline}
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
          <div style={{ width: 56, height: 3, backgroundColor: '#2d5a3d' }} />
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: 25, color: '#4a5754' }}>
            <span>{clamp(meta, 74)}</span>
            <span style={{ color: '#2d5a3d' }}>getchessplain.com</span>
          </div>
        </div>
      </div>
    ),
    size
  );
}
