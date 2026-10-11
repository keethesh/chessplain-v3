import type { Metadata } from 'next';
import { Prototype } from './Prototype';
import './prototype.css';

// Throwaway design prototype for comparing a new visual direction. Not linked
// from the site and not indexed; delete once the direction is decided.
export const metadata: Metadata = {
  title: 'Prototype | Chessplain',
  robots: { index: false, follow: false },
};

export default function PrototypePage() {
  return (
    <>
      <link rel="stylesheet" precedence="default" href="https://fonts.googleapis.com/css2?family=Archivo:wdth,wght@125,800;125,900&display=swap" />
      <link rel="stylesheet" precedence="default" href="https://api.fontshare.com/v2/css?f[]=satoshi@400,500,700&display=swap" />
      <Prototype />
    </>
  );
}
