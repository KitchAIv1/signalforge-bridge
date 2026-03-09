/**
 * Phase 2 checkpoint: verify OANDA connection.
 * Prints account balance, EUR_USD price, and list of open trades.
 */

import 'dotenv/config';
import { getAccountSummary, getPricing, getOpenTrades } from '../connectors/oanda.js';

async function main(): Promise<void> {
  console.log('Checking OANDA connection...');
  const summary = await getAccountSummary();
  console.log('Account balance:', summary.balance);
  console.log('Equity:', summary.equity);
  console.log('Open trade count:', summary.openTradeCount);
  const prices = await getPricing('EUR_USD');
  if (prices.length > 0) {
    console.log('EUR_USD bid:', prices[0].bid, 'ask:', prices[0].ask, 'spread:', prices[0].spread);
  }
  const trades = await getOpenTrades();
  console.log('Open trades:', trades.length);
  trades.forEach((t, i) => console.log(`  ${i + 1}. ${t.instrument} ${t.units} id=${t.id}`));
  console.log('OANDA connection OK.');
}

main().catch((err) => {
  console.error('OANDA connection failed:', err);
  process.exit(1);
});
