import type { SessionAgg } from '@/lib/omegaShadowAggregates';
import { omegaPct } from '@/lib/omegaShadowFormat';

interface OmegaShadowSessionRowProps {
  session: string;
  bucket: SessionAgg;
}

export function OmegaShadowSessionRow({
  session,
  bucket,
}: OmegaShadowSessionRowProps) {
  const r1 =
    bucket.resolved > 0 ? bucket.tp1r / bucket.resolved : null;
  const barW = r1 !== null ? Math.round(r1 * 100) : 0;
  const barColor =
    r1 === null
      ? 'bg-slate-200'
      : r1 >= 0.6
        ? 'bg-emerald-500'
        : r1 >= 0.5
          ? 'bg-amber-400'
          : 'bg-red-400';
  return (
    <tr className="border-b border-slate-100 last:border-0">
      <td className="py-2 pr-4 text-sm font-medium text-slate-700 capitalize">
        {session}
      </td>
      <td className="py-2 pr-4 text-sm text-slate-500 text-right">{bucket.n}</td>
      <td className="py-2 pr-4 text-sm text-slate-500 text-right">
        {bucket.resolved}
      </td>
      <td className="py-2 pr-4 text-right">
        <div className="flex items-center gap-2 justify-end">
          <div className="w-20 h-2 bg-slate-100 rounded-full overflow-hidden">
            <div
              className={`h-full rounded-full ${barColor}`}
              style={{ width: barW + '%' }}
            />
          </div>
          <span className="text-sm font-medium text-slate-700 w-12 text-right">
            {r1 !== null ? omegaPct(r1) : '—'}
          </span>
        </div>
      </td>
    </tr>
  );
}
