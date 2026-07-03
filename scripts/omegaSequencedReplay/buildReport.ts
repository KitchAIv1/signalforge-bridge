/** Report + CSV output for OMEGA sequenced replay. */

import type { ReplaySummary, ReplayTradeRow } from '../../src/services/omegaReplay/types.js';

function countExitMix(rows: ReplayTradeRow[]): Record<string, number> {
  const counts: Record<string, number> = {};
  for (const row of rows) {
    if (row.gateStatus !== 'executed') continue;
    const key = row.exitReason ?? 'missing';
    counts[key] = (counts[key] ?? 0) + 1;
  }
  return counts;
}

function csvEscape(value: string | number | null | undefined): string {
  if (value == null) return '';
  const text = String(value);
  return text.includes(',') ? `"${text}"` : text;
}

export function buildReportLines(
  summary: ReplaySummary,
  rows: ReplayTradeRow[],
): string[] {
  const executed = rows.filter((row) => row.gateStatus === 'executed');
  const exitMix = countExitMix(rows);
  const matched = executed.filter((row) => row.livePnlPips != null);
  const meanDelta =
    matched.length > 0
      ? matched.reduce((sum, row) => sum + (row.deltaSimVsLive ?? 0), 0) / matched.length
      : 0;

  return [
    'OMEGA RAW SEQUENCED REPLAY — chronological Trail v1 (live params locked)',
    `Generated: ${new Date().toISOString()}`,
    `Since: ${summary.sinceIso.slice(0, 10)} | maxHold=${summary.maxHoldMinutes}min`,
    '',
    '=== RAW MODE POLICY ===',
    'DTW direction as-fired — hybrid + window gates bypassed (matches omega_raw_mode=true)',
    '',
    '=== LIVE PARAMS (LOCKED) ===',
    'Entry: signal direction as-fired, no bridge direction override',
    'Trail: SHORT SL 2.0R | LONG SL 3.0R | trail 0.5R | activation 0R',
    'Max hold: wall-clock from signal fired_at (matches tradeMonitor timer anchor)',
    'Sequencing: one trade at a time — next signal blocked until prior sim exit',
    'Pricing: live OANDA fill + mirrored structure stop when available; else signal entry/sl',
    'Costs: 1.2p RT deducted from sim gross',
    'Exit model: M5 bar OHLC walk (live uses OANDA live mid — see caveats)',
    '',
    '=== POPULATION ===',
    `Signals loaded: ${summary.totalSignals}`,
    `Gate blocked: ${summary.gateBlocked}`,
    `Sequence blocked (prior_trade_open): ${summary.sequenceBlocked}`,
    `Executed in sim: ${summary.executed}`,
    `Insufficient bars at exit: ${summary.insufficientBars}`,
    '',
    '=== SIM RESULTS (executed only) ===',
    `Total net pips: ${summary.simTotalNetPips}`,
    `Win rate: ${summary.simWinRate}%`,
    `Avg pips/trade: ${summary.executed ? Math.round((summary.simTotalNetPips / summary.executed) * 100) / 100 : 0}`,
    'Exit mix:',
    ...Object.entries(exitMix).map(([reason, count]) => `  ${reason}: ${count}`),
    '',
    '=== LIVE COMPARISON (executed sim rows with OANDA fill) ===',
    `Matched live fills: ${summary.liveMatched}`,
    `Live total net pips: ${summary.liveTotalNetPips}`,
    `Live win rate: ${summary.liveWinRate}%`,
    `Sim vs live mean delta: ${Math.round(meanDelta * 10) / 10}p`,
    `Sim vs live mean |delta|: ${summary.meanAbsDeltaPips}p`,
    '',
    '=== CAVEATS ===',
    '1. Trail exit uses M5 bar extremes, not live mid (30s monitor cadence).',
    '2. News filter, circuit breaker, paused engine not replayed.',
    '3. Requires outcome_candles on omega_shadow_signals (72+ M5 bars).',
    '',
    '=== WORST SIM vs LIVE DELTAS (|delta| > 5p) ===',
    ...worstDeltas(matched, 5),
    '',
    '=== SEQUENCE BLOCKED WITH POSITIVE SHADOW PNL (opportunity cost sample) ===',
    ...sequenceOpportunity(rows, 8),
  ];
}

function worstDeltas(rows: ReplayTradeRow[], threshold: number): string[] {
  return rows
    .filter((row) => Math.abs(row.deltaSimVsLive ?? 0) > threshold)
    .sort((left, right) => Math.abs(right.deltaSimVsLive ?? 0) - Math.abs(left.deltaSimVsLive ?? 0))
    .slice(0, 10)
    .map(
      (row) =>
        `  ${row.firedAtIso.slice(0, 16)} ${row.direction} live=${row.livePnlPips?.toFixed(1)}p (${row.liveCloseReason}) sim=${row.netPips?.toFixed(1)}p delta=${row.deltaSimVsLive?.toFixed(1)}`,
    );
}

function sequenceOpportunity(rows: ReplayTradeRow[], limit: number): string[] {
  return rows
    .filter((row) => row.gateStatus === 'blocked_sequence')
    .slice(0, limit)
    .map(
      (row) =>
        `  ${row.firedAtIso.slice(0, 16)} ${row.direction} blocked=${row.gateReason} live=${row.livePnlPips ?? 'n/a'}p`,
    );
}

export function buildDetailCsv(rows: ReplayTradeRow[]): string {
  const header =
    'fired_at,hour_utc,direction,session,gate_status,gate_reason,entry,stop,r_pips,' +
    'exit_reason,hold_min,gross_pips,net_pips,live_pips,live_reason,delta_sim_vs_live';
  const lines = rows.map((row) =>
    [
      row.firedAtIso,
      row.hourUtc,
      row.direction,
      row.sessionWindow,
      row.gateStatus,
      row.gateReason,
      row.entryPrice,
      row.structureStop,
      row.rPips,
      row.exitReason,
      row.holdMinutes,
      row.grossPips,
      row.netPips,
      row.livePnlPips,
      row.liveCloseReason,
      row.deltaSimVsLive,
    ]
      .map(csvEscape)
      .join(','),
  );
  return [header, ...lines].join('\n');
}
