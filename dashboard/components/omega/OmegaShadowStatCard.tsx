interface OmegaShadowStatCardProps {
  label: string;
  value: string;
  sub?: string;
  color?: string;
}

export function OmegaShadowStatCard({
  label,
  value,
  sub,
  color,
}: OmegaShadowStatCardProps) {
  return (
    <div className="rounded-lg border border-slate-200 bg-white p-4">
      <div className="text-xs text-slate-500 mb-1">{label}</div>
      <div className={`text-2xl font-semibold ${color ?? 'text-slate-800'}`}>
        {value}
      </div>
      {sub && <div className="text-xs text-slate-400 mt-1">{sub}</div>}
    </div>
  );
}
