/**
 * Toxic-crack CF: Policy I levers × diagnostic RANGE overlay + promote gates.
 * Read-only research — does not change live trading.
 *
 * Run: npx tsx scripts/aoToxicCrackCf/runAoToxicCrackCf.ts
 */
import { writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadEngineM5LongExtended } from '../alphaOmega2yBacktest/loadEngineM5Candles.js';
import { applyPolicyToLiveBook } from '../aoRefuseTapeCf/applyPolicies.js';
import {
  createBridgeSupabase,
  loadLiveAoExecutedBook,
  loadOmegaLaneBFireStream,
} from '../aoRefuseTapeCf/loadLiveBook.js';
import { buildScorecard } from '../aoRefuseTapeCf/scorecard.js';
import type { TradePathMetrics } from '../aoRefuseTapeCf/types.js';
import { walkLiveTradePath } from '../aoRefuseTapeCf/walkLiveTradePath.js';
import { enrichLiveAoTrades } from '../aoRangeSidewaysScorecard/enrichTrades.js';
import {
  formatPolicyBlocks,
  formatPolicyIRangeTable,
  formatToxicHeader,
} from './formatToxicReport.js';
import { POLICY_I_FLAGS, TOXIC_CRACK_POLICIES } from './policies.js';

const SCRIPT_DIR = dirname(fileURLToPath(import.meta.url));
const OUT_TXT = join(SCRIPT_DIR, '..', 'output', 'ao_toxic_crack_cf.txt');
const OUT_JSON = join(SCRIPT_DIR, '..', 'output', 'ao_toxic_crack_cf.json');

async function main(): Promise<void> {
  const supabase = createBridgeSupabase();
  const trades = await loadLiveAoExecutedBook(supabase);
  if (!trades.length) throw new Error('No closed live AO trades found');

  const fromIso = `${trades[0]!.createdAt.slice(0, 10)}T00:00:00.000Z`;
  const lastDay = trades[trades.length - 1]!.createdAt.slice(0, 10);
  const toIso = new Date(Date.parse(`${lastDay}T00:00:00Z`) + 86_400_000).toISOString();
  const fires = await loadOmegaLaneBFireStream(supabase, fromIso, toIso);
  const candles = await loadEngineM5LongExtended();

  const paths = new Map<string, TradePathMetrics>();
  for (const trade of trades) {
    paths.set(
      trade.id,
      walkLiveTradePath(
        candles,
        trade.direction,
        trade.entryAt,
        trade.fillPrice,
        trade.closedAt,
      ),
    );
  }

  const scorecards = [];
  let policyIResults = null;
  for (const policy of TOXIC_CRACK_POLICIES) {
    const results = policy.label.startsWith('A)')
      ? trades.map((trade) => ({
          tradeId: trade.id,
          day: trade.createdAt.slice(0, 10),
          taken: true,
          skipReason: null,
          cfPips: trade.pnlPips,
          cfDollars: trade.pnlDollars,
          sizeMult: 1,
          abortUsed: false,
          actualPips: trade.pnlPips,
          actualDollars: trade.pnlDollars,
        }))
      : applyPolicyToLiveBook(trades, fires, paths, policy);
    const score = buildScorecard(policy.label, results);
    scorecards.push(score);
    if (policy.label.startsWith('I)')) policyIResults = results;
  }

  const enriched = enrichLiveAoTrades(trades, candles, fires);
  const lines = [
    ...formatToxicHeader(trades.length, fires.length),
    ...formatPolicyBlocks(scorecards),
    ...formatPolicyIRangeTable(enriched, policyIResults ?? []),
  ];

  const mesh = scorecards.find((row) => row.label.startsWith('I)'));
  const skipOnly = scorecards.find((row) => row.label.startsWith('D)'));
  lines.push('\n=== V1 GO / NO-GO ===');
  lines.push(
    `Policy I mesh PROMOTE: ${mesh?.promoteOk ? 'YES' : 'NO'} ` +
      `(delta $${mesh?.deltaDollars ?? 0} / ${mesh?.deltaPips ?? 0}p)`,
  );
  lines.push(
    `Skip-only (D) PROMOTE: ${skipOnly?.promoteOk ? 'YES' : 'NO'} ` +
      `(delta $${skipOnly?.deltaDollars ?? 0} / ${skipOnly?.deltaPips ?? 0}p)`,
  );
  lines.push(
    `v1 ships skip-only when D promote OR I promote; brake/abort deferred.`,
  );

  const text = lines.join('\n');
  writeFileSync(OUT_TXT, text);
  writeFileSync(
    OUT_JSON,
    JSON.stringify(
      {
        generatedAt: new Date().toISOString(),
        tradeCount: trades.length,
        fireCount: fires.length,
        policyIFlags: POLICY_I_FLAGS,
        scorecards,
        goNoGo: {
          policyIPromote: mesh?.promoteOk ?? false,
          skipOnlyPromote: skipOnly?.promoteOk ?? false,
        },
      },
      null,
      2,
    ),
  );
  console.log(text);
  console.log(`\nWrote ${OUT_TXT}`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
