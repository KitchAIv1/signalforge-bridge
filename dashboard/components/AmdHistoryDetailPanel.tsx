'use client';

import type { ReactNode } from 'react';
import type { AmdState } from '@/lib/types';
import { AmdHistoryChart } from '@/components/AmdHistoryChart';

interface AmdHistoryDetailPanelProps {
  selectedRow: AmdState;
  onClose: () => void;
}

// Static tag parameter reference — hardcoded from production constants
// Source: AmdDistributionEngine.ts TAG_ENTRY_HOUR + TAG_HARD_EXIT_HOUR
const TAG_PARAMS: Record<string, {
  entryHour: string;
  exitHour: string;
  directionSource: string;
  window: string;
  exitStrategy: string;
}> = {
  AMD_TEXTBOOK: {
    entryHour: '12:00 UTC',
    exitHour: '13:00 UTC',
    directionSource: 'Judas inversion',
    window: '5-candle D1 (alignment only)',
    exitStrategy: 'S0 — pip trail',
  },
  AMD_COMPRESSION_BREAKOUT: {
    entryHour: '10:00 UTC',
    exitHour: '14:00 UTC',
    directionSource: 'Judas continuation',
    window: '5-candle D1 (alignment only)',
    exitStrategy: 'S0 — pip trail',
  },
  AMD_FAILED: {
    entryHour: '11:00 UTC',
    exitHour: '12:00 UTC',
    directionSource: 'D1 bias (5-candle, ≥3)',
    window: '5-candle D1',
    exitStrategy: 'S0 — pip trail',
  },
  AMD_SHIFTED: {
    entryHour: '12:00 UTC',
    exitHour: '13:00 UTC',
    directionSource: 'D1 bias (7-candle, ≥4)',
    window: '7-candle D1',
    exitStrategy: 'S0 — pip trail',
  },
  AMD_NONE: {
    entryHour: '10:00 UTC',
    exitHour: '11:00 UTC',
    directionSource: 'Judas inversion (TRENDING_WEAK) / D1 (TRENDING_STRONG)',
    window: '5-candle D1 for tier',
    exitStrategy: 'S1 — pip trail + time gate H11',
  },
  INSUFFICIENT_DATA: {
    entryHour: '—',
    exitHour: '—',
    directionSource: 'neutral — no data',
    window: '—',
    exitStrategy: '—',
  },
};

function StatTile({
  label,
  value,
  valueColor,
}: {
  label: string;
  value: string;
  valueColor?: string;
}) {
  return (
    <div className="rounded-md bg-slate-50 px-3 py-2 dark:bg-slate-800/60">
      <p className="text-xs text-slate-500 dark:text-slate-400">{label}</p>
      <p className={`mt-0.5 text-sm font-semibold ${valueColor ?? 'text-slate-800 dark:text-slate-200'}`}>
        {value}
      </p>
    </div>
  );
}

function directionColor(dir: string | null | undefined): string {
  if (dir === 'long') return 'text-emerald-600 dark:text-emerald-400';
  if (dir === 'short') return 'text-red-500 dark:text-red-400';
  return 'text-slate-500 dark:text-slate-400';
}

function biasColor(bias: string | null | undefined): string {
  if (bias === 'TRENDING_UP') return 'text-emerald-600 dark:text-emerald-400';
  if (bias === 'TRENDING_DOWN') return 'text-red-500 dark:text-red-400';
  return 'text-slate-500 dark:text-slate-400';
}

function alignmentColor(alignment: string | null | undefined): string {
  if (alignment === 'ALIGNED') return 'text-emerald-600 dark:text-emerald-400';
  if (alignment === 'CONFLICTED') return 'text-red-500 dark:text-red-400';
  return 'text-slate-500 dark:text-slate-400';
}

function confidenceColor(conf: string | null | undefined): string {
  if (conf === 'high') return 'text-emerald-600 dark:text-emerald-400';
  if (conf === 'medium') return 'text-amber-500 dark:text-amber-400';
  if (conf === 'low') return 'text-orange-500 dark:text-orange-400';
  if (conf === 'very_low') return 'text-red-500 dark:text-red-400';
  return 'text-slate-500 dark:text-slate-400';
}

function formatVotes(bull: number | null | undefined, bear: number | null | undefined): string {
  if (bull == null && bear == null) return '—';
  return `${bull ?? 0}↑ / ${bear ?? 0}↓`;
}

function SectionHeading({ children }: { children: ReactNode }) {
  return (
    <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-400 dark:text-slate-500">
      {children}
    </h3>
  );
}

export function AmdHistoryDetailPanel({ selectedRow, onClose }: AmdHistoryDetailPanelProps) {
  const tagParams = TAG_PARAMS[selectedRow.amd_tag] ?? TAG_PARAMS['INSUFFICIENT_DATA'];
  const isShifted = selectedRow.amd_tag === 'AMD_SHIFTED';

  return (
    <div className="space-y-4 rounded-lg border border-slate-200 bg-white p-4 dark:border-slate-700 dark:bg-slate-900">

      {/* Header */}
      <div className="flex items-center justify-between">
        <h2 className="font-semibold text-slate-800 dark:text-slate-200">
          {selectedRow.trade_date}
          <span className="ml-2 text-sm font-normal text-slate-500">{selectedRow.amd_tag}</span>
        </h2>
        <button
          type="button"
          onClick={onClose}
          className="text-xs text-slate-400 hover:text-slate-600 dark:hover:text-slate-300"
        >
          Close ✕
        </button>
      </div>

      {/* Intelligence Reference Grid */}
      <div>
        <SectionHeading>Direction Intelligence</SectionHeading>
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
          <StatTile
            label="Auto Direction"
            value={selectedRow.auto_direction?.toUpperCase() ?? '—'}
            valueColor={directionColor(selectedRow.auto_direction)}
          />
          <StatTile
            label="Confidence"
            value={selectedRow.auto_direction_confidence ?? '—'}
            valueColor={confidenceColor(selectedRow.auto_direction_confidence)}
          />
          <StatTile
            label="Size Multiplier"
            value={selectedRow.amd_size_multiplier != null ? `${selectedRow.amd_size_multiplier}×` : '—'}
          />
        </div>
        {selectedRow.auto_direction_reason && (
          <p className="mt-2 rounded-md bg-slate-50 px-3 py-2 text-xs text-slate-500 dark:bg-slate-800/60 dark:text-slate-400">
            {selectedRow.auto_direction_reason}
          </p>
        )}
      </div>

      {/* D1 Bias */}
      <div>
        <SectionHeading>D1 Bias</SectionHeading>
        <div className="grid grid-cols-2 gap-2">
          {/* 5-candle — used by all non-SHIFTED tags */}
          <div className="rounded-md border border-slate-100 px-3 py-2 dark:border-slate-700">
            <p className="text-xs text-slate-500 dark:text-slate-400">
              5-candle (≥3){!isShifted && <span className="ml-1 text-blue-500">active</span>}
            </p>
            <p className={`mt-0.5 text-sm font-semibold ${biasColor(selectedRow.layer4_d1_bias)}`}>
              {selectedRow.layer4_d1_bias ?? '—'}
            </p>
            <p className="text-xs text-slate-400 dark:text-slate-500">
              {formatVotes(selectedRow.layer4_bullish_count, selectedRow.layer4_bearish_count)}
            </p>
          </div>

          {/* 7-candle — AMD_SHIFTED only */}
          <div className={`rounded-md border px-3 py-2 ${
            isShifted
              ? 'border-blue-200 dark:border-blue-800'
              : 'border-slate-100 dark:border-slate-700'
          }`}>
            <p className="text-xs text-slate-500 dark:text-slate-400">
              7-candle (≥4){isShifted && <span className="ml-1 text-blue-500">active</span>}
            </p>
            <p className={`mt-0.5 text-sm font-semibold ${biasColor(selectedRow.layer4_d1_bias_7)}`}>
              {selectedRow.layer4_d1_bias_7 ?? '—'}
            </p>
            <p className="text-xs text-slate-400 dark:text-slate-500">
              {formatVotes(selectedRow.layer4_bullish_count_7, selectedRow.layer4_bearish_count_7)}
            </p>
          </div>
        </div>

        {/* Alignment */}
        <div className="mt-2">
          <StatTile
            label="Daily Bias Alignment"
            value={selectedRow.daily_bias_alignment ?? '—'}
            valueColor={alignmentColor(selectedRow.daily_bias_alignment)}
          />
        </div>
      </div>

      {/* Static Tag Parameters */}
      <div>
        <SectionHeading>Tag Parameters (Static Reference)</SectionHeading>
        <div className="grid grid-cols-2 gap-2">
          <StatTile label="Entry Hour" value={tagParams.entryHour} />
          <StatTile label="Exit Hour" value={tagParams.exitHour} />
          <StatTile label="Direction Source" value={tagParams.directionSource} />
          <StatTile label="D1 Window" value={tagParams.window} />
          <StatTile label="Exit Strategy" value={tagParams.exitStrategy} />
        </div>
      </div>

      {/* Divider */}
      <div className="border-t border-slate-100 dark:border-slate-800" />

      {/* Existing AMD Chart — unchanged */}
      <AmdHistoryChart amdState={selectedRow} />

    </div>
  );
}
