'use client';

import type { RebuildShadowSignalRow } from '@/lib/types';
import {
  ACCOUNT_SIZE,
  computeCompoundedStats,
  SL_LEVEL_R,
  TP_LEVEL_R,
} from '@/lib/rebuildSimulatedPnLStats';

interface RebuildSimulatedPnLProps {
  signals: RebuildShadowSignalRow[];
}

export function RebuildSimulatedPnL({ signals }: RebuildSimulatedPnLProps) {
  const stats = computeCompoundedStats(signals);
  const isPositive = stats.totalPnlDollars >= 0;

  return (
    <div className="space-y-5 rounded-xl border border-slate-200 bg-white p-5">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-sm font-semibold text-slate-700">Simulated P&L — Compounded</h2>
          <p className="mt-0.5 text-xs text-slate-400">
            $1,000 starting capital · 1% risk per trade · compounds on every trade
          </p>
        </div>
        <div
          className={`rounded-lg px-3 py-1.5 text-sm font-bold ${
            isPositive ? 'bg-emerald-50 text-emerald-600' : 'bg-red-50 text-red-600'
          }`}
        >
          {isPositive ? '+' : ''}
          {stats.totalReturn.toFixed(2)}% return
        </div>
      </div>

      <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
        <div className="rounded-lg bg-slate-50 p-3">
          <div className="mb-1 text-xs text-slate-400">Current Balance</div>
          <div className={`text-xl font-bold ${isPositive ? 'text-emerald-600' : 'text-red-600'}`}>
            ${stats.runningBalance.toFixed(2)}
          </div>
          <div className="mt-0.5 text-xs text-slate-400">started at ${ACCOUNT_SIZE.toFixed(2)}</div>
        </div>

        <div className="rounded-lg bg-slate-50 p-3">
          <div className="mb-1 text-xs text-slate-400">Net P&L</div>
          <div className={`text-xl font-bold ${isPositive ? 'text-emerald-600' : 'text-red-600'}`}>
            {isPositive ? '+' : ''}${stats.totalPnlDollars.toFixed(2)}
          </div>
          <div className="mt-0.5 text-xs text-slate-400">avg ${stats.avgPnlDollars.toFixed(2)}/trade</div>
        </div>

        <div className="rounded-lg bg-slate-50 p-3">
          <div className="mb-1 text-xs text-slate-400">Win Rate</div>
          <div className="text-xl font-bold text-slate-800">{stats.winRate}%</div>
          <div className="mt-0.5 text-xs text-slate-400">
            {stats.wins}W · {stats.losses}L
            {stats.breakevens > 0 ? ` · ${stats.breakevens}BE` : ''}
          </div>
        </div>

        <div className="rounded-lg bg-slate-50 p-3">
          <div className="mb-1 text-xs text-slate-400">Resolved Trades</div>
          <div className="text-xl font-bold text-slate-800">{stats.resolved.length}</div>
          <div className="mt-0.5 text-xs text-slate-400">of {signals.length} total signals</div>
        </div>
      </div>

      <div>
        <div className="mb-2 text-xs font-medium text-slate-500">
          Current trade income (based on ${stats.runningBalance.toFixed(2)} balance)
        </div>
        <div className="grid grid-cols-3 gap-3">
          <div className="rounded-lg border border-emerald-100 bg-emerald-50 p-3 text-center">
            <div className="mb-1 text-xs text-slate-500">TP hit</div>
            <div className="text-lg font-bold text-emerald-600">+${stats.currentTpDollars.toFixed(2)}</div>
            <div className="mt-0.5 text-xs text-emerald-500">
              +{TP_LEVEL_R}R · 1.5× risk
            </div>
          </div>

          <div className="rounded-lg border border-red-100 bg-red-50 p-3 text-center">
            <div className="mb-1 text-xs text-slate-500">SL hit</div>
            <div className="text-lg font-bold text-red-600">-${stats.currentSlDollars.toFixed(2)}</div>
            <div className="mt-0.5 text-xs text-red-500">
              -{SL_LEVEL_R}R · 1× risk
            </div>
          </div>

          <div className="rounded-lg border border-slate-100 bg-slate-50 p-3 text-center">
            <div className="mb-1 text-xs text-slate-500">Risk per trade</div>
            <div className="text-lg font-bold text-slate-700">${stats.currentRiskDollars.toFixed(2)}</div>
            <div className="mt-0.5 text-xs text-slate-400">1% of balance</div>
          </div>
        </div>
      </div>

      <div className="border-t border-slate-100 pt-3 text-xs text-slate-400">
        Simulation only · based on shadow signal outcomes · not live execution · risk compounds on each
        resolved trade
      </div>
    </div>
  );
}
