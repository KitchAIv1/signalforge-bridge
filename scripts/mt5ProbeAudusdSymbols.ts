/**
 * Try AUDUSD symbol variants for candles on MetaApi account.
 */
import dotenv from 'dotenv';
import path from 'node:path';
import { getMt5Session } from '../src/connectors/broker/mt5RpcPool.js';

dotenv.config({ path: path.resolve(process.cwd(), '.env') });

const CANDIDATES = ['AUDUSD', 'AUDUSD-STD', 'AUDUSD-STP', 'AUDUSD-VIP', 'AUDUSD-ECN'];

async function main(): Promise<void> {
  const accountId = process.env.METAAPI_OMEGA_ACCOUNT_ID?.trim();
  if (!accountId) throw new Error('METAAPI_OMEGA_ACCOUNT_ID required');
  const { getHistoricalCandles } = await getMt5Session(accountId);
  for (const symbol of CANDIDATES) {
    try {
      const candles = await getHistoricalCandles(symbol, '5m', new Date(Date.now() - 60 * 60_000), 2);
      const close = candles[candles.length - 1]?.close ?? candles[candles.length - 1]?.c;
      console.log(`OK  ${symbol}  close=${close ?? '—'}  n=${candles.length}`);
    } catch (err) {
      const msg = String(err).split('\n')[0].slice(0, 120);
      console.log(`FAIL ${symbol}  ${msg}`);
    }
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
