import { ImageResponse } from 'next/og';
import { ogFont } from './og-font';

export const size = { width: 1200, height: 630 };
export const contentType = 'image/png';
export const alt = 'Chessplain: find the mistake you keep making.';

export default async function OpengraphImage() {
  const font = await ogFont;
  return new ImageResponse(
    (
      <div style={{ width: '100%', height: '100%', display: 'flex', flexDirection: 'column', justifyContent: 'space-between', background: '#ffffff', padding: '68px 76px', color: '#0A0A0A', fontFamily: 'Archivo' }}>
        <div style={{ display: 'flex', fontSize: 32, fontWeight: 900, letterSpacing: -0.5 }}>CHESSPLAIN</div>
        <div style={{ display: 'flex', flexDirection: 'column' }}>
          <div style={{ display: 'flex', fontSize: 84, fontWeight: 900, lineHeight: 0.9, letterSpacing: -1 }}>FIND THE</div>
          <div style={{ display: 'flex', fontSize: 84, fontWeight: 900, lineHeight: 0.9, letterSpacing: -1 }}>MISTAKE YOU</div>
          <div style={{ display: 'flex', marginTop: 14 }}>
            <div style={{ display: 'flex', background: '#FEFFB0', fontSize: 84, fontWeight: 900, lineHeight: 0.9, letterSpacing: -1, padding: '6px 14px' }}>KEEP MAKING.</div>
          </div>
        </div>
        <div style={{ display: 'flex', fontSize: 28, color: '#4A4A4A' }}>getchessplain.com</div>
      </div>
    ),
    { ...size, fonts: [{ name: 'Archivo', data: font, weight: 900, style: 'normal' }] },
  );
}
