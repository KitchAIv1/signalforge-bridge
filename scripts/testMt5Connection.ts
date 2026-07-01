/**
 * MetaApi / VT Markets connection smoke test.
 * Usage: npm run test:mt5-connection
 *
 * Requires .env (or Railway-exported env) with MT5_ENABLED=true and MetaApi credentials.
 */

import dotenv from 'dotenv';
import path from 'node:path';
import { probeMt5Account } from './testMt5Connection/probeMt5Account.js';
import { printProbeReport } from './testMt5Connection/printProbeReport.js';
import { validateMt5Env } from './testMt5Connection/validateMt5Env.js';

dotenv.config({ path: path.resolve(process.cwd(), '.env') });

async function main(): Promise<void> {
  const envConfig = validateMt5Env();
  const probes: Array<{ label: string; accountId: string | undefined; magic: number }> = [
    { label: 'omega', accountId: envConfig.omegaAccountId, magic: 88001 },
    { label: 'fade', accountId: envConfig.fadeAccountId, magic: 88002 },
  ];

  const results = [];
  for (const probe of probes) {
    if (!probe.accountId) {
      console.warn(`[${probe.label}] SKIP — set METAAPI_${probe.label.toUpperCase()}_ACCOUNT_ID`);
      continue;
    }
    console.log(`[${probe.label}] Connecting via MetaApi…`);
    results.push(
      await probeMt5Account({
        label: probe.label,
        accountId: probe.accountId,
        symbolSuffix: envConfig.symbolSuffix,
        magicNumber: probe.magic,
      }),
    );
  }

  if (!results.length) {
    console.error('No account IDs configured. Set METAAPI_OMEGA_ACCOUNT_ID and/or METAAPI_FADE_ACCOUNT_ID.');
    process.exit(1);
  }

  printProbeReport(envConfig, results);

  const anyFailed = results.some((result) => !result.ok);
  if (anyFailed) process.exit(1);
}

main().catch((err) => {
  console.error('MT5 connection test failed:', err instanceof Error ? err.message : err);
  process.exit(1);
});
