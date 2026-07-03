/**
 * Post-RAW max_hold audit — trades since 2026-06-26.
 * Re-sims each live max_hold close at shorter wall-clock caps vs live.
 *
 * Run: npx tsx scripts/maxHoldPostRawAudit.ts
 */

import 'dotenv/config';
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createClient } from '@supabase/supabase-js';
import { fetchM5BarsAfterEntry } from '../src/services/shadowTrailExit/fetchEntryCandles.js';
import { OMEGA_EXEC_COST_PIPS } from '../src/services/omegaReplay/liveTrailConstants.js';
import { simulateOmegaTrailExit } from '../src/services/omegaReplay/trailExitEngine.js';
import type { TimestampedBar, TradeDirection } from '../src/services/omegaReplay/types.js';
import { CAP_PRESETS } from './maxHoldCapAnalysis/capPresets.js';

const SINCE_ISO = '2026-06-26T00:00:00.000Z';
const SCRIPT_DIR = dirname(fileURLToPath(import.meta.url));
const OUT_PATH = join(SCRIPT_DIR, 'output', 'max_hold_post_raw_jun26_audit.txt');

interface LiveMaxHoldRow {
  ticket: string;
  brokerId: string;
  signalReceivedAt: string;
  direction: TradeDirection;
  fillPrice: number;
  structureStop: number;
  livePips: number | null;
  liveDurMin: number | null;
  pair: string;
}

function normalizeDirection(raw: string): TradeDirection | null {
  const dir = raw.toLowerCase();
  return dir === 'long' || dir === 'short' ? dir : null;
}

function toTimestampedBars(bars: Awaited<ReturnType<typeof fetchM5BarsAfterEntry>>, entryMs: number): TimestampedBar[] {
  const barMs = 5 * 60 * 1000;
  return bars.map((bar, index) => ({
    timeMs: bar.time ? Date.parse(bar.time) : entryMs + (index + 1) * barMs,
    open: bar.open,
    high: bar.high,
    low: bar.low,
    close: bar.close,
  }));
}

function pairToInstrument(pair: string): string {
  const letters = pair.replace(/[^a-zA-Z]/g, '').toUpperCase();
  if (letters.length >= 6) return `${letters.slice(0, 3)}_${letters.slice(3, 6)}`;
  return pair;
}

async function loadMaxHoldTrades(): Promise<LiveMaxHoldRow[]> {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_KEY ?? process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error('Missing Supabase env');

  const supabase = createClient(url, key);
  const { data, error } = await supabase
    .from('bridge_trade_log')
    .select(
      'oanda_trade_id, broker_id, signal_received_at, direction, fill_price, stop_loss, pnl_pips, duration_minutes, pair',
    )
    .eq('engine_id', 'omega')
    .eq('decision', 'EXECUTED')
    .eq('close_reason', 'max_hold')
    .gte('created_at', SINCE_ISO)
    .not('fill_price', 'is', null)
    .not('stop_loss', 'is', null)
    .order('signal_received_at', { ascending: true });

  if (error) throw new Error(error.message);

  const rows: LiveMaxHoldRow[] = [];
  for (const raw of data ?? []) {
    const direction = normalizeDirection(String(raw.direction ?? ''));
    if (!direction) continue;
    rows.push({
      ticket: String(raw.oanda_trade_id),
      brokerId: String(raw.broker_id ?? 'oanda_practice'),
      signalReceivedAt: String(raw.signal_received_at),
      direction,
      fillPrice: Number(raw.fill_price),
      structureStop: Number(raw.stop_loss),
      livePips: raw.pnl_pips != null ? Number(raw.pnl_pips) : null,
      liveDurMin: raw.duration_minutes != null ? Number(raw.duration_minutes) : null,
      pair: String(raw.pair ?? 'AUD_USD'),
    });
  }
  return rows;
}

async function main(): Promise<void> {
  const trades = await loadMaxHoldTrades();
  const capTotals: Record<string, number> = {};
  for (const preset of CAP_PRESETS) capTotals[preset.label] = 0;

  const lines: string[] = [
    'POST-RAW MAX HOLD AUDIT — live max_hold trades since 2026-06-26',
    `Generated: ${new Date().toISOString()}`,
    `Trades: ${trades.length}`,
    '',
    'Method: actual OANDA fill + structure stop | Trail v1 SHORT 2R LONG 3R trail 0.5R',
    'Caps: wall-clock from signal_received_at | M5 OANDA bars | 1.2p RT cost',
    'Note: sim uses bar OHLC; live max_hold uses broker mid at ~360min — expect some delta.',
    '',
  ];

  let liveTotal = 0;
  let liveKnown = 0;

  for (const trade of trades) {
    const entryMs = Date.parse(trade.signalReceivedAt);
    const instrument = pairToInstrument(trade.pair);
    const bars = await fetchM5BarsAfterEntry(instrument, trade.signalReceivedAt);
    const timestamped = toTimestampedBars(bars, entryMs);

    lines.push('---');
    lines.push(
      `${trade.signalReceivedAt.slice(0, 16)} | ${trade.direction.toUpperCase()} | ticket ${trade.ticket} | ${trade.brokerId}`,
    );
    lines.push(
      `  fill=${trade.fillPrice.toFixed(5)} stop=${trade.structureStop.toFixed(5)} | LIVE max_hold: ${trade.livePips?.toFixed(1) ?? 'null'}p @ ${trade.liveDurMin?.toFixed(0) ?? '?'}min`,
    );

    if (trade.livePips != null) {
      liveTotal += trade.livePips;
      liveKnown += 1;
    }

    lines.push('  Cap     | Sim exit        | Hold | Net pips | vs live');
    for (const preset of CAP_PRESETS) {
      const sim = simulateOmegaTrailExit({
        direction: trade.direction,
        entryPrice: trade.fillPrice,
        structureStop: trade.structureStop,
        entryTimeMs: entryMs,
        bars: timestamped,
        maxHoldMinutes: preset.minutes,
        executionCostPips: OMEGA_EXEC_COST_PIPS,
      });
      capTotals[preset.label] = (capTotals[preset.label] ?? 0) + sim.netPips;
      const delta = trade.livePips != null ? sim.netPips - trade.livePips : null;
      lines.push(
        `  ${preset.label.padEnd(7)} | ${sim.exitReason.padEnd(15)} | ${String(sim.holdMinutes).padStart(4)}m | ${sim.netPips.toFixed(1).padStart(7)}p | ${delta != null ? (delta >= 0 ? '+' : '') + delta.toFixed(1) + 'p' : 'n/a'}`,
      );
    }
  }

  lines.push('');
  lines.push('=== TOTALS (sum across all max_hold trades) ===');
  lines.push(`Live (known ${liveKnown}/${trades.length}): ${liveTotal.toFixed(1)}p`);
  for (const preset of CAP_PRESETS) {
    const total = capTotals[preset.label] ?? 0;
    const delta = total - liveTotal;
    lines.push(
      `Sim ${preset.label.padEnd(5)} cap: ${total.toFixed(1)}p (${delta >= 0 ? '+' : ''}${delta.toFixed(1)}p vs live)`,
    );
  }

  const best = CAP_PRESETS.map((p) => ({ label: p.label, total: capTotals[p.label] ?? 0 }))
    .sort((a, b) => b.total - a.total)[0];
  lines.push('');
  lines.push(`Best cap in this cohort: ${best?.label} (${best?.total.toFixed(1)}p sim total)`);

  mkdirSync(join(SCRIPT_DIR, 'output'), { recursive: true });
  writeFileSync(OUT_PATH, lines.join('\n'));
  console.log(lines.join('\n'));
  console.log(`\nSaved: ${OUT_PATH}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
