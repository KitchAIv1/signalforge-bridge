import type { Mt5EnvConfig } from './validateMt5Env.js';
import type { Mt5ProbeResult } from './probeMt5Account.js';

function formatMoney(value: number | null): string {
  return value == null ? '—' : value.toFixed(2);
}

export function printProbeReport(envConfig: Mt5EnvConfig, results: Mt5ProbeResult[]): void {
  console.log('\n=== MT5 connection smoke test ===');
  console.log(`Region: ${envConfig.region}  Symbol suffix: ${envConfig.symbolSuffix}`);
  console.log('');

  for (const result of results) {
    if (result.error) {
      console.log(`[${result.label}] FAIL`);
      console.log(`  accountId: ${result.accountId}`);
      console.log(`  error: ${result.error}`);
      continue;
    }
    console.log(`[${result.label}] OK`);
    console.log(`  accountId: ${result.accountId}`);
    console.log(`  equity: ${formatMoney(result.equity)}  balance: ${formatMoney(result.balance)}`);
    console.log(`  open trades: ${result.openTrades ?? 0}`);
    console.log(`  symbol: ${result.audusdSymbol}  M5 close: ${result.latestM5Close ?? '—'}`);
    if (result.candleWarning) {
      console.log(`  candle warning: ${result.candleWarning}`);
      if (result.audusdSymbolHints.length) {
        console.log(`  AUDUSD symbols on broker: ${result.audusdSymbolHints.join(', ')}`);
        console.log('  → Update VT_SYMBOL_SUFFIX in .env (Standard STP = -STD per VT Help Centre).');
      }
    }
  }

  const failed = results.filter((result) => !result.ok);
  console.log('');
  if (failed.length) {
    console.log(`Result: ${results.length - failed.length}/${results.length} accounts passed`);
    return;
  }
  console.log(`Result: ${results.length}/${results.length} accounts passed`);
}
