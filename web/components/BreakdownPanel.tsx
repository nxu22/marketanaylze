'use client';

import type { BreakdownItem } from '@/lib/types';

function ScoreBar({ points, maxPoints }: { points: number; maxPoints: number }) {
  const pct = maxPoints > 0 ? Math.min(100, (points / maxPoints) * 100) : 0;
  const color = pct >= 70 ? 'bg-green' : pct >= 40 ? 'bg-yellow' : 'bg-red';
  return (
    <div className="flex items-center gap-2">
      <div className="w-20 h-1.5 bg-surface rounded-full overflow-hidden">
        <div className={`h-full ${color}`} style={{ width: `${pct}%` }} />
      </div>
      <span className="text-dim text-xs">{points.toFixed(2)}/{maxPoints.toFixed(2)}</span>
    </div>
  );
}

function FactorRow({ item }: { item: BreakdownItem }) {
  const icon = item.sentiment === 'positive' ? '↑' : item.sentiment === 'negative' ? '↓' : '→';
  const iconColor = item.sentiment === 'positive' ? 'text-green' : item.sentiment === 'negative' ? 'text-red' : 'text-dim';

  return (
    <div className="border-b border-border py-3 px-1 last:border-0">
      <div className="flex items-center gap-3 flex-wrap">
        <span className={`w-4 text-center ${iconColor}`}>{icon}</span>
        <span className="w-36 text-txt">{item.factor}</span>
        <span className="w-28 text-accent">{item.displayValue}</span>
        <ScoreBar points={item.points} maxPoints={item.maxPoints} />
      </div>
      <p className="text-dim text-xs mt-1.5 ml-7">{item.explanation}</p>
    </div>
  );
}

interface Props {
  breakdown: BreakdownItem[];
}

export default function BreakdownPanel({ breakdown }: Props) {
  return (
    <div className="mt-2 bg-surface border border-border rounded p-4 text-xs">
      <div className="text-muted text-xs uppercase tracking-widest mb-2">因子明细</div>
      {breakdown.map(item => (
        <FactorRow key={item.factor} item={item} />
      ))}
    </div>
  );
}
