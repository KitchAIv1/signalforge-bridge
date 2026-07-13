'use client';

import type { BridgeTradeLogRow } from '@/lib/types';
import { computeAlphaOmegaScoreboard } from '@/lib/alphaOmegaScoreboardStats';
import {
  formatSignedDollars,
  formatSignedPips,
} from '@/lib/alphaOmegaTradeDisplay';

interface AlphaOmegaScoreboardProps {
  tradeRows: BridgeTradeLogRow[];
}

export function AlphaOmegaScoreboard({ tradeRows }: AlphaOmegaScoreboardProps) {
  const metrics = computeAlphaOmegaScoreboard(tradeRows);
  return (
    <div className="space-y-3">
      <PrimaryMetricRow metrics={metrics} />
      <SecondaryMetricRow metrics={metrics} />
    </div>
  );
}

function PrimaryMetricRow({
  metrics,
}: {
  metrics: ReturnType<typeof computeAlphaOmegaScoreboard>;
}) {
  const winRateLabel =
    metrics.winRatePct != null ? `${metrics.winRatePct.toFixed(0)}%` : '—';
  const avgPair = `${metrics.avgWinPips != null ? formatSignedPips(metrics.avgWinPips) : '—'} / ${
    metrics.avgLossPips != null ? formatSignedPips(metrics.avgLossPips) : '—'
  }`;
  return (
    <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
      <ScoreCard
        label="Today net"
        value={formatSignedPips(metrics.todayNetPips)}
        hint={formatSignedDollars(metrics.todayNetDollars)}
        valueClass={netToneClass(metrics.todayNetPips)}
      />
      <ScoreCard
        label="7d net"
        value={formatSignedPips(metrics.weekNetPips)}
        hint={formatSignedDollars(metrics.weekNetDollars)}
        valueClass={netToneClass(metrics.weekNetPips)}
      />
      <ScoreCard
        label="Win rate"
        value={winRateLabel}
        hint={`${metrics.winCount}W / ${metrics.lossCount}L · ${metrics.closedCount} closed`}
      />
      <ScoreCard label="Avg win / loss" value={avgPair} hint="Payoff asymmetry" />
    </div>
  );
}

function SecondaryMetricRow({
  metrics,
}: {
  metrics: ReturnType<typeof computeAlphaOmegaScoreboard>;
}) {
  return (
    <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
      <ScoreCard
        label="Entries taken"
        value={String(metrics.entriesTaken)}
        hint="Lane B EXECUTED fills"
        valueClass="text-emerald-600 dark:text-emerald-300"
      />
      <ScoreCard
        label="Speed-floor shadows"
        value={String(metrics.speedFloorShadows)}
        hint="Would-enter, too fast"
        valueClass="text-violet-600 dark:text-violet-300"
      />
      <ExitMixCard
        opposing={metrics.exitOpposing}
        hardStop={metrics.exitHardStop}
        backstop={metrics.exitBackstop}
        other={metrics.exitOther}
      />
    </div>
  );
}

function netToneClass(netPips: number): string {
  if (netPips > 0) return 'text-emerald-600 dark:text-emerald-300';
  if (netPips < 0) return 'text-red-600 dark:text-red-300';
  return 'text-slate-900 dark:text-slate-100';
}

function ScoreCard({
  label,
  value,
  hint,
  valueClass,
}: {
  label: string;
  value: string;
  hint: string;
  valueClass?: string;
}) {
  return (
    <div className="rounded-lg border border-slate-200 bg-white p-3 dark:border-slate-700 dark:bg-slate-900">
      <p className="text-[11px] font-medium uppercase tracking-wide text-slate-500">{label}</p>
      <p
        className={`mt-1 text-xl font-semibold tabular-nums ${valueClass ?? 'text-slate-900 dark:text-slate-100'}`}
      >
        {value}
      </p>
      <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">{hint}</p>
    </div>
  );
}

function ExitMixCard({
  opposing,
  hardStop,
  backstop,
  other,
}: {
  opposing: number;
  hardStop: number;
  backstop: number;
  other: number;
}) {
  const total = opposing + hardStop + backstop + other;
  return (
    <div className="rounded-lg border border-slate-200 bg-white p-3 dark:border-slate-700 dark:bg-slate-900">
      <p className="text-[11px] font-medium uppercase tracking-wide text-slate-500">Exit mix</p>
      <p className="mt-1 text-xl font-semibold tabular-nums text-slate-900 dark:text-slate-100">
        {total} closed
      </p>
      <div className="mt-2 flex flex-wrap gap-1.5 text-[10px] font-medium">
        <ExitChip label="Opp" count={opposing} className="bg-sky-100 text-sky-800 dark:bg-sky-950/50 dark:text-sky-200" />
        <ExitChip label="HS" count={hardStop} className="bg-rose-100 text-rose-800 dark:bg-rose-950/50 dark:text-rose-200" />
        <ExitChip label="BS" count={backstop} className="bg-amber-100 text-amber-900 dark:bg-amber-950/50 dark:text-amber-200" />
        {other > 0 ? (
          <ExitChip label="Other" count={other} className="bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300" />
        ) : null}
      </div>
    </div>
  );
}

function ExitChip({
  label,
  count,
  className,
}: {
  label: string;
  count: number;
  className: string;
}) {
  return (
    <span className={`rounded px-1.5 py-0.5 tabular-nums ${className}`}>
      {label} {count}
    </span>
  );
}
