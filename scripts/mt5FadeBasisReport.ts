/**
 * AUD_FADE OANDA vs VT basis report (entry slippage / spread / outcome delta).
 * Usage: npm run mt5:fade-basis-report
 */

import 'dotenv/config';
import { createClient } from '@supabase/supabase-js';

async function main(): Promise<void> {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_KEY;
  if (!url || !key) {
    console.error('SUPABASE_URL and SUPABASE_SERVICE_KEY required.');
    process.exit(1);
  }
  const supabase = createClient(url, key);
  const since = new Date(Date.now() - 14 * 24 * 60 * 60 * 1000).toISOString();

  const { data, error } = await supabase
    .from('audusd_fade_trades')
    .select('trade_date, broker_id, entry_price, exit_price, pnl_pips_actual, result, oanda_trade_id')
    .gte('trade_date', since.slice(0, 10))
    .not('result', 'is', null)
    .order('trade_date', { ascending: false });

  if (error) throw new Error(error.message);

  const rows = data ?? [];
  const byBroker = new Map<string, typeof rows>();
  for (const row of rows) {
    const brokerId = (row.broker_id as string) ?? 'oanda_practice';
    const bucket = byBroker.get(brokerId) ?? [];
    bucket.push(row);
    byBroker.set(brokerId, bucket);
  }

  console.log('AUD_FADE basis report (last 14 days)\n');
  for (const [brokerId, brokerRows] of byBroker) {
    const wins = brokerRows.filter((row) => row.result === 'win').length;
    const totalPips = brokerRows.reduce((sum, row) => sum + (row.pnl_pips_actual ?? 0), 0);
    console.log(`${brokerId}: n=${brokerRows.length} wins=${wins} total_pips=${totalPips.toFixed(1)}`);
  }

  const oanda = byBroker.get('oanda_practice') ?? [];
  const vt = byBroker.get('vtmarkets_fade_demo') ?? [];
  if (oanda.length && vt.length) {
    const oandaAvg = oanda.reduce((s, r) => s + (r.pnl_pips_actual ?? 0), 0) / oanda.length;
    const vtAvg = vt.reduce((s, r) => s + (r.pnl_pips_actual ?? 0), 0) / vt.length;
    console.log(`\nAvg pips/trade: OANDA ${oandaAvg.toFixed(2)} vs VT ${vtAvg.toFixed(2)} (delta ${(vtAvg - oandaAvg).toFixed(2)})`);
  } else {
    console.log('\nNeed parallel trades on both brokers for slippage/spread delta.');
  }
}

main().catch((err) => {
  console.error('Basis report failed:', err);
  process.exit(1);
});
