/** Report for multi-cap sequenced compare with freed-trade tags. */

import type { CapCompareSummary, FreedTradeRow } from '../../src/services/omegaReplay/compareCapReplays.js';

function freedByCapLabel(freed: FreedTradeRow[]): Record<string, FreedTradeRow[]> {
  const grouped: Record<string, FreedTradeRow[]> = {};
  for (const row of freed) {
    const bucket = grouped[row.capLabel] ?? [];
    bucket.push(row);
    grouped[row.capLabel] = bucket;
  }
  return grouped;
}

function countTags(rows: FreedTradeRow[]): { same: number; opposite: number; maxHoldBlocker: number } {
  let same = 0;
  let opposite = 0;
  let maxHoldBlocker = 0;
  for (const row of rows) {
    if (row.directionVsBlocker === 'same') same += 1;
    if (row.directionVsBlocker === 'opposite') opposite += 1;
    if (row.blockerWasMaxHoldAtBaseline) maxHoldBlocker += 1;
  }
  return { same, opposite, maxHoldBlocker };
}

export function buildCapCompareReport(summary: CapCompareSummary, sinceIso: string): string[] {
  const lines: string[] = [
    'OMEGA RAW CAP COMPARE — sequenced replay with freed-trade analysis',
    `Generated: ${new Date().toISOString()}`,
    `Since: ${sinceIso.slice(0, 10)} | Baseline cap: ${summary.baselineCapMinutes}min`,
    '',
    'HOW TO READ THIS',
    '- Each cap re-runs FULL chronological RAW replay (one trade at a time).',
    '- Shorter cap → open trades exit earlier → blocked signals may EXECUTE.',
    '- FREED = blocked at 360m baseline, executed at shorter cap.',
    '- Tags: same/opposite = new signal vs the trade that was blocking the slot.',
    '- blockerWasMaxHold = blocking trade hit 360m max_hold at baseline.',
    '- PnL split: overlap = trades that ran under BOTH caps (exit timing changed).',
    '              freed   = NEW trades that only run when cap is shorter.',
    '',
    '=== BASELINE (360m) ===',
    `Executed: ${summary.baselineExecuted} | Sequence blocked: ${summary.baselineSequenceBlocked}`,
    `Total net pips (executed only): ${summary.baselineNetPips}p`,
    '',
    '=== CAP SUMMARY ===',
    'Cap   | Executed | Blocked | Total pips | Δ vs 360 | Δ overlap | Δ freed',
  ];

  for (const cap of summary.capRows.sort((a, b) => a.capMinutes - b.capMinutes)) {
    if (cap.capMinutes === summary.baselineCapMinutes) continue;
    const delta = summary.pnlDeltaVsBaseline[cap.capLabel] ?? 0;
    const overlap = summary.overlapPipsDeltaByCap[cap.capLabel] ?? 0;
    const freed = summary.freedPipsByCap[cap.capLabel] ?? 0;
    lines.push(
      `${cap.capLabel.padEnd(5)} | ${String(cap.executedCount).padStart(8)} | ${String(cap.sequenceBlockedCount).padStart(7)} | ${cap.executedNetPips.toFixed(1).padStart(9)}p | ${(delta >= 0 ? '+' : '') + delta.toFixed(1).padStart(5)}p | ${(overlap >= 0 ? '+' : '') + overlap.toFixed(1).padStart(5)}p | ${(freed >= 0 ? '+' : '') + freed.toFixed(1).padStart(5)}p`,
    );
  }

  const grouped = freedByCapLabel(summary.freedByCap);
  for (const capLabel of Object.keys(grouped).sort()) {
    const rows = grouped[capLabel] ?? [];
    const tags = countTags(rows);
    lines.push('');
    lines.push(`=== FREED TRADES @ ${capLabel} (n=${rows.length}) ===`);
    lines.push(
      `Tags: same_direction=${tags.same} opposite_direction=${tags.opposite} blocker_was_max_hold@360=${tags.maxHoldBlocker}`,
    );
    lines.push(
      'fired_at          | new_dir | net_pips | exit          | vs_blocker | blocker@360        | blocker@${capLabel}',
    );
    for (const row of rows.slice(0, 40)) {
      lines.push(
        `${row.firedAtIso.slice(0, 16)} | ${row.direction.padEnd(7)} | ${row.netPips.toFixed(1).padStart(7)}p | ${String(row.exitReason).padEnd(13)} | ${String(row.directionVsBlocker).padEnd(10)} | ${String(row.blockerExitReasonBaseline).padEnd(7)}/${String(row.blockerHoldBaseline)}m | ${String(row.blockerExitReasonAtCap).padEnd(7)}/${String(row.blockerHoldAtCap)}m`,
      );
    }
    if (rows.length > 40) lines.push(`  ... +${rows.length - 40} more (see CSV)`);
  }

  return lines;
}

export function buildFreedTradesCsv(freed: FreedTradeRow[]): string {
  const header =
    'cap,fired_at,direction,net_pips,exit_reason,hold_min,direction_vs_blocker,' +
    'blocker_signal_id,blocker_dir,blocker_exit_360,blocker_hold_360,blocker_exit_cap,blocker_hold_cap,' +
    'blocker_was_max_hold_360,shadow_pips_if_executed_at_360';
  const lines = freed.map((row) =>
    [
      row.capLabel,
      row.firedAtIso,
      row.direction,
      row.netPips,
      row.exitReason,
      row.holdMinutes,
      row.directionVsBlocker,
      row.blockerSignalId,
      row.blockerDirection,
      row.blockerExitReasonBaseline,
      row.blockerHoldBaseline,
      row.blockerExitReasonAtCap,
      row.blockerHoldAtCap,
      row.blockerWasMaxHoldAtBaseline,
      row.shadowNetPipsAtBaseline,
    ].join(','),
  );
  return [header, ...lines].join('\n');
}
