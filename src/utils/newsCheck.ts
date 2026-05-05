/**
 * News intelligence: pre-event bias, hard confirmation block, post-event direction vs override.
 */
import { getSupabaseClient } from '../connectors/supabase.js';

/** Wide fetch window — per-event windows applied in-memory (pre_event_window_minutes varies). */
const QUERY_SEMI_WIDTH_MS = 240 * 60 * 1000;

export interface NewsWindowResult {
  eventName: string;
  eventId: string;
  preEventAction: 'BLOCK' | 'REDUCE' | 'ALLOW';
  audusdBias: string;
  postEventDirection: string | null;
  postEventExpired: boolean;
  inPreWindow: boolean;
  inPostWindow: boolean;
  inHardBlock: boolean;
  conflictsWithCurrentOverride: boolean;
  exploitationActive: boolean;
  blockReason: string | null;
}

interface NewsEventRowRaw {
  id: string;
  event_name: string;
  event_datetime_utc: string;
  confirmation_delay_minutes?: number | null;
  audusd_bias?: string | null;
  pre_event_action?: string | null;
  pre_event_window_minutes?: number | null;
  event_category?: string | null;
  post_event_direction?: string | null;
  post_event_expires_at?: string | null;
  detection_threshold_pips?: number | null;
}

function normalizeBiasKey(rawBias: string | null | undefined): string {
  return (rawBias ?? '').toUpperCase().trim();
}

function normalizePreAction(rawAct: string | null | undefined): 'BLOCK' | 'REDUCE' | 'ALLOW' {
  const u = (rawAct ?? 'ALLOW').toUpperCase().trim();
  if (u === 'BLOCK' || u === 'REDUCE' || u === 'ALLOW') return u;
  return 'ALLOW';
}

function categoryExpiryMs(eventCategory: string | null | undefined): number {
  const c = (eventCategory ?? '').toUpperCase();
  if (c === 'CENTRAL_BANK') return 240 * 60_000;
  if (c === 'DATA_RELEASE') return 120 * 60_000;
  return 120 * 60_000;
}

function preBiasConflicts(audusdBiasUpper: string, overrideLc: string): boolean {
  if (audusdBiasUpper === 'BULLISH_AUD') return overrideLc === 'short';
  if (audusdBiasUpper === 'BEARISH_AUD') return overrideLc === 'long';
  return false;
}

function postDirConflicts(
  postDirection: string | null | undefined,
  overrideLc: string
): boolean {
  if (postDirection == null) return false;
  const p = String(postDirection).toLowerCase();
  if (p !== 'long' && p !== 'short') return false;
  return p !== overrideLc;
}

function exploitationMatches(postDirection: string | null | undefined, overrideLc: string): boolean {
  if (postDirection == null) return false;
  const p = String(postDirection).toLowerCase();
  if (p !== 'long' && p !== 'short') return false;
  return p === overrideLc;
}

function buildWindowsForRow(event: NewsEventRowRaw, nowMs: number) {
  const eventTimeMs = new Date(event.event_datetime_utc).getTime();
  const hardBlockMs = (event.confirmation_delay_minutes ?? 60) * 60_000;
  const preMs = (event.pre_event_window_minutes ?? 60) * 60_000;
  const expiryAnchorMs = categoryExpiryMs(event.event_category);

  const inPreWindow = nowMs >= eventTimeMs - preMs && nowMs < eventTimeMs;
  const inHardBlock = nowMs >= eventTimeMs && nowMs < eventTimeMs + hardBlockMs;
  const inPostWindow =
    nowMs >= eventTimeMs + hardBlockMs && nowMs <= eventTimeMs + expiryAnchorMs;

  const expireMsStored = event.post_event_expires_at
    ? new Date(event.post_event_expires_at).getTime()
    : null;
  const postEventExpired =
    expireMsStored != null && !Number.isNaN(expireMsStored) && nowMs > expireMsStored;

  return {
    eventTimeMs,
    inPreWindow,
    inHardBlock,
    inPostWindow,
    hardBlockMs,
    postEventExpired,
  };
}

function rowToResult(event: NewsEventRowRaw, overrideLc: string): NewsWindowResult {
  const nowMs = Date.now();
  const { inPreWindow, inHardBlock, inPostWindow, postEventExpired } =
    buildWindowsForRow(event, nowMs);

  const biasU = normalizeBiasKey(event.audusd_bias);
  const preAct = normalizePreAction(event.pre_event_action);

  const conflictsWithCurrentOverride =
    (inPreWindow ? preBiasConflicts(biasU, overrideLc) : false) ||
    (inPostWindow ? postDirConflicts(event.post_event_direction, overrideLc) : false);

  const exploitationActive =
    inPostWindow &&
    !postEventExpired &&
    exploitationMatches(event.post_event_direction, overrideLc);

  let blockReason: string | null = null;
  if (inHardBlock) {
    blockReason = `NEWS_HARD_BLOCK: ${event.event_name} — confirmation window active`;
  } else if (inPreWindow && preAct === 'BLOCK') {
    if (preBiasConflicts(biasU, overrideLc)) {
      blockReason = `NEWS_BIAS_CONFLICT: ${event.event_name} — ${biasU || 'UNKNOWN'} conflicts with current ${overrideLc} direction`;
    } else {
      blockReason = `NEWS_PRE_BLOCK: ${event.event_name} — pre-event window active`;
    }
  } else if (inPostWindow && postDirConflicts(event.post_event_direction, overrideLc)) {
    blockReason =
      `NEWS_DIRECTION_CONFLICT: ${event.event_name} — post-event direction ` +
      `${String(event.post_event_direction)} conflicts with current ${overrideLc}`;
  }

  const postNormalized =
    event.post_event_direction == null ? null : String(event.post_event_direction);

  return {
    eventName: event.event_name,
    eventId: event.id,
    preEventAction: preAct,
    audusdBias: event.audusd_bias ?? '',
    postEventDirection: postNormalized,
    postEventExpired,
    inPreWindow,
    inPostWindow,
    inHardBlock,
    conflictsWithCurrentOverride,
    exploitationActive,
    blockReason,
  };
}

/**
 * Intelligence layer around news_events vs current bridge override (Omega long/short).
 * Returns null if no qualifying window hit or on error — caller must not treat as blocking.
 */
export async function getNewsWindowEvent(
  oandaInstrument: string,
  currentOverride: string
): Promise<NewsWindowResult | null> {
  try {
    const pair = oandaInstrument.replace('_', '');
    const overrideLc = currentOverride.toLowerCase().trim();
    const nowMs = Date.now();

    const { data, error } = await getSupabaseClient()
      .from('news_events')
      .select(
        [
          'id',
          'event_name',
          'event_datetime_utc',
          'confirmation_delay_minutes',
          'audusd_bias',
          'pre_event_action',
          'pre_event_window_minutes',
          'event_category',
          'post_event_direction',
          'post_event_confirmed_at',
          'post_event_expires_at',
          'detection_threshold_pips',
          'pre_event_price',
          'post_event_price',
          'pip_move_actual',
          'forecast_value',
          'actual_value',
          'beat_miss',
        ].join(', ')
      )
      .contains('affected_pairs', [pair])
      .eq('is_active', true)
      .gte(
        'event_datetime_utc',
        new Date(nowMs - QUERY_SEMI_WIDTH_MS).toISOString()
      )
      .lte(
        'event_datetime_utc',
        new Date(nowMs + QUERY_SEMI_WIDTH_MS).toISOString()
      )
      .order('event_datetime_utc', { ascending: true })
      .limit(5);

    if (error || !Array.isArray(data) || data.length === 0) return null;

    for (const row of (data as unknown) as NewsEventRowRaw[]) {
      const { inPreWindow, inHardBlock, inPostWindow } = buildWindowsForRow(row, nowMs);
      if (!inPreWindow && !inHardBlock && !inPostWindow) continue;
      return rowToResult(row, overrideLc);
    }
    return null;
  } catch (err: unknown) {
    console.error('[newsCheck] getNewsWindowEvent failed:', String(err));
    return null;
  }
}
