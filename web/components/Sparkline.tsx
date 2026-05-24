'use client';

import { LineChart, Line, ResponsiveContainer } from 'recharts';

interface Props {
  data: number[];  // score values, oldest first
}

export default function Sparkline({ data }: Props) {
  if (data.length < 2) {
    return <span className="text-muted text-xs">—</span>;
  }
  const points = data.map((v, i) => ({ i, v }));
  const last = data[data.length - 1];
  const prev = data[data.length - 2];
  const color = last >= prev ? '#22c55e' : '#ef4444';

  return (
    <div className="w-20 h-6 inline-block">
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={points}>
          <Line
            type="monotone"
            dataKey="v"
            stroke={color}
            strokeWidth={1.5}
            dot={false}
            isAnimationActive={false}
          />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}
