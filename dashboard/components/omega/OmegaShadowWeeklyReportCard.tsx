import type { OmegaWeeklyReportRow } from '@/lib/types';
import { omegaPct, omegaR2 } from '@/lib/omegaShadowFormat';

interface OmegaShadowWeeklyReportCardProps {
  weeklyReport: OmegaWeeklyReportRow;
}

export function OmegaShadowWeeklyReportCard({
  weeklyReport,
}: OmegaShadowWeeklyReportCardProps) {
  return (
    <div className="rounded-lg border border-slate-200 bg-white p-4">
      <div className="text-xs font-medium text-slate-500 uppercase tracking-wide mb-3">
        Weekly report — {weeklyReport.week_start} to {weeklyReport.week_end}
      </div>
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-sm">
        <div>
          <div className="text-xs text-slate-400">Signals</div>
          <div className="font-medium text-slate-700">
            {weeklyReport.signals_fired}
          </div>
        </div>
        <div>
          <div className="text-xs text-slate-400">r1HitRate</div>
          <div className="font-medium text-slate-700">
            {weeklyReport.r1_hit_rate !== null
              ? omegaPct(weeklyReport.r1_hit_rate)
              : '—'}
          </div>
        </div>
        <div>
          <div className="text-xs text-slate-400">Avg MFE</div>
          <div className="font-medium text-slate-700">
            {weeklyReport.avg_mfe_r !== null
              ? `${omegaR2(weeklyReport.avg_mfe_r)}R`
              : '—'}
          </div>
        </div>
        <div>
          <div className="text-xs text-slate-400">Optimal TP</div>
          <div className="font-medium text-slate-700">
            {weeklyReport.optimal_tp_r !== null
              ? `${weeklyReport.optimal_tp_r}R`
              : '—'}
          </div>
        </div>
      </div>
    </div>
  );
}
