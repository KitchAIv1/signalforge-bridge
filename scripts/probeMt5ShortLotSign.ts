/**
 * Phase 0: prove MetaApi sell rejects negative lot volume (current bug) vs positive (fix).
 * Places 0.01 lot SHORT probes on VT Omega demo, closes any opened position.
 *
 * Run: npx tsx scripts/probeMt5ShortLotSign.ts
 */

import 'dotenv/config';
import { bridgeInstrumentToMt5 } from '../src/connectors/broker/symbolMapping.js';
import { getMt5RpcConnection } from '../src/connectors/broker/mt5RpcPool.js';
import { clampMt5Lots } from '../src/connectors/broker/lotConverter.js';

const PROBE_LOTS = 0.01;
const MAGIC = 88001;

async function trySell(
  label: string,
  volumeLots: number,
): Promise<{ label: string; volumeLots: number; ok: boolean; detail: string; positionId?: string }> {
  const accountId = process.env.METAAPI_OMEGA_ACCOUNT_ID?.trim();
  if (!accountId) throw new Error('METAAPI_OMEGA_ACCOUNT_ID required');

  const suffix = process.env.VT_SYMBOL_SUFFIX?.trim() || '-STD';
  const symbol = bridgeInstrumentToMt5('AUD_USD', suffix);
  const rpc = await getMt5RpcConnection(accountId);
  const lots = clampMt5Lots(volumeLots, PROBE_LOTS, PROBE_LOTS);

  try {
    const raw = await rpc.createMarketSellOrder(symbol, lots, undefined, undefined, {
      comment: 'sf_probe',
      magic: MAGIC,
    });
    const code = String(raw.stringCode ?? raw.description ?? '');
    const positionId = String(raw.positionId ?? raw.orderId ?? raw.id ?? '');
    const done = code === 'TRADE_RETCODE_DONE' || code.includes('DONE');
    if (!done) {
      return { label, volumeLots: lots, ok: false, detail: code || JSON.stringify(raw) };
    }
    return { label, volumeLots: lots, ok: true, detail: code, positionId: positionId || undefined };
  } catch (err) {
    return { label, volumeLots: lots, ok: false, detail: err instanceof Error ? err.message : String(err) };
  }
}

async function closeIfOpen(positionId: string): Promise<void> {
  const accountId = process.env.METAAPI_OMEGA_ACCOUNT_ID!.trim();
  const rpc = await getMt5RpcConnection(accountId);
  try {
    await rpc.closePosition(positionId, { comment: 'sf_probe_close' });
    console.log('Closed probe position', positionId);
  } catch (err) {
    console.warn('Could not close probe position', positionId, String(err));
  }
}

async function main(): Promise<void> {
  console.log('=== MT5 SHORT lot-sign probe (Omega demo) ===');
  console.log('VT_SYMBOL_SUFFIX:', process.env.VT_SYMBOL_SUFFIX ?? '-STD');

  const negativeProbe = await trySell('negative_lots (current bug)', -PROBE_LOTS);
  console.log('\n1) Negative volume sell:', negativeProbe);

  const positiveProbe = await trySell('positive_lots (proposed fix)', PROBE_LOTS);
  console.log('\n2) Positive volume sell:', positiveProbe);

  if (positiveProbe.positionId) {
    await closeIfOpen(positiveProbe.positionId);
  }

  console.log('\n=== Conclusion ===');
  if (!negativeProbe.ok && positiveProbe.ok) {
    console.log('CONFIRMED: negative lots fail, positive lots succeed — safe to apply abs() fix.');
  } else if (!negativeProbe.ok && !positiveProbe.ok) {
    console.log('INCONCLUSIVE: both failed — root cause may not be lot sign alone.');
  } else if (negativeProbe.ok) {
    console.log('UNEXPECTED: negative lots succeeded — lot sign is NOT the root cause.');
    if (negativeProbe.positionId) await closeIfOpen(negativeProbe.positionId);
  } else {
    console.log('Review probe output manually.');
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
