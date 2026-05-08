'use client';

type CurveTooltipSeries = {
  dataKey?: string | number;
  name?: string;
  value?: number;
  color?: string;
};

interface CurveTooltipProps {
  active?: boolean;
  label?: string;
  payload?: readonly CurveTooltipSeries[];
}

export function CurveTooltip({ active, payload, label }: CurveTooltipProps) {
  if (!active || !payload?.length) return null;
  return (
    <div
      style={{
        background: '#111827',
        border: '1px solid #1e2d3d',
        borderRadius: 8,
        padding: '10px 14px',
        fontFamily: "'Roboto Mono', monospace",
        fontSize: 12,
      }}
    >
      <div style={{ color: '#64748b', marginBottom: 6 }}>{label}</div>
      {payload.map((series) => (
        <div key={String(series.dataKey)} style={{ color: series.color, marginBottom: 2 }}>
          {series.name}: {series.value != null && series.value >= 0 ? '+' : ''}
          {series.value}R
        </div>
      ))}
    </div>
  );
}
