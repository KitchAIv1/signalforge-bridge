/**
 * Position-sizing study for $25k VT demo accounts.
 * Derives fractional-Kelly risk-% per engine, capped at 10% circuit breaker.
 *
 * Usage: npm run mt5:sizing-study
 */

import 'dotenv/config';
import { createClient } from '@supabase/supabase-js';

const CIRCUIT_BREAKER_PCT = 0.10;
const KELLY_FRACTION = 0.25;
const DEMO_EQUITY = 25_000;

interface EngineStats {
  engineId: string;
  tradeCount: number;
  winRate: number;
  avgWinR: number;
  avgLossR: number;
  kellyPct: number;
  recommendedPct: number;
}

function fractionalKelly(winRate: number, avgWinR: number, avgLossR: number): number {
  if (avgLossR <= 0 || winRate <= 0 || winRate >= 1) return 0;
  const lossRate = 1 - winRate;
  const payoff = avgWinR / avgLossR;
  const kelly = winRate - lossRate / payoff;
  return Math.max(0, kelly * KELLY_FRACTION);
}

async function loadEngineStats(supabase: ReturnType<typeof createClient>, engineId: string): Promise<EngineStats> {
  const since = new Date(Date.now() - 183 * 24 * 60 * 60 * 1000).toISOString();
  const { data, error } = await supabase
    .from('bridge_trade_log')
    .select('result, pnl_r')
    .eq('engine_id', engineId)
    .eq('decision', 'EXECUTED')
    .eq('status', 'closed')
    .gte('created_at', since)
    .not('pnl_r', 'is', null);

  if (error) throw new Error(error.message);

  const rows = (data ?? []) as Array<{ result: string | null; pnl_r: number | null }>;
  const wins = rows.filter((row) => row.result === 'win' && row.pnl_r != null);
  const losses = rows.filter((row) => row.result === 'loss' && row.pnl_r != null);
  const winRate = rows.length ? wins.length / rows.length : 0;
  const avgWinR = wins.length
    ? wins.reduce((sum, row) => sum + Math.abs(row.pnl_r ?? 0), 0) / wins.length
    : 1;
  const avgLossR = losses.length
    ? losses.reduce((sum, row) => sum + Math.abs(row.pnl_r ?? 0), 0) / losses.length
    : 1;
  const kellyPct = fractionalKelly(winRate, avgWinR, avgLossR);
  const recommendedPct = Math.min(CIRCUIT_BREAKER_PCT, kellyPct);

  return {
    engineId,
    tradeCount: rows.length,
    winRate,
    avgWinR,
    avgLossR,
    kellyPct,
    recommendedPct,
  };
}

function printStats(stats: EngineStats): void {
  const riskDollars = DEMO_EQUITY * stats.recommendedPct;
  console.log(`\n=== ${stats.engineId} ===`);
  console.log(`Closed trades (183d): ${stats.tradeCount}`);
  console.log(`Win rate: ${(stats.winRate * 100).toFixed(1)}%`);
  console.log(`Avg win R: ${stats.avgWinR.toFixed(2)} | Avg loss R: ${stats.avgLossR.toFixed(2)}`);
  console.log(`Fractional Kelly (${KELLY_FRACTION}x): ${(stats.kellyPct * 100).toFixed(2)}%`);
  console.log(`Recommended risk (cap ${CIRCUIT_BREAKER_PCT * 100}%): ${(stats.recommendedPct * 100).toFixed(2)}%`);
  console.log(`$${DEMO_EQUITY.toLocaleString()} demo → ~$${riskDollars.toFixed(0)} per trade at 1R`);
  console.log(`Suggested bridge_links.capital_allocation_pct: ${stats.recommendedPct.toFixed(3)}`);
}

async function main(): Promise<void> {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_KEY;
  if (!url || !key) {
    console.error('SUPABASE_URL and SUPABASE_SERVICE_KEY required.');
    process.exit(1);
  }
  const supabase = createClient(url, key);
  for (const engineId of ['omega', 'audusd_fade']) {
    const stats = await loadEngineStats(supabase, engineId);
    printStats(stats);
  }
  console.log('\nApply capital_allocation_pct in bridge_links when enabling VT brokers.');
}

main().catch((err) => {
  console.error('Sizing study failed:', err);
  process.exit(1);
});
