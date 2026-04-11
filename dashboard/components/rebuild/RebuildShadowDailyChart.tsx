import type { RebuildDailyPoint } from '@/lib/rebuildShadowAggregates';
import { REBUILD_CHART_TARGET_RATE } from '@/lib/rebuildShadowConstants';

interface RebuildShadowDailyChartProps {
  series: RebuildDailyPoint[];
}

export function RebuildShadowDailyChart({ series }: RebuildShadowDailyChartProps) {
  const w = 640;
  const h = 220;
  const padL = 40;
  const padR = 12;
  const padT = 16;
  const padB = 28;
  const innerW = w - padL - padR;
  const innerH = h - padT - padB;
  const n = series.length;
  const xDenom = n <= 1 ? 1 : n - 1;

  const xAt = (i: number) => padL + (i / xDenom) * innerW;
  const yAt = (rate: number) => padT + innerH * (1 - Math.min(1, Math.max(0, rate)));

  const tpPoints = series
    .map((p, i) => {
      const y = p.tpRate != null ? yAt(p.tpRate) : null;
      if (y == null) return '';
      return `${xAt(i)},${y}`;
    })
    .filter(Boolean)
    .join(' ');

  const r1Points = series
    .map((p, i) => {
      const y = p.r1Rate != null ? yAt(p.r1Rate) : null;
      if (y == null) return '';
      return `${xAt(i)},${y}`;
    })
    .filter(Boolean)
    .join(' ');

  const targetY = yAt(REBUILD_CHART_TARGET_RATE);

  return (
    <div className="rounded-lg border border-slate-200 bg-white p-4">
      <div className="text-xs font-medium text-slate-500 uppercase tracking-wide mb-1">
        Daily performance
      </div>
      <div className="text-xs text-slate-400 mb-3">
        TP rate and R1 hit rate by resolved day · target {Math.round(REBUILD_CHART_TARGET_RATE * 100)}%
      </div>
      {series.length < 1 ? (
        <div className="text-sm text-slate-400 py-8">No resolved days yet.</div>
      ) : (
        <svg viewBox={`0 0 ${w} ${h}`} className="w-full max-w-3xl h-auto">
          <line
            x1={padL}
            x2={w - padR}
            y1={targetY}
            y2={targetY}
            stroke="#cbd5e1"
            strokeDasharray="6 4"
            strokeWidth={1}
          />
          <text x={padL} y={targetY - 4} className="fill-slate-400 text-[10px]">
            60%
          </text>
          {[0, 0.25, 0.5, 0.75, 1].map((t) => {
            const y = yAt(t);
            return (
              <g key={t}>
                <line
                  x1={padL}
                  x2={w - padR}
                  y1={y}
                  y2={y}
                  stroke="#f1f5f9"
                  strokeWidth={1}
                />
                <text x={4} y={y + 3} className="fill-slate-400 text-[9px]">
                  {Math.round(t * 100)}%
                </text>
              </g>
            );
          })}
          <polyline
            fill="none"
            stroke="#059669"
            strokeWidth={2}
            points={tpPoints}
          />
          <polyline
            fill="none"
            stroke="#2563eb"
            strokeWidth={2}
            points={r1Points}
          />
          {series.map((p, i) => (
            <text
              key={p.day}
              x={xAt(i)}
              y={h - 6}
              textAnchor="middle"
              className="fill-slate-500 text-[9px]"
            >
              {p.day.slice(5)}
            </text>
          ))}
        </svg>
      )}
      <div className="flex gap-4 text-xs text-slate-600 mt-2">
        <span className="flex items-center gap-1">
          <span className="inline-block w-3 h-0.5 bg-emerald-600" /> TP rate
        </span>
        <span className="flex items-center gap-1">
          <span className="inline-block w-3 h-0.5 bg-blue-600" /> R1 rate
        </span>
      </div>
    </div>
  );
}
