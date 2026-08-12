/**
 * High-impact AUD/USD news blackout: no new entries in [event−2h, event+1h].
 */

import { getSupabaseClient } from '../../connectors/supabase.js';
import type { PeakFadeConfig } from './peakFadeTypes.js';

export interface PeakFadeNewsBlock {
  blocked: boolean;
  eventName: string | null;
  eventAt: string | null;
}

function isHighImpact(impact: string | null | undefined): boolean {
  return String(impact ?? '').toUpperCase().trim() === 'HIGH';
}

/**
 * Pure window test: block when now ∈ [event−preH, event+postH].
 * Equivalent event query window: [now−postH, now+preH].
 */
export function isInPeakFadeNewsWindow(
  nowMs: number,
  eventMs: number,
  preHours: number,
  postHours: number,
): boolean {
  const preMs = preHours * 3_600_000;
  const postMs = postHours * 3_600_000;
  return nowMs >= eventMs - preMs && nowMs <= eventMs + postMs;
}

export async function checkPeakFadeNewsBlackout(
  cfg: PeakFadeConfig,
  pair: string,
  nowMs: number = Date.now(),
): Promise<PeakFadeNewsBlock> {
  const queryStart = new Date(
    nowMs - cfg.newsPostHours * 3_600_000,
  ).toISOString();
  const queryEnd = new Date(nowMs + cfg.newsPreHours * 3_600_000).toISOString();

  const { data, error } = await getSupabaseClient()
    .from('news_events')
    .select('event_name, event_datetime_utc, impact, currency, affected_pairs, is_active')
    .gte('event_datetime_utc', queryStart)
    .lte('event_datetime_utc', queryEnd)
    .eq('is_active', true);

  if (error || !data?.length) {
    return { blocked: false, eventName: null, eventAt: null };
  }

  for (const row of data) {
    if (!isHighImpact(row.impact as string | null)) continue;
    const currency = String(row.currency ?? '').toUpperCase();
    const pairs = (row.affected_pairs as string[] | null) ?? [];
    const audUsdRelevant =
      currency === 'AUD' ||
      currency === 'USD' ||
      pairs.includes(pair) ||
      pairs.includes('AUDUSD');
    if (!audUsdRelevant) continue;

    const eventMs = Date.parse(String(row.event_datetime_utc));
    if (
      Number.isFinite(eventMs) &&
      isInPeakFadeNewsWindow(nowMs, eventMs, cfg.newsPreHours, cfg.newsPostHours)
    ) {
      return {
        blocked: true,
        eventName: String(row.event_name ?? 'high_impact'),
        eventAt: String(row.event_datetime_utc),
      };
    }
  }
  return { blocked: false, eventName: null, eventAt: null };
}
