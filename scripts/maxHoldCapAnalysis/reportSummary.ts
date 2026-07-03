import type { TradeComparison } from './types.js';

function sumPips(rows: TradeComparison[], pick: (row: TradeComparison) => number | null): number {
  return rows.reduce((acc, row) => acc + (pick(row) ?? 0), 0);
}

function avgPips(rows: TradeComparison[], pick: (row: TradeComparison) => number | null): number {
  const vals = rows.map(pick).filter((v): v is number => v != null);
  if (vals.length === 0) return 0;
  return vals.reduce((a, b) => a + b, 0) / vals.length;
}

function winRate(rows: TradeComparison[], pick: (row: TradeComparison) => number | null): number {
  const vals = rows.map(pick).filter((v): v is number => v != null);
  if (vals.length === 0) return 0;
  return (vals.filter((v) => v > 0).length / vals.length) * 100;
}

export function buildSummaryLines(
  label: string,
  rows: TradeComparison[],
): string[] {
  const n = rows.length;
  const liveSum = sumPips(rows, (r) => r.livePips);
  const cap150Sum = sumPips(rows, (r) => r.sim150?.netPips ?? null);
  const cap360Sum = sumPips(rows, (r) => r.sim360?.netPips ?? null);
  const noCapSum = sumPips(rows, (r) => r.simNoCap72?.netPips ?? null);

  const cap150Wins = rows.filter((r) => (r.sim150?.netPips ?? 0) > 0).length;
  const liveWins = rows.filter((r) => (r.livePips ?? 0) > 0).length;

  const improved150 = rows.filter((r) => (r.delta150VsLive ?? 0) > 0.5).length;
  const worsened150 = rows.filter((r) => (r.delta150VsLive ?? 0) < -0.5).length;

  return [
    `=== ${label} (n=${n}) ===`,
    `Live total net pips:     ${liveSum.toFixed(1)}  (win rate ${winRate(rows, (r) => r.livePips).toFixed(1)}%)`,
    `Sim 150min cap net pips: ${cap150Sum.toFixed(1)}  (win rate ${winRate(rows, (r) => r.sim150?.netPips ?? null).toFixed(1)}%)`,
    `Sim 360min cap net pips: ${cap360Sum.toFixed(1)}  (win rate ${winRate(rows, (r) => r.sim360?.netPips ?? null).toFixed(1)}%)`,
    `Sim trail-only 72 bars:  ${noCapSum.toFixed(1)}  (no time cap, 6h window)`,
    `Avg live pips/trade:     ${avgPips(rows, (r) => r.livePips).toFixed(2)}`,
    `Avg 150-cap pips/trade:  ${avgPips(rows, (r) => r.sim150?.netPips ?? null).toFixed(2)}`,
    `Avg 360-cap pips/trade:  ${avgPips(rows, (r) => r.sim360?.netPips ?? null).toFixed(2)}`,
    `150-cap vs live: improved ${improved150}, worsened ${worsened150}, net delta ${(cap150Sum - liveSum).toFixed(1)} pips`,
    `150-cap vs 360-cap:      net delta ${(cap150Sum - cap360Sum).toFixed(1)} pips`,
    '',
  ];
}

export function buildMethodologyLines(): string[] {
  return [
    'METHODOLOGY (closest live sim)',
    '- Cohort: OANDA practice omega EXECUTED closed trades',
    '- Entry: actual fill_price (broker fill, not signal entry)',
    '- R-size: |fill_price - stop_loss| (structure stop stored at fill)',
    '- Candles: OANDA M5 complete bars after signal_received_at',
    '- Trail: SHORT SL 2.0R / LONG SL 3.0R / trail 0.5R / activation 0R (live Trail v1)',
    '- Bar walk: intra-bar SL before trail; peak/trail on bar high/low vs fill',
    '- 150min cap: force exit at M5 bar 30 close if trail has not fired',
    '- 360min cap: force exit at M5 bar 72 close (matches live 6h max_hold)',
    '- Net pips: gross move minus 1.2p RT execution cost (backtest convention)',
    '- Live pnl_pips: recorded bridge_trade_log (actual broker outcome)',
    '',
  ];
}
