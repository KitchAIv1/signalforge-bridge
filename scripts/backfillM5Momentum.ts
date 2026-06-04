// Backfills m5_w2_net_pips and m5_momentum_type for all historical amd_state rows
// where columns are NULL but amd_m5_distribution_candles has data.
// Run: npx ts-node -P tsconfig.amd-tc-backtest.json scripts/backfillM5Momentum.ts

import * as dotenv from 'dotenv';
dotenv.config();

import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY ?? process.env.SUPABASE_SERVICE_KEY!
);

async function run() {
  const { data: stateRows, error } = await supabase
    .from('amd_state')
    .select('trade_date, m5_first_3_net_pips, judas_direction')
    .is('m5_momentum_type', null)
    .not('m5_vs_judas_direction', 'is', null)
    .eq('pair', 'AUD_USD')
    .order('trade_date', { ascending: true });

  if (error || !stateRows) {
    console.error('Fetch error:', error);
    process.exit(1);
  }

  console.log(`Rows to backfill: ${stateRows.length}`);

  let updated = 0;
  let skipped = 0;

  for (const row of stateRows) {
    try {
      const { data: candleRow } = await supabase
        .from('amd_m5_distribution_candles')
        .select('candles, candle_count')
        .eq('trade_date', row.trade_date)
        .eq('pair', 'AUD_USD')
        .eq('fetch_status', 'success')
        .single();

      if (!candleRow || !candleRow.candles || candleRow.candles.length < 6) {
        skipped++;
        continue;
      }

      const candles = candleRow.candles;

      const w1Net = candles.slice(0, 3).reduce(
        (sum: number, c: { o: string; c: string }) =>
          sum + (parseFloat(c.c) - parseFloat(c.o)),
        0,
      ) * 10000;

      const w2Net = candles.slice(3, 6).reduce(
        (sum: number, c: { o: string; c: string }) =>
          sum + (parseFloat(c.c) - parseFloat(c.o)),
        0,
      ) * 10000;

      const m5_w2_net_pips = parseFloat(w2Net.toFixed(4));

      const w1Dir = w1Net > 1 ? 'UP' : w1Net < -1 ? 'DOWN' : 'FLAT';
      const w2Dir = w2Net > 1 ? 'UP' : w2Net < -1 ? 'DOWN' : 'FLAT';

      const m5_momentum_type =
        w1Dir === 'FLAT' || w2Dir === 'FLAT' ? 'STALLED' :
        w1Dir === w2Dir                       ? 'SUSTAINED' :
                                                'REVERSED';

      const { error: updateErr } = await supabase
        .from('amd_state')
        .update({ m5_w2_net_pips, m5_momentum_type })
        .eq('trade_date', row.trade_date)
        .eq('pair', 'AUD_USD');

      if (updateErr) {
        console.error(`Update error on ${row.trade_date}:`, updateErr);
        skipped++;
      } else {
        updated++;
        if (updated % 20 === 0) console.log(`Progress: ${updated} updated...`);
      }
    } catch (e) {
      console.error(`Error on ${row.trade_date}:`, e);
      skipped++;
    }
  }

  console.log(`Done. Updated: ${updated} | Skipped: ${skipped}`);
}

run();
