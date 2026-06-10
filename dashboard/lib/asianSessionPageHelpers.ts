import type { AsianSessionDetection } from '@/lib/directionDecisionTypes';
import { getPriorAmdContext } from '@/lib/priorAmdConfidence';
import { ASIAN_FIRE_ACTIONS } from '@/lib/asianSessionConstants';

export function isAsianFireAction(action: AsianSessionDetection['action']): boolean {
  return (ASIAN_FIRE_ACTIONS as readonly string[]).includes(action);
}

export function formatAsianTradeDate(tradeDate: string): string {
  const parsed = new Date(`${tradeDate}T00:00:00Z`);
  return parsed.toLocaleDateString('en-US', { month: 'short', day: 'numeric', timeZone: 'UTC' });
}

export function formatAsianNetPips(value: number | null): string {
  if (value == null) return '—';
  const rounded = Number(value.toFixed(1));
  return `${rounded > 0 ? '+' : ''}${rounded}p`;
}

export function formatAsianSizeMultiplier(value: number | null): string {
  if (value == null) return '—';
  return `${Number(value).toFixed(1)}×`;
}

export function formatPriorBiasLabel(
  priorBias: AsianSessionDetection['prior_direction_bias'],
  priorAmdTag: string | null,
): string {
  if (priorBias === 'long') return 'LONG bias';
  if (priorBias === 'short') return 'SHORT bias';
  if (priorBias === 'neutral') return 'Neutral';
  if (!priorAmdTag) return '—';
  const context = getPriorAmdContext(priorAmdTag);
  if (context.bias === 'NEUTRAL') return 'Neutral';
  return `${context.bias} ${context.pct}%`;
}

export function countDistinctTradeDates(rows: readonly AsianSessionDetection[]): number {
  return new Set(rows.map((row) => row.trade_date)).size;
}

export function deriveNoFireTradeDates(rows: readonly AsianSessionDetection[]): string[] {
  const dates = [...new Set(rows.map((row) => row.trade_date))];
  return dates
    .filter((tradeDate) => !rows.some((row) => row.trade_date === tradeDate && isAsianFireAction(row.action)))
    .sort((left, right) => right.localeCompare(left));
}

export function summarizeNoFireDay(
  rows: readonly AsianSessionDetection[],
  tradeDate: string,
): { checkCount: number; priorAmdTag: string | null } {
  const dayRows = rows.filter((row) => row.trade_date === tradeDate);
  const priorRow = [...dayRows].reverse().find((row) => row.prior_amd_tag);
  return {
    checkCount: dayRows.length,
    priorAmdTag: priorRow?.prior_amd_tag ?? null,
  };
}
