/**
 * One-time retroactive fix for null pnl_dollars rows in bridge_trade_log.
 * Fetches each affected trade from OANDA by ID and updates P&L.
 * Run once: npx tsx scripts/fixNullPnlTrades.ts
 */
import * as dotenv from 'dotenv';
dotenv.config();

import { createClient } from '@supabase/supabase-js';
import { computeDerivedFields, resultFromPnl } from '../src/monitoring/tradeMonitorHelpers.js';

const supabase = createClient(
  process.env.SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY ?? process.env.SUPABASE_SERVICE_KEY!,
);

async function main(): Promise<void> {
  // Dynamic import after dotenv — oanda.ts reads env at module load time
  const { getTradeById } = await import('../src/connectors/oanda.js');

  const { data: nullRows, error } = await supabase
    .from('bridge_trade_log')
    .select('id, oanda_trade_id, engine_id, fill_price, stop_loss, units, pair, direction, entry_price, created_at')
    .eq('status', 'closed')
    .eq('decision', 'EXECUTED')
    .is('pnl_dollars', null)
    .not('oanda_trade_id', 'is', null);

  if (error) {
    console.error('[FixNullPnl] Query failed:', error.message);
    return;
  }

  console.log(`[FixNullPnl] Found ${nullRows?.length ?? 0} rows to fix`);

  let fixed = 0;
  let failed = 0;
  let skipped = 0;

  for (const row of nullRows ?? []) {
    const tradeId = row.oanda_trade_id as string;

    try {
      const tradeDetails = await getTradeById(tradeId);

      if (tradeDetails === null || tradeDetails.state !== 'CLOSED') {
        console.log(`[FixNullPnl] SKIP ${tradeId} — not found or not closed`);
        skipped++;
        continue;
      }

      const exitPrice = tradeDetails.averageClosePrice;
      const pnlDollars = tradeDetails.realizedPL;

      if (exitPrice === null) {
        console.log(`[FixNullPnl] SKIP ${tradeId} — no close price`);
        skipped++;
        continue;
      }

      const derived = computeDerivedFields(row, exitPrice, pnlDollars);
      const pnlR = derived.pnl_r != null ? Number(derived.pnl_r) : null;
      const result = resultFromPnl(pnlDollars);

      const { error: updateErr } = await supabase
        .from('bridge_trade_log')
        .update({
          exit_price: exitPrice,
          pnl_dollars: pnlDollars,
          pnl_r: pnlR,
          pnl_pips: derived.pnl_pips ?? undefined,
          result,
          closed_at: tradeDetails.closeTime ?? undefined,
        })
        .eq('id', row.id);

      if (updateErr) {
        console.error(`[FixNullPnl] UPDATE FAILED ${tradeId}:`, updateErr.message);
        failed++;
      } else {
        console.log(
          `[FixNullPnl] FIXED ${tradeId}` +
            ` | engine=${row.engine_id}` +
            ` | pnl=$${pnlDollars ?? 'null'}` +
            ` | result=${result}`,
        );
        fixed++;
      }

      await new Promise((r) => setTimeout(r, 100));
    } catch (err: unknown) {
      console.error(`[FixNullPnl] ERROR ${tradeId}:`, String(err));
      failed++;
    }
  }

  console.log(
    `\n[FixNullPnl] Complete: ${fixed} fixed, ${skipped} skipped, ${failed} failed`,
  );
}

main().catch(console.error);
