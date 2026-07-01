/**
 * List tradable AUDUSD symbol names from MetaApi (ground truth for VT_SYMBOL_SUFFIX).
 * Usage: npm run mt5:list-symbols
 */

import dotenv from 'dotenv';
import path from 'node:path';
import { getMt5Session } from '../src/connectors/broker/mt5RpcPool.js';

dotenv.config({ path: path.resolve(process.cwd(), '.env') });

async function listAudusdSymbols(accountId: string, label: string): Promise<void> {
  const { rpc } = await getMt5Session(accountId);
  const symbols = await rpc.getSymbols();
  const audusdMatches = symbols.filter((symbol) => /AUDUSD/i.test(symbol));
  console.log(`\n[${label}] AUDUSD-related symbols (${audusdMatches.length}):`);
  for (const symbol of audusdMatches.slice(0, 30)) {
    console.log(`  ${symbol}`);
  }
  if (audusdMatches.length > 30) {
    console.log(`  ... and ${audusdMatches.length - 30} more`);
  }
}

async function main(): Promise<void> {
  if (!process.env.METAAPI_TOKEN?.trim()) {
    console.error('METAAPI_TOKEN required');
    process.exit(1);
  }
  const omegaId = process.env.METAAPI_OMEGA_ACCOUNT_ID?.trim();
  if (!omegaId) {
    console.error('METAAPI_OMEGA_ACCOUNT_ID required');
    process.exit(1);
  }
  console.log('VT_SYMBOL_SUFFIX in env:', JSON.stringify(process.env.VT_SYMBOL_SUFFIX ?? '(not set)'));
  await listAudusdSymbols(omegaId, 'omega');
}

main().catch((err) => {
  console.error(String(err));
  process.exit(1);
});
