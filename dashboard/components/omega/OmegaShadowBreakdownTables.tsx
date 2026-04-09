import type { OmegaDerivedStats, SessionAgg } from '@/lib/omegaShadowAggregates';
import { OmegaShadowSessionRow } from '@/components/omega/OmegaShadowSessionRow';

interface OmegaShadowBreakdownTablesProps {
  derived: OmegaDerivedStats;
}

const emptyBucket: SessionAgg = { n: 0, resolved: 0, tp1r: 0, sl: 0 };

export function OmegaShadowBreakdownTables({
  derived,
}: OmegaShadowBreakdownTablesProps) {
  const { sessionMap, regimeMap } = derived;

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
      <div className="rounded-lg border border-slate-200 bg-white p-4">
        <div className="text-xs font-medium text-slate-500 uppercase tracking-wide mb-3">
          By session
        </div>
        <table className="w-full">
          <thead>
            <tr className="text-xs text-slate-400">
              <th className="text-left pb-2">Session</th>
              <th className="text-right pb-2">Signals</th>
              <th className="text-right pb-2">Resolved</th>
              <th className="text-right pb-2">r1HitRate</th>
            </tr>
          </thead>
          <tbody>
            {['London', 'overlap', 'NY', 'Asian'].map((sess) => (
              <OmegaShadowSessionRow
                key={sess}
                session={sess}
                bucket={sessionMap[sess] ?? emptyBucket}
              />
            ))}
          </tbody>
        </table>
      </div>

      <div className="rounded-lg border border-slate-200 bg-white p-4">
        <div className="text-xs font-medium text-slate-500 uppercase tracking-wide mb-3">
          By regime
        </div>
        <table className="w-full">
          <thead>
            <tr className="text-xs text-slate-400">
              <th className="text-left pb-2">Regime</th>
              <th className="text-right pb-2">Signals</th>
              <th className="text-right pb-2">Resolved</th>
              <th className="text-right pb-2">r1HitRate</th>
            </tr>
          </thead>
          <tbody>
            {['trending', 'ranging', 'reverting'].map((reg) => (
              <OmegaShadowSessionRow
                key={reg}
                session={reg}
                bucket={regimeMap[reg] ?? emptyBucket}
              />
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
