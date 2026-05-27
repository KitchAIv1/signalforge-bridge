'use client';

import type { AmdState } from '@/lib/types';

interface AmdShiftedStructureSectionProps {
  selectedRow: AmdState;
}

interface RatioTileProps {
  label: string;
  ratioText: string;
}

function formatRatio(ratio: number | null | undefined, digits: number): string {
  if (ratio == null) return '—';
  return ratio.toFixed(digits);
}

function structureColor(marketStructure: string | null | undefined): string {
  if (marketStructure === 'ASIAN_DOMINANT') return 'border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-800 dark:bg-emerald-950/40 dark:text-emerald-300';
  if (marketStructure === 'JUDAS_DOMINANT') return 'border-orange-200 bg-orange-50 text-orange-700 dark:border-orange-800 dark:bg-orange-950/40 dark:text-orange-300';
  if (marketStructure === 'MIXED') return 'border-slate-200 bg-slate-50 text-slate-700 dark:border-slate-700 dark:bg-slate-800/70 dark:text-slate-300';
  return 'border-slate-200 bg-slate-50 text-slate-500 dark:border-slate-700 dark:bg-slate-800/60 dark:text-slate-400';
}

function directionColor(asianDirection: string | null | undefined): string {
  if (asianDirection === 'long') return 'text-emerald-600 dark:text-emerald-400';
  if (asianDirection === 'short') return 'text-red-500 dark:text-red-400';
  return 'text-slate-500 dark:text-slate-400';
}

function RatioTile({ label, ratioText }: RatioTileProps) {
  return (
    <div className="rounded-md bg-white px-3 py-2 dark:bg-slate-900/70">
      <p className="text-xs text-slate-500 dark:text-slate-400">{label}</p>
      <p className="mt-0.5 font-mono text-sm font-semibold text-slate-800 dark:text-slate-200">
        {ratioText}
      </p>
    </div>
  );
}

export function AmdShiftedStructureSection({ selectedRow }: AmdShiftedStructureSectionProps) {
  if (selectedRow.amd_tag !== 'AMD_SHIFTED') return null;

  const marketStructure = selectedRow.market_structure_type ?? '—';
  const asianDirection = selectedRow.asian_net_direction ?? '—';

  return (
    <div className="rounded-lg border border-blue-100 bg-blue-50/50 p-3 dark:border-blue-900/70 dark:bg-blue-950/20">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <div>
          <h3 className="text-xs font-semibold uppercase tracking-wide text-blue-600 dark:text-blue-300">
            Shifted Market Structure
          </h3>
          <p className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">
            Stored Asian dominance readout for AMD_SHIFTED days.
          </p>
        </div>
        <span className={`rounded-full border px-2.5 py-1 text-xs font-semibold ${structureColor(selectedRow.market_structure_type)}`}>
          {marketStructure}
        </span>
      </div>

      <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
        <RatioTile label="Judas/Range" ratioText={formatRatio(selectedRow.judas_to_range_ratio, 2)} />
        <RatioTile label="Asian Drift" ratioText={formatRatio(selectedRow.asian_drift_ratio, 3)} />
        <RatioTile label="Asian Dominance" ratioText={formatRatio(selectedRow.asian_dominance_ratio, 1)} />
      </div>

      <div className="mt-2 rounded-md bg-white px-3 py-2 dark:bg-slate-900/70">
        <p className="text-xs text-slate-500 dark:text-slate-400">Asian Direction</p>
        <p className={`mt-0.5 text-sm font-semibold uppercase ${directionColor(selectedRow.asian_net_direction)}`}>
          {asianDirection}
        </p>
      </div>
    </div>
  );
}
