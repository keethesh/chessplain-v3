'use client';

interface AnalysisWaitStateProps {
  status: string;
  stalled?: boolean;
  onRetry?: () => void;
  playerNames?: string;
}

const STEPS = ['Reading the game', 'Checking the turning points', 'Writing the explanation'];

function stepIndex(status: string): number {
  if (status === 'verifying') return 1;
  if (status === 'explaining') return 2;
  return 0;
}

export function AnalysisWaitState({ status, stalled, onRetry, playerNames }: AnalysisWaitStateProps) {
  const active = stepIndex(status);
  const live = `${STEPS[active]}.${stalled ? ' This is taking longer than usual.' : ''}`;

  return (
    <div className="page report-wait">
      <h1 className="h2">{playerNames ? `Reviewing ${playerNames}` : 'Reading the game.'}</h1>
      <p className="report-status" role="status">{live}</p>
      <ol className="report-steps">
        {STEPS.map((label, index) => {
          const state = index < active ? 'done' : index === active ? 'current' : 'todo';
          return (
            <li key={label} data-state={state} aria-current={state === 'current' ? 'step' : undefined}>
              {state === 'done' && <span className="sr-only">Done. </span>}
              {label}
            </li>
          );
        })}
      </ol>
      {stalled && onRetry && (
        <button type="button" className="btn report-retry" onClick={onRetry}>Check again</button>
      )}
    </div>
  );
}
