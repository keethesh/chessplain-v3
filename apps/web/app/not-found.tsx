import Link from 'next/link';
import type { Metadata } from 'next';
import { Gremlin } from '../components/Gremlin';
import './status.css';

export const metadata: Metadata = {
  title: 'Page not found | Chessplain',
  robots: { index: false, follow: true },
};

// Links pasted into social apps get truncated, wrapped and
// re-typed, so a wrong URL is a normal arrival path rather than an edge case.
export default function NotFound() {
  return (
    <div className="page status-page">
      <div className="panel status-panel bg-concept" data-concept="missed_mate_threat">
        <Gremlin className="status-gremlin" concept="missed_mate_threat" size={200} priority />
        <div className="status-copy">
          <h1 className="h1">Nothing on this square!</h1>
          <p className="lede">The Mate Misser looked everywhere. The link may have been cut short when it was shared.</p>
          <div className="status-actions">
            <Link className="btn" href="/#scan">Find my gremlin <span className="arrow" aria-hidden="true">→</span></Link>
            <Link className="btn btn--key" href="/report/demo">Read a sample game</Link>
          </div>
        </div>
      </div>
    </div>
  );
}
