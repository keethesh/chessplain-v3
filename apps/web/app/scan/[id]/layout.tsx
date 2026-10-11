import type { Metadata } from 'next';

export const metadata: Metadata = { title: 'Your scan | Chessplain' };

export default function ScanLayout({ children }: { children: React.ReactNode }) {
  return children;
}
