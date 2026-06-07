import type { SupabaseClient } from '@supabase/supabase-js';
import { logInfo } from '../../utils/logger.js';
import { parseChartOhlc } from './parseChartOhlc.js';
import { PDL_SWEEP_PAIR } from './pdlSweepConstants.js';
import type { StoredM5Candle } from './pdlSweepTypes.js';

function wickLowFromM5(candles: StoredM5Candle[]): number | null {
  if (candles.length === 0) return null;
  let low = Infinity;
  for (const candle of candles) {
    low = Math.min(low, parseFloat(candle.l));
  }
  return low;
}

function findPriorTradingDate(tradeDate: string, sortedDates: string[]): string | null {
  let prior: string | null = null;
  for (const date of sortedDates) {
    if (date >= tradeDate) break;
    prior = date;
  }
  return prior;
}

export async function fetchPriorDayLow(
  supabase: SupabaseClient,
  tradeDate: string,
): Promise<number | null> {
  const { data: stateRows, error: stateErr } = await supabase
    .from('amd_state')
    .select('trade_date')
    .eq('pair', PDL_SWEEP_PAIR)
    .order('trade_date', { ascending: true });
  if (stateErr || !stateRows) {
    console.error('[PdlSweep] prior day lookup failed:', stateErr?.message);
    return null;
  }

  const sortedDates = stateRows.map((row) => String(row.trade_date));
  const priorDate = findPriorTradingDate(tradeDate, sortedDates);
  if (!priorDate) return null;

  const priorDayOfWeek = new Date(priorDate + 'T00:00:00Z').getUTCDay();
  if (priorDayOfWeek === 5) {
    logInfo('[PdlSweepDetector] Prior day is Friday — PDL three-source merge covers 00:00–16:00 UTC only. 16:00–21:00 NY session excluded. Monday PDL may be understated.');
  }

  const [asianRes, distRes, stateRes] = await Promise.all([
    supabase
      .from('asian_m5_candles')
      .select('candles')
      .eq('pair', PDL_SWEEP_PAIR)
      .eq('trade_date', priorDate)
      .eq('fetch_status', 'success')
      .maybeSingle(),
    supabase
      .from('amd_m5_distribution_candles')
      .select('candles')
      .eq('pair', PDL_SWEEP_PAIR)
      .eq('trade_date', priorDate)
      .eq('fetch_status', 'success')
      .maybeSingle(),
    supabase
      .from('amd_state')
      .select('chart_data')
      .eq('pair', PDL_SWEEP_PAIR)
      .eq('trade_date', priorDate)
      .maybeSingle(),
  ]);

  const lows: number[] = [];
  const asianLow = wickLowFromM5((asianRes.data?.candles ?? []) as StoredM5Candle[]);
  const distLow = wickLowFromM5((distRes.data?.candles ?? []) as StoredM5Candle[]);
  if (asianLow != null) lows.push(asianLow);
  if (distLow != null) lows.push(distLow);

  const h1Bars = parseChartOhlc(
    (stateRes.data?.chart_data ?? null) as Record<string, unknown> | null,
  );
  for (const bar of h1Bars) {
    lows.push(parseFloat(bar.l));
  }

  if (lows.length === 0) return null;
  return Math.min(...lows);
}
