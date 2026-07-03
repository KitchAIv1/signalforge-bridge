import type { CapPreset } from './capPresets.js';
import type { SimOutcome } from './types.js';

export interface SweepRow {
  ticket: string | null;
  livePips: number | null;
  liveDurMin: number | null;
  liveCloseReason: string | null;
  caps: Record<string, SimOutcome | null>;
}

export function aggregateCapTotals(
  rows: SweepRow[],
  presets: CapPreset[],
): { label: string; totalNetPips: number; avgNetPips: number; winPct: number; capExitPct: number }[] {
  return presets.map((preset) => {
    const outcomes = rows.map((r) => r.caps[preset.label]).filter(Boolean) as SimOutcome[];
    const total = outcomes.reduce((s, o) => s + o.netPips, 0);
    const wins = outcomes.filter((o) => o.netPips > 0).length;
    const capExits = outcomes.filter((o) => o.exitReason === 'max_hold_cap').length;
    return {
      label: preset.label,
      totalNetPips: total,
      avgNetPips: outcomes.length ? total / outcomes.length : 0,
      winPct: outcomes.length ? (wins / outcomes.length) * 100 : 0,
      capExitPct: outcomes.length ? (capExits / outcomes.length) * 100 : 0,
    };
  });
}

export function deltaVsLive(
  rows: SweepRow[],
  preset: CapPreset,
): { improved: number; worsened: number; netDelta: number } {
  let improved = 0;
  let worsened = 0;
  let netDelta = 0;
  for (const row of rows) {
    const sim = row.caps[preset.label];
    if (sim == null || row.livePips == null) continue;
    const delta = sim.netPips - row.livePips;
    netDelta += delta;
    if (delta > 0.5) improved += 1;
    if (delta < -0.5) worsened += 1;
  }
  return { improved, worsened, netDelta };
}

export function buildSweepSummaryLines(
  title: string,
  rows: SweepRow[],
  presets: CapPreset[],
  liveTotalPips: number,
): string[] {
  const totals = aggregateCapTotals(rows, presets);
  const liveWinPct =
    rows.filter((r) => (r.livePips ?? 0) > 0).length / Math.max(rows.length, 1) * 100;

  const lines: string[] = [
    `=== ${title} (n=${rows.length}) ===`,
    `Live baseline: total ${liveTotalPips.toFixed(1)}p | avg ${(liveTotalPips / Math.max(rows.length, 1)).toFixed(2)}p/trade | win ${liveWinPct.toFixed(1)}%`,
    '',
    'Cap     | Total net pips | Avg pips | Win%  | Forced cap% | vs Live delta',
    '--------|----------------|----------|-------|-------------|---------------',
  ];

  for (const row of totals) {
    const preset = presets.find((p) => p.label === row.label)!;
    const vsLive = deltaVsLive(rows, preset);
    lines.push(
      `${row.label.padEnd(7)} | ${row.totalNetPips.toFixed(1).padStart(14)} | ${row.avgNetPips.toFixed(2).padStart(8)} | ${row.winPct.toFixed(1).padStart(5)} | ${row.capExitPct.toFixed(1).padStart(11)} | ${vsLive.netDelta >= 0 ? '+' : ''}${vsLive.netDelta.toFixed(1)}p (+${vsLive.improved}/-${vsLive.worsened})`,
    );
  }

  const best = [...totals].sort((a, b) => b.totalNetPips - a.totalNetPips)[0];
  lines.push('', `Best total net pips in sweep: ${best?.label ?? 'n/a'} (${best?.totalNetPips.toFixed(1) ?? '0'}p)`, '');
  return lines;
}
