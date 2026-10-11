import { ImageResponse } from 'next/og';
import { DEMO_REPORT } from '../../../lib/demo-report';
import { getReportByShareId } from '../../../lib/api';
import { ogFont } from '../../og-font';

export const size = { width: 1200, height: 630 };
export const contentType = 'image/png';
export const alt = 'A Chessplain game review';

export default async function ShareOpengraphImage({ params }: { params: Promise<{ shareId: string }> }) {
  const { shareId } = await params;
  const reportPromise = shareId === 'demo-sample'
    ? Promise.resolve(DEMO_REPORT)
    : getReportByShareId(shareId).catch(() => null);
  const [report, font] = await Promise.all([reportPromise, ogFont]);

  const headlineSource = report?.summary?.headline?.trim() || 'Find the mistake you keep making.';
  const headline = headlineSource.length > 90 ? `${headlineSource.slice(0, 89).trimEnd()}…` : headlineSource;
  const playerLine = [report?.player_name, report?.opponent_name].filter(Boolean).join('  vs  ') || 'A reviewed game';
  const players = playerLine.length > 64 ? `${playerLine.slice(0, 63).trimEnd()}…` : playerLine;
  const fontSize = headline.length > 60 ? 52 : headline.length > 36 ? 64 : 76;

  return new ImageResponse(
    (
      <div style={{ width: '100%', height: '100%', display: 'flex', flexDirection: 'column', justifyContent: 'space-between', background: '#ffffff', padding: '64px 72px', color: '#0A0A0A', fontFamily: 'Archivo' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div style={{ display: 'flex', fontSize: 30, fontWeight: 900, letterSpacing: -0.5 }}>CHESSPLAIN</div>
          <div style={{ display: 'flex', background: '#FEFFB0', fontSize: 22, fontWeight: 900, letterSpacing: 1, padding: '8px 14px' }}>GAME REVIEW</div>
        </div>
        <div style={{ display: 'flex', fontSize, fontWeight: 900, lineHeight: 0.95, letterSpacing: -1, textTransform: 'uppercase', maxWidth: 1040 }}>{headline}</div>
        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 26, color: '#4A4A4A' }}>
          <div style={{ display: 'flex' }}>{players}</div>
          <div style={{ display: 'flex' }}>getchessplain.com</div>
        </div>
      </div>
    ),
    { ...size, fonts: [{ name: 'Archivo', data: font, weight: 900, style: 'normal' }] },
  );
}
