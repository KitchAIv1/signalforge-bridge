/**
 * One-off: verify USDCAD trades 50, 68, 72 against OANDA API.
 * Run: npx tsx src/test/verifyUsdcadOanda.ts
 *
 * Bridge state (from your query):
 *   Trade 50 (Charlie): closed, win +$130.32
 *   Trade 68 (Charlie): closed, loss -$512.43
 *   Trade 72 (Alpha):  OPEN, null exit/pnl
 */

import 'dotenv/config';
import { getOpenTrades, getClosedTradeDetails } from '../connectors/oanda.js';

const TRADE_IDS = ['50', '68', '72'];
const OPEN_TIMES: Record<string, string> = {
  '50': '2026-03-12T04:01:45.000Z',
  '68': '2026-03-12T16:00:05.000Z',
  '72': '2026-03-12T17:34:30.000Z',
};

async function main(): Promise<void> {
  console.log('=== OANDA verification for USDCAD trades 50, 68, 72 ===\n');

  const openTrades = await getOpenTrades();
  const openIds = new Set(openTrades.map((t) => t.id));

  console.log('Open trades in OANDA:', openTrades.length);
  openTrades.forEach((t) => console.log(`  - ${t.instrument} ${t.units} id=${t.id}`));
  console.log('');

  for (const tid of TRADE_IDS) {
    const fromTime = OPEN_TIMES[tid] ?? '2026-03-12T00:00:00.000Z';
    const isOpen = openIds.has(tid);

    console.log(`--- Trade ${tid} ---`);
    console.log('  In OANDA open list:', isOpen ? 'YES' : 'NO');

    if (!isOpen) {
      const details = await getClosedTradeDetails(tid, fromTime);
      console.log('  getClosedTradeDetails:');
      console.log('    exitPrice:', details.exitPrice);
      console.log('    pnlDollars:', details.pnlDollars);
      console.log('    closedTime:', details.closedTime);
    }
    console.log('');
  }

  console.log('=== Done ===');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
