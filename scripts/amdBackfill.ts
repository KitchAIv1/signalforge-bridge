/**
 * AMD feature backfill — READ-ONLY. Queries bridge_trade_log + OANDA H1 (AUD_USD).
 * Run: npx tsx scripts/amdBackfill.ts  |  npm run amd-backfill
 * Requires: SUPABASE_URL, SUPABASE_SERVICE_KEY (or SUPABASE_SERVICE_ROLE_KEY),
 *   OANDA_API_TOKEN, OANDA_ACCOUNT_ID (used by fetchCompletedCandles in oanda client)
 */

import * as dotenv from 'dotenv';
import * as fs from 'fs';
import * as path from 'path';
import { createClient } from '@supabase/supabase-js';
import { fetchCompletedCandles } from '../src/connectors/oanda.js';
import {
  writeSummaryByTagCsv,
  writeTradeResultsCsv,
  average,
  winPctFromPnl,
} from './amdBackfillCsv.ts';
import {
  amdTradePhaseFromUtcHour,
  computeDateFeatures,
  sessionDirectionAlignment,
  type OhlcCandle,
} from './amdBackfillFeatures.ts';
import type { DateFeatures, TradeRowOut } from './amdBackfillTypes.ts';

dotenv.config();

const INSTRUMENT = 'AUD_USD';
const PAGE_SIZE = 500;
const TRADE_START = '2026-02-01T00:00:00Z';
const OANDA_GAP_MS = 500;

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

function readSupabaseEnv(): { urlRoot: string; serviceKey: string } {
  const urlRoot = process.env.SUPABASE_URL?.trim();
  const serviceKey =
    process.env.SUPABASE_SERVICE_KEY?.trim() ??
    process.env.SUPABASE_SERVICE_ROLE_KEY?.trim() ??
    '';
  if (!urlRoot || !serviceKey) {
    throw new Error(
      'Missing SUPABASE_URL or SUPABASE_SERVICE_KEY (or SUPABASE_SERVICE_ROLE_KEY)'
    );
  }
  return { urlRoot, serviceKey };
}

function utcDateKey(iso: string): string {
  const d = new Date(iso);
  const y = d.getUTCFullYear();
  const m = String(d.getUTCMonth() + 1).padStart(2, '0');
  const day = String(d.getUTCDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

function dayBoundsUtc(dateKey: string): { from: string; to: string } {
  return {
    from: `${dateKey}T00:00:00.000000000Z`,
    to: `${dateKey}T23:59:59.000000000Z`,
  };
}

type RawTrade = {
  id: string;
  created_at: string;
  direction: string;
  pnl_r: number;
};

async function fetchAllOmegaExecutedTrades(): Promise<RawTrade[]> {
  const { urlRoot, serviceKey } = readSupabaseEnv();
  const supabase = createClient(urlRoot, serviceKey);
  const accu: RawTrade[] = [];
  let fromOffset = 0;

  for (;;) {
    const { data, error } = await supabase
      .from('bridge_trade_log')
      .select('id, created_at, direction, pnl_r')
      .eq('engine_id', 'omega')
      .eq('decision', 'EXECUTED')
      .not('pnl_r', 'is', null)
      .gte('created_at', TRADE_START)
      .order('created_at', { ascending: true })
      .range(fromOffset, fromOffset + PAGE_SIZE - 1);

    if (error) {
      throw new Error(`Supabase bridge_trade_log query failed: ${error.message}`);
    }

    const page = data ?? [];
    for (const row of page) {
      accu.push({
        id: String(row.id),
        created_at: String(row.created_at),
        direction: String(row.direction ?? ''),
        pnl_r: Number(row.pnl_r),
      });
    }

    if (page.length < PAGE_SIZE) break;
    fromOffset += PAGE_SIZE;
  }

  return accu;
}

function insufficientFeaturesRow(): DateFeatures {
  return {
    asian_range_pips: null,
    asian_net_pips: null,
    asian_is_flat: false,
    judas_direction: null,
    judas_pips: null,
    reversal_confirmed: null,
    compression_breakout: false,
    delayed_distribution: false,
    amd_tag: 'INSUFFICIENT_DATA',
  };
}

function buildDateFeatureMap(
  tradesByDate: Map<string, RawTrade[]>,
  candleFetch: (dateKey: string) => Promise<OhlcCandle[]>
): Promise<Map<string, DateFeatures>> {
  const uniqueDates = [...tradesByDate.keys()].sort();
  const total = uniqueDates.length;
  const outcome = new Map<string, DateFeatures>();

  return (async () => {
    for (let index = 0; index < uniqueDates.length; index++) {
      const dateKey = uniqueDates[index];
      console.log(`Processing date ${index + 1} of ${total}: ${dateKey}`);

      let candles = await candleFetch(dateKey);
      candles = candles.slice(0, 24);

      if (candles.length === 0) {
        console.warn(
          `[AMD] OANDA returned no H1 candles for ${dateKey} — marking INSUFFICIENT_DATA`
        );
        outcome.set(dateKey, insufficientFeaturesRow());
        await sleep(OANDA_GAP_MS);
        continue;
      }

      const features = computeDateFeatures(candles, (candle, reason) => {
        console.warn(
          `[AMD] Bad candle on ${dateKey}: ${reason}`,
          JSON.stringify(candle)
        );
      });

      outcome.set(dateKey, features);
      await sleep(OANDA_GAP_MS);
    }
    return outcome;
  })();
}

function buildTradeOutputs(
  trades: RawTrade[],
  dateFeatures: Map<string, DateFeatures>
): TradeRowOut[] {
  const rows: TradeRowOut[] = [];
  for (const trade of trades) {
    const dateKey = utcDateKey(trade.created_at);
    const feats = dateFeatures.get(dateKey) ?? insufficientFeaturesRow();
    const created = new Date(trade.created_at);
    const hour = created.getUTCHours();
    const phase = amdTradePhaseFromUtcHour(hour);
    const alignment = sessionDirectionAlignment(
      feats.judas_direction,
      trade.direction
    );
    rows.push({
      trade_id: trade.id,
      created_at: trade.created_at,
      direction: trade.direction,
      pnl_r: trade.pnl_r,
      amd_tag: feats.amd_tag,
      amd_trade_phase: phase,
      asian_range_pips: feats.asian_range_pips,
      judas_direction: feats.judas_direction,
      judas_pips: feats.judas_pips,
      reversal_confirmed: feats.reversal_confirmed,
      session_direction_alignment: alignment,
    });
  }
  return rows;
}

function printConsoleByDate(
  tradesByDate: Map<string, RawTrade[]>,
  dateFeatures: Map<string, DateFeatures>
): void {
  const byDateSorted = [...tradesByDate.keys()].sort();
  for (const dateKey of byDateSorted) {
    const dayTrades = tradesByDate.get(dateKey) ?? [];
    const feats = dateFeatures.get(dateKey) ?? insufficientFeaturesRow();
    const pnls = dayTrades.map((t) => t.pnl_r);
    const avgR = average(pnls);
    const winPct = winPctFromPnl(pnls);
    const rev =
      feats.reversal_confirmed === null
        ? '—'
        : feats.reversal_confirmed
          ? 'true'
          : 'false';
    console.log(
      `${dateKey} | ${feats.amd_tag} | ` +
        `range=${feats.asian_range_pips ?? '—'} ` +
        `net=${feats.asian_net_pips ?? '—'} ` +
        `flat=${feats.asian_is_flat} | ` +
        `${feats.judas_direction ?? '—'} | ${feats.judas_pips ?? '—'} | ` +
        `${rev} | ${dayTrades.length} | ${avgR.toFixed(4)} | ` +
        `${winPct.toFixed(1)}%`
    );
  }
}

async function main(): Promise<void> {
  const trades = await fetchAllOmegaExecutedTrades();
  if (trades.length === 0) {
    console.log('No trades matched filters.');
    return;
  }

  const tradesByDate = new Map<string, RawTrade[]>();
  for (const trade of trades) {
    const key = utcDateKey(trade.created_at);
    const bucket = tradesByDate.get(key) ?? [];
    bucket.push(trade);
    tradesByDate.set(key, bucket);
  }

  async function fetchDay(dateKey: string): Promise<OhlcCandle[]> {
    const { from, to } = dayBoundsUtc(dateKey);
    const raw = await fetchCompletedCandles(INSTRUMENT, 'H1', from, to);
    return raw as OhlcCandle[];
  }

  const dateFeatures = await buildDateFeatureMap(
    tradesByDate,
    fetchDay
  );

  const tradeRows = buildTradeOutputs(trades, dateFeatures);
  const outDir = path.join(process.cwd(), 'scripts', 'output');
  fs.mkdirSync(outDir, { recursive: true });

  printConsoleByDate(tradesByDate, dateFeatures);

  const tradePath = writeTradeResultsCsv(tradeRows, outDir);
  const summaryPath = writeSummaryByTagCsv(tradeRows, outDir);
  console.log(`Wrote ${tradePath}`);
  console.log(`Wrote ${summaryPath}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
