'use client';

import { OPTIMAL_WINDOWS } from '@/lib/intelligenceConstants';
import { amdTagColor, amdTagLabel } from '@/lib/amdPanelFormatters';
import type {
  AccumulationRow,
  AmdPerformanceRow,
  DirectionSourceRow,
  IntelligenceData,
  IntelligenceSnapshot,
  ObsThreshold,
  TimeGateRow,
} from '@/lib/intelligenceTypes';

const OBS_PANEL_TONES: Record<string, string> = {
  WATCHING: 'bg-slate-100 text-slate-600 border-slate-200',
  APPROACHING: 'bg-amber-50 text-amber-700 border-amber-200',
  READY_TO_ACT: 'bg-blue-50 text-blue-700 border-blue-200',
  ACTION_REQUIRED: 'bg-red-50 text-red-700 border-red-200',
};

function pctTowardGoal(currentReading: number, goalCap: number): number {
  return Math.min(100, Math.round((currentReading / goalCap) * 100));
}

function formatIsoStrip(isoUtc: string): string {
  return new Date(isoUtc).toLocaleDateString('en-GB', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  });
}

interface IntelligenceToolbarRowProps {
  onRefreshRolling: () => void;
}

export function IntelligencePageToolbar({ onRefreshRolling }: IntelligenceToolbarRowProps) {
  return (
    <div className="flex items-center justify-between">
      <h1 className="text-xl font-semibold text-slate-900 dark:text-slate-100">Intelligence</h1>
      <button
        type="button"
        onClick={onRefreshRolling}
        className="text-xs text-slate-500 hover:text-slate-700 underline"
      >
        Refresh data
      </button>
    </div>
  );
}

interface IntelligenceHealthRibbonProps {
  intelSnapshotSlice: IntelligenceData;
}

export function IntelligenceHealthRibbon({ intelSnapshotSlice }: IntelligenceHealthRibbonProps) {
  return (
    <section className="rounded-lg border border-slate-200 bg-white p-4">
      <h2 className="mb-3 text-sm font-semibold text-slate-700">System Health</h2>
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <div className="rounded border border-slate-100 bg-slate-50 px-3 py-2">
          <p className="text-xs text-slate-500">AMD Last Run</p>
          <p className="text-sm font-medium text-slate-800">
            {intelSnapshotSlice.last_amd_evaluated_at
              ? `${new Date(intelSnapshotSlice.last_amd_evaluated_at)
                  .getUTCHours()
                  .toString()
                  .padStart(2, '0')}:${new Date(intelSnapshotSlice.last_amd_evaluated_at)
                  .getUTCMinutes()
                  .toString()
                  .padStart(2, '0')} UTC`
              : '—'}
          </p>
        </div>
        <div className="rounded border border-slate-100 bg-slate-50 px-3 py-2">
          <p className="text-xs text-slate-500">Today&apos;s AMD Tag</p>
          <p className={`text-sm font-medium ${amdTagColor(intelSnapshotSlice.today_amd_tag)}`}>
            {amdTagLabel(intelSnapshotSlice.today_amd_tag)}
          </p>
        </div>
        <div className="rounded border border-slate-100 bg-slate-50 px-3 py-2">
          <p className="text-xs text-slate-500">Direction Mode</p>
          <p className="text-sm font-medium text-slate-800">
            {intelSnapshotSlice.direction_mode === 'auto' ? '⚡ AUTO' : '✋ MANUAL'} —{' '}
            {(intelSnapshotSlice.omega_direction ?? '—').toUpperCase()}
          </p>
        </div>
        <div className="rounded border border-slate-100 bg-slate-50 px-3 py-2">
          <p className="text-xs text-slate-500">Size Multiplier</p>
          <p className="text-sm font-medium text-slate-800">
            {intelSnapshotSlice.today_size_multiplier != null
              ? `${intelSnapshotSlice.today_size_multiplier.toFixed(2)}×`
              : '1.00×'}
          </p>
        </div>
      </div>
      <p className="mt-2 text-xs text-slate-500">
        {intelSnapshotSlice.total_amd_tagged_trades} AMD-tagged trades accumulated (last 30 days)
      </p>
    </section>
  );
}

interface ObservationBacklogPanelProps {
  obsBlocks: ObsThreshold[];
}

export function ObservationBacklogPanel({ obsBlocks }: ObservationBacklogPanelProps) {
  return (
    <section className="rounded-lg border border-slate-200 bg-white p-4 space-y-3">
      <h2 className="text-sm font-semibold text-slate-700">Observation Backlog</h2>
      {obsBlocks.map((thresholdRow) => {
        const backdrop =
          OBS_PANEL_TONES[thresholdRow.status] ?? OBS_PANEL_TONES.WATCHING;
        return (
          <div key={thresholdRow.id} className={`rounded border px-3 py-3 ${backdrop}`}>
            <div className="flex items-center justify-between mb-1">
              <span className="text-xs font-bold">{thresholdRow.id}</span>
              <span className="text-xs font-medium">
                {thresholdRow.status.replace(/_/g, ' ')}
              </span>
            </div>
            <p className="text-xs font-medium mb-1">{thresholdRow.label}</p>
            <p className="text-xs opacity-80 mb-2">{thresholdRow.hypothesis}</p>
            <div className="h-1.5 rounded-full bg-black/10 overflow-hidden">
              <div
                className="h-full rounded-full bg-current transition-all"
                style={{
                  width: `${pctTowardGoal(thresholdRow.current_n, thresholdRow.threshold_n)}%`,
                }}
              />
            </div>
            <p className="text-xs mt-1 opacity-70">
              {thresholdRow.current_n} / {thresholdRow.threshold_n} — {thresholdRow.action_when_ready}
            </p>
          </div>
        );
      })}
    </section>
  );
}

interface TimeGateTablePanelProps {
  gateRows: TimeGateRow[];
}

export function TimeGateTablePanel({ gateRows }: TimeGateTablePanelProps) {
  return (
    <section className="rounded-lg border border-slate-200 bg-white p-4">
      <h2 className="mb-1 text-sm font-semibold text-slate-700">Time Gate Monitoring</h2>
      <p className="mb-3 text-xs text-slate-500">
        Optimal entry windows per AMD tag from 272-day backtest. Green = inside window, red =
        outside.
      </p>
      {gateRows.length === 0 ? (
        <p className="text-sm text-slate-500">No AMD-tagged trades yet. Accumulating…</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full min-w-[500px] text-left text-xs">
            <thead>
              <tr className="border-b border-slate-200 text-slate-500">
                <th className="pb-2 pr-3 font-medium">AMD Tag</th>
                <th className="pb-2 pr-3 font-medium">Entry Hour (UTC)</th>
                <th className="pb-2 pr-3 font-medium">Optimal Window</th>
                <th className="pb-2 pr-3 font-medium">n</th>
                <th className="pb-2 pr-3 font-medium">Avg R</th>
                <th className="pb-2 font-medium">Win %</th>
              </tr>
            </thead>
            <tbody>
              {gateRows.map((gateRowSample) => {
                const optimalBand = OPTIMAL_WINDOWS[gateRowSample.amd_tag];
                const rowAccent = gateRowSample.in_optimal_window
                  ? 'bg-emerald-50/50'
                  : 'bg-red-50/30';
                const signedAvgR =
                  `${gateRowSample.avg_pnl_r > 0 ? '+' : ''}${gateRowSample.avg_pnl_r}R`;

                return (
                  <tr
                    key={`${gateRowSample.amd_tag}-${gateRowSample.utc_hour}`}
                    className={`border-b border-slate-100 ${rowAccent}`}
                  >
                    <td
                      className={`py-1.5 pr-3 font-medium ${amdTagColor(gateRowSample.amd_tag)}`}
                    >
                      {gateRowSample.amd_tag.replace('AMD_', '')}
                    </td>
                    <td className="py-1.5 pr-3">{gateRowSample.utc_hour}:00</td>
                    <td className="py-1.5 pr-3 text-slate-500">
                      {optimalBand
                        ? `${optimalBand.entry}:00 – ${optimalBand.exit}:00`
                        : '—'}
                    </td>
                    <td className="py-1.5 pr-3">{gateRowSample.n_trades}</td>
                    <td
                      className={`py-1.5 pr-3 font-medium ${
                        gateRowSample.avg_pnl_r >= 0 ? 'text-emerald-600' : 'text-red-600'
                      }`}
                    >
                      {signedAvgR}
                    </td>
                    <td className="py-1.5">{gateRowSample.win_rate_pct}%</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}

interface TagPerformanceDeckProps {
  perfRowsRoll: AmdPerformanceRow[];
}

export function TagPerformanceDeck({ perfRowsRoll }: TagPerformanceDeckProps) {
  return (
    <section className="rounded-lg border border-slate-200 bg-white p-4">
      <h2 className="mb-1 text-sm font-semibold text-slate-700">AMD Tag Performance</h2>
      <p className="mb-3 text-xs text-slate-500">Last 30 days — AMD-tagged Omega executed trades only.</p>
      {perfRowsRoll.length === 0 ? (
        <p className="text-sm text-slate-500">No AMD-tagged trades yet.</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full min-w-[500px] text-left text-xs">
            <thead>
              <tr className="border-b border-slate-200 text-slate-500">
                <th className="pb-2 pr-3 font-medium">AMD Tag</th>
                <th className="pb-2 pr-3 font-medium">n</th>
                <th className="pb-2 pr-3 font-medium">Avg R</th>
                <th className="pb-2 pr-3 font-medium">Win %</th>
                <th className="pb-2 font-medium">Avg Size</th>
              </tr>
            </thead>
            <tbody>
              {perfRowsRoll.map((perfRowReading) => {
                const avgRSigned = `${perfRowReading.avg_pnl_r > 0 ? '+' : ''}${perfRowReading.avg_pnl_r}R`;

                return (
                  <tr key={perfRowReading.amd_tag} className="border-b border-slate-100">
                    <td
                      className={`py-1.5 pr-3 font-medium ${amdTagColor(perfRowReading.amd_tag)}`}
                    >
                      {amdTagLabel(perfRowReading.amd_tag)}
                    </td>
                    <td className="py-1.5 pr-3">{perfRowReading.n_trades}</td>
                    <td
                      className={`py-1.5 pr-3 font-medium ${
                        perfRowReading.avg_pnl_r >= 0 ? 'text-emerald-600' : 'text-red-600'
                      }`}
                    >
                      {avgRSigned}
                    </td>
                    <td className="py-1.5 pr-3">{perfRowReading.win_rate_pct}%</td>
                    <td className="py-1.5">{perfRowReading.avg_size_multiplier}×</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}

interface DirectionSourceDeckProps {
  sourceRowsDeck: DirectionSourceRow[];
}

export function DirectionSourceDeck({ sourceRowsDeck }: DirectionSourceDeckProps) {
  return (
    <section className="rounded-lg border border-slate-200 bg-white p-4">
      <h2 className="mb-1 text-sm font-semibold text-slate-700">Direction Source Performance</h2>
      <p className="mb-3 text-xs text-slate-500">Is AMD auto-direction outperforming manual?</p>
      {sourceRowsDeck.length === 0 ? (
        <p className="text-sm text-slate-500">No data yet.</p>
      ) : (
        <div className="flex flex-wrap gap-3">
          {sourceRowsDeck.map((deckRowReading) => {
            const avgRSignedDeck = `${deckRowReading.avg_pnl_r > 0 ? '+' : ''}${deckRowReading.avg_pnl_r}R avg`;

            return (
              <div
                key={deckRowReading.direction_source}
                className="rounded border border-slate-100 bg-slate-50 px-3 py-2 min-w-[140px]"
              >
                <p className="text-xs font-semibold text-slate-600 uppercase">
                  {deckRowReading.direction_source}
                </p>
                <p className="text-lg font-bold mt-1 text-slate-800">
                  {deckRowReading.n_trades} trades
                </p>
                <p
                  className={`text-sm font-medium ${
                    deckRowReading.avg_pnl_r >= 0 ? 'text-emerald-600' : 'text-red-600'
                  }`}
                >
                  {avgRSignedDeck}
                </p>
                <p className="text-xs text-slate-500">{deckRowReading.win_rate_pct}% win rate</p>
              </div>
            );
          })}
        </div>
      )}
    </section>
  );
}

interface AccumulationTablePanelProps {
  accumBands: AccumulationRow[];
}

export function AccumulationTablePanel({ accumBands }: AccumulationTablePanelProps) {
  return (
    <section className="rounded-lg border border-slate-200 bg-white p-4">
      <h2 className="mb-1 text-sm font-semibold text-slate-700">Accumulation Monitoring</h2>
      <p className="mb-3 text-xs text-slate-500">
        Asian range distribution last 30 days. Watching transition zone (35-49 pips flat) — OBS-001.
      </p>
      {accumBands.length === 0 ? (
        <p className="text-sm text-slate-500">No data yet.</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full min-w-[400px] text-left text-xs">
            <thead>
              <tr className="border-b border-slate-200 text-slate-500">
                <th className="pb-2 pr-3 font-medium">Range Bucket</th>
                <th className="pb-2 pr-3 font-medium">Flat?</th>
                <th className="pb-2 pr-3 font-medium">AMD Tag</th>
                <th className="pb-2 font-medium">Days</th>
              </tr>
            </thead>
            <tbody>
              {accumBands.map((bucketRowReading, stripeIdx) => {
                const rangeCopy =
                  bucketRowReading.range_bucket === 'under_35'
                    ? '< 35 pips'
                    : bucketRowReading.range_bucket === 'transition_35_49'
                      ? '35-49 pips ⚠️'
                      : '≥ 50 pips';

                const flatCopy =
                  bucketRowReading.asian_is_flat === true
                    ? '✅ flat'
                    : bucketRowReading.asian_is_flat === false
                      ? '❌ drifting'
                      : '—';

                const zebraHighlight =
                  bucketRowReading.range_bucket === 'transition_35_49' &&
                  bucketRowReading.asian_is_flat === true;

                const rowStripeClass = zebraHighlight ? 'bg-amber-50/60' : '';

                const rowKeyStem = `${bucketRowReading.range_bucket}-${stripeIdx}-${bucketRowReading.amd_tag}-${String(bucketRowReading.asian_is_flat)}`;

                return (
                  <tr
                    key={rowKeyStem}
                    className={`border-b border-slate-100 ${rowStripeClass}`}
                  >
                    <td className="py-1.5 pr-3 font-medium text-slate-700">{rangeCopy}</td>
                    <td className="py-1.5 pr-3">{flatCopy}</td>
                    <td className={`py-1.5 pr-3 ${amdTagColor(bucketRowReading.amd_tag)}`}>
                      {bucketRowReading.amd_tag.replace('AMD_', '')}
                    </td>
                    <td className="py-1.5 font-medium">{bucketRowReading.n}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}

interface EvalHistoryStripProps {
  storedSnapshotsAscending: IntelligenceSnapshot[];
}

export function EvalHistoryStrip({ storedSnapshotsAscending }: EvalHistoryStripProps) {
  if (storedSnapshotsAscending.length === 0) return null;

  return (
    <section className="rounded-lg border border-slate-200 bg-white p-4">
      <h2 className="mb-3 text-sm font-semibold text-slate-700">Evaluation History</h2>
      <div className="space-y-2">
        {storedSnapshotsAscending.map((snapshotStrip) => {
          const freqKind =
            snapshotStrip.snapshot_type === 'weekly_auto' ? '📅 Weekly' : '🔄 Manual';

          return (
            <div
              key={snapshotStrip.id}
              className="flex items-center justify-between rounded border border-slate-100 bg-slate-50 px-3 py-2"
            >
              <div>
                <span className="text-xs font-medium text-slate-700">
                  {formatIsoStrip(snapshotStrip.snapshot_date)}
                </span>
                <span className="ml-2 text-xs text-slate-500">{freqKind}</span>
              </div>
              <div className="flex items-center gap-3">
                {snapshotStrip.trades_analyzed != null ? (
                  <span className="text-xs text-slate-500">
                    {snapshotStrip.trades_analyzed} trades
                  </span>
                ) : null}
                {snapshotStrip.claude_weekly_summary ? (
                  <span className="text-xs text-slate-600 max-w-[300px] truncate">
                    {snapshotStrip.claude_weekly_summary}
                  </span>
                ) : null}
              </div>
            </div>
          );
        })}
      </div>
    </section>
  );
}
