/** Format toxic-crack CF scorecards + Policy I × RANGE overlay table. */

import type { PolicyScorecard, PolicyTradeResult } from '../aoRefuseTapeCf/types.js';
import { formatScorecard } from '../aoRefuseTapeCf/scorecard.js';
import type { EnrichedAoTrade } from '../aoRangeSidewaysScorecard/enrichTrades.js';
import type { DayTapeLabel } from '../aoRangeSidewaysScorecard/labels.js';

function actionForResult(
  result: PolicyTradeResult,
  enriched: EnrichedAoTrade | undefined,
): { action: string; why: string } {
  if (!result.taken && result.skipReason === 'session_brake') {
    return { action: 'SKIP_BRAKE', why: 'paused after 2 shallow losers' };
  }
  if (!result.taken && result.skipReason === 'shallow_refuse_skip') {
    return { action: 'SKIP_ENTRY', why: 'shallow+refuse skip' };
  }
  if (result.abortUsed) {
    return { action: 'ABORT', why: 'NFT abort' };
  }
  if (enriched?.policyISkip) {
    return { action: 'KEEP', why: 'eligible refuse-skip but kept (check)' };
  }
  return { action: 'KEEP', why: 'current exit + live size' };
}

export function formatToxicHeader(tradeCount: number, fireCount: number): string[] {
  return [
    'AO TOXIC-CRACK LIVE COUNTERFACTUAL',
    `Generated: ${new Date().toISOString()}`,
    `Live AO closed trades: ${tradeCount}`,
    `Fire stream rows: ${fireCount}`,
    'Truth: OANDA Lane B EXECUTED ALPHAOMEGA + BLOCKED fire stream',
    'RANGE/TREND labels: diagnostic overlay only (NOT a live gate)',
    'Skip rule: len=7 & speed<=40 & refuseTape(3h) & weak conf vs blocked',
    'v1 production target: shallow+refuse skip only (kill-switched, default OFF)',
  ];
}

export function formatPolicyBlocks(scorecards: readonly PolicyScorecard[]): string[] {
  const lines: string[] = [];
  for (const score of scorecards) {
    lines.push(...formatScorecard(score));
  }
  const promoted = scorecards.filter((row) => row.promoteOk && !row.label.startsWith('A)'));
  lines.push('\n=== PROMOTE SUMMARY (non-baseline) ===');
  if (!promoted.length) {
    lines.push('No policy fully passed the promote scorecard.');
  }
  for (const row of promoted) {
    lines.push(
      `PASS ${row.label} | delta $${row.deltaDollars} | delta ${row.deltaPips}p`,
    );
  }
  return lines;
}

export function formatPolicyIRangeTable(
  enriched: readonly EnrichedAoTrade[],
  results: readonly PolicyTradeResult[],
): string[] {
  const byId = new Map(results.map((row) => [row.tradeId, row]));
  const lines: string[] = [
    '\n=== POLICY I × DIAGNOSTIC TAPE (trade-by-trade) ===',
    [
      'Day',
      'Entry',
      'Dir',
      'Len',
      'Spd',
      'Tape',
      'Action',
      'ActPips',
      'CfPips',
      'Act$',
      'Cf$',
      'Why',
    ].join('\t'),
  ];

  const tapeActionCounts = new Map<string, number>();
  for (const row of enriched) {
    const cf = byId.get(row.trade.id);
    if (!cf) continue;
    const { action, why } = actionForResult(cf, row);
    const tape = row.diagnosticLabel;
    const key = `${tape}|${action}`;
    tapeActionCounts.set(key, (tapeActionCounts.get(key) ?? 0) + 1);
    lines.push(
      [
        row.day,
        row.trade.entryAt.slice(11, 16),
        row.trade.direction,
        row.trade.foundingLength,
        row.trade.foundingSpeedMin,
        tape,
        action,
        row.trade.pnlPips.toFixed(1),
        cf.cfPips.toFixed(1),
        row.trade.pnlDollars.toFixed(0),
        cf.cfDollars.toFixed(0),
        why,
      ].join('\t'),
    );
  }

  lines.push('\n=== ACTION × TAPE COUNTS ===');
  const labels: DayTapeLabel[] = ['RANGE_SIDEWAYS', 'TREND_DAY', 'MIXED', 'UNKNOWN'];
  const actions = ['KEEP', 'SKIP_ENTRY', 'SKIP_BRAKE', 'ABORT'];
  for (const tape of labels) {
    const parts = actions.map((action) => {
      const n = tapeActionCounts.get(`${tape}|${action}`) ?? 0;
      return `${action}=${n}`;
    });
    lines.push(`  ${tape}: ${parts.join(' ')}`);
  }
  return lines;
}
