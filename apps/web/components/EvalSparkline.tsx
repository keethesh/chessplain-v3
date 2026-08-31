'use client';

import React from 'react';

interface EvalSparklineProps {
  moments: Array<{ ply: number; eval_swing: number }>;
  activePly?: number;
  onSelectPly?: (ply: number) => void;
}

export function EvalSparkline({ moments, activePly, onSelectPly }: EvalSparklineProps) {
  if (!moments || moments.length === 0) return null;

  // Simple sparkline calculation
  const width = 100;
  const height = 36;
  const maxPly = Math.max(...moments.map((m) => m.ply), 40);

  const points = moments.map((m) => {
    const x = (m.ply / maxPly) * (width - 10) + 5;
    // Map eval swing (e.g. -5 to 0) to y height
    const normalizedSwing = Math.max(-6, Math.min(6, m.eval_swing));
    const y = height / 2 - (normalizedSwing / 6) * (height / 2 - 4);
    return { x, y, ply: m.ply };
  });

  const pathD = points.length > 0 ? `M0 ${height / 2} ` + points.map((p) => `L${p.x.toFixed(1)} ${p.y.toFixed(1)}`).join(' ') : '';

  return (
    <div className="w-full">
      <svg
        viewBox={`0 0 ${width} ${height}`}
        preserveAspectRatio="none"
        className="w-full h-10 overflow-visible"
        aria-hidden="true"
      >
        <line
          x1="0"
          y1={height / 2}
          x2={width}
          y2={height / 2}
          stroke="var(--w-border)"
          strokeWidth="1"
          strokeDasharray="2 2"
        />
        {pathD && (
          <path
            d={pathD}
            fill="none"
            stroke="var(--w-ink2)"
            strokeWidth="1.5"
            vectorEffect="non-scaling-stroke"
          />
        )}
        {points.map((p, idx) => {
          const isActive = p.ply === activePly;
          return (
            <circle
              key={idx}
              cx={p.x}
              cy={p.y}
              r={isActive ? 4.5 : 3}
              fill={isActive ? 'var(--w-accent)' : 'var(--w-ink2)'}
              className="cursor-pointer transition-all hover:scale-125"
              onClick={() => onSelectPly?.(p.ply)}
            />
          );
        })}
      </svg>
      <p className="t-caption muted mt-1 text-center">How the game swung · click dots to inspect moments</p>
    </div>
  );
}
