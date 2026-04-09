interface OmegaShadowGateRowProps {
  label: string;
  current: string;
  threshold: string;
  met: boolean | null;
  pending?: boolean;
}

export function OmegaShadowGateRow({
  label,
  current,
  threshold,
  met,
  pending,
}: OmegaShadowGateRowProps) {
  const icon = pending ? '○' : met ? '✓' : '✗';
  const color = pending
    ? 'text-slate-400'
    : met
      ? 'text-emerald-600'
      : 'text-red-500';
  return (
    <div className="flex items-center gap-3 py-2 border-b border-slate-100 last:border-0 text-sm">
      <span className={`font-mono text-base w-5 ${color}`}>{icon}</span>
      <span className="flex-1 text-slate-700">{label}</span>
      <span className="text-slate-500">{current}</span>
      <span className="text-slate-400 text-xs">vs {threshold}</span>
    </div>
  );
}
