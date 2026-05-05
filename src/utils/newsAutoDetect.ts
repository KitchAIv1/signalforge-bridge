/**
 * Periodic post-news price reconciliation: detects direction vs pre-event price, updates news_events and news_event_log.
 */
import type { SupabaseClient } from '@supabase/supabase-js';
import { getPricing } from '../connectors/oanda.js';

const OANDA_TOKEN = process.env['OANDA_API_TOKEN'];
const OANDA_ACCOUNT_ID = process.env['OANDA_ACCOUNT_ID'];
const OANDA_ENV = process.env['OANDA_ENVIRONMENT'] ?? 'practice';

function oandaApiBase(): string {
  return OANDA_ENV === 'live'
    ? 'https://api-fxtrade.oanda.com'
    : 'https://api-fxpractice.oanda.com';
}

async function oandaAuthorizedFetch(path: string): Promise<Response> {
  if (!OANDA_TOKEN || !OANDA_ACCOUNT_ID) {
    throw new Error('Missing OANDA_API_TOKEN or OANDA_ACCOUNT_ID');
  }
  const url = `${oandaApiBase()}${path}`;
  return fetch(url, {
    headers: {
      Authorization: `Bearer ${OANDA_TOKEN}`,
      'Content-Type': 'application/json',
    },
    signal: AbortSignal.timeout(15_000),
  });
}

function pipScalerForPair(pair: string): number {
  return pair.includes('JPY') ? 100 : 10_000;
}

function mapCurrencyCodeToInstrument(currencyHint: string | null | undefined): string {
  const c = (currencyHint ?? 'AUD').toUpperCase().trim();
  if (c === 'GBP') return 'GBP_USD';
  if (c === 'USD') return 'AUD_USD';
  if (c === 'AUD') return 'AUD_USD';
  return 'AUD_USD';
}

async function pricingMid(pair: string): Promise<number | null> {
  const quotes = await getPricing(pair);
  const q = quotes[0];
  if (!q) return null;
  const bid = parseFloat(q.bid);
  const ask = parseFloat(q.ask);
  if (!Number.isFinite(bid) || !Number.isFinite(ask)) return null;
  return (bid + ask) / 2;
}

async function fetchM5CloseNearestBeforeEvent(
  pair: string,
  eventTimeIso: string
): Promise<number | null> {
  const eventMs = new Date(eventTimeIso).getTime();
  const fromIso = new Date(eventMs - 10 * 60_000).toISOString();
  const toIso = new Date(eventTimeIso).toISOString();
  const path =
    `/v3/instruments/${encodeURIComponent(pair)}/candles` +
    `?granularity=M5&price=M&from=${encodeURIComponent(fromIso)}&to=${encodeURIComponent(toIso)}`;
  const res = await oandaAuthorizedFetch(path);
  if (!res.ok) return null;
  const body = (await res.json()) as {
    candles?: Array<{ complete?: boolean; mid?: { c?: string } }>;
  };
  const candles = body.candles ?? [];
  let lastClose: number | null = null;
  for (const candleSegment of candles) {
    if (candleSegment.complete && candleSegment.mid?.c != null) {
      lastClose = parseFloat(candleSegment.mid.c);
    }
  }
  return lastClose != null && Number.isFinite(lastClose) ? lastClose : null;
}

function expiryMinutesForCategory(categoryRaw: string | null | undefined): number {
  const c = (categoryRaw ?? '').toUpperCase();
  if (c === 'CENTRAL_BANK') return 240;
  if (c === 'DATA_RELEASE') return 120;
  return 120;
}

async function fetchOmegaDirectionConfig(
  supabase: SupabaseClient
): Promise<string> {
  const { data: dirRowPayload } = await supabase
    .from('bridge_config')
    .select('config_value')
    .eq('config_key', 'omega_direction')
    .maybeSingle();

  const rawVal = dirRowPayload?.config_value;
  return typeof rawVal === 'string' ? rawVal : 'long';
}

interface PendingNewsEventPayload {
  id: string;
  event_name: string;
  event_datetime_utc: string;
  confirmation_delay_minutes?: number | null;
  event_category?: string | null;
  currency?: string | null;
  detection_threshold_pips?: number | null;
  pre_event_price?: number | null;
  forecast_value?: unknown;
  actual_value?: unknown;
  beat_miss?: unknown;
  affected_pairs?: string[] | null;
}

export async function runNewsAutoDetect(supabase: SupabaseClient): Promise<void> {
  const fourHoursAgo = new Date(Date.now() - 4 * 60 * 60 * 1000).toISOString();
  const nowIso = new Date().toISOString();

  const { data: pendingSignals } = await supabase
    .from('news_events')
    .select(
      [
        'id',
        'event_name',
        'event_datetime_utc',
        'confirmation_delay_minutes',
        'event_category',
        'currency',
        'detection_threshold_pips',
        'pre_event_price',
        'forecast_value',
        'actual_value',
        'beat_miss',
        'affected_pairs',
      ].join(', ')
    )
    .lte('event_datetime_utc', nowIso)
    .gte('event_datetime_utc', fourHoursAgo)
    .eq('is_active', true)
    .is('post_event_direction', null);

  if (!Array.isArray(pendingSignals) || pendingSignals.length === 0) {
    return;
  }

  const directionFromBridge = await fetchOmegaDirectionConfig(supabase);
  const nowMs = Date.now();

  for (const eventRowWrap of (pendingSignals as unknown) as PendingNewsEventPayload[]) {
    try {
      const eventTimeMsVal = new Date(eventRowWrap.event_datetime_utc).getTime();
      const hardMinutes = eventRowWrap.confirmation_delay_minutes ?? 60;
      const hardEndMsVal = eventTimeMsVal + hardMinutes * 60_000;

      if (nowMs < hardEndMsVal) continue;

      const pairResolved = mapCurrencyCodeToInstrument(eventRowWrap.currency ?? 'AUD');

      let prePriceTracked = eventRowWrap.pre_event_price;
      if (prePriceTracked == null) {
        const candleCloseHydrated = await fetchM5CloseNearestBeforeEvent(
          pairResolved,
          eventRowWrap.event_datetime_utc
        );
        if (candleCloseHydrated == null) continue;
        prePriceTracked = candleCloseHydrated;
        await supabase
          .from('news_events')
          .update({ pre_event_price: prePriceTracked })
          .eq('id', eventRowWrap.id);
      }

      const currentMidHydrated = await pricingMid(pairResolved);
      if (currentMidHydrated == null || prePriceTracked == null) continue;

      const scaler = pipScalerForPair(pairResolved);
      const pipMoveRaw =
        scaler * (currentMidHydrated - prePriceTracked);
      const thresholdPipsStored = eventRowWrap.detection_threshold_pips ?? 15;

      let directionMarked: string;
      let detectionConfidenceHydrated: string;

      if (pipMoveRaw >= thresholdPipsStored) {
        directionMarked = 'long';
        detectionConfidenceHydrated =
          pipMoveRaw >= thresholdPipsStored * 2 ? 'HIGH' : 'MEDIUM';
      } else if (pipMoveRaw <= -thresholdPipsStored) {
        directionMarked = 'short';
        detectionConfidenceHydrated =
          Math.abs(pipMoveRaw) >= thresholdPipsStored * 2 ? 'HIGH' : 'MEDIUM';
      } else {
        directionMarked = 'volatile';
        detectionConfidenceHydrated = 'LOW';
      }

      const expiryMinutesHydrated =
        expiryMinutesForCategory(eventRowWrap.event_category);
      const expiryIsoHydrated =
        directionMarked !== 'volatile'
          ? new Date(nowMs + expiryMinutesHydrated * 60_000).toISOString()
          : null;

      if (directionMarked !== 'volatile') {
        await supabase
          .from('news_events')
          .update({
            post_event_direction: directionMarked,
            post_event_confirmed_at: new Date().toISOString(),
            post_event_expires_at: expiryIsoHydrated,
            post_event_price: currentMidHydrated,
            pip_move_actual: pipMoveRaw,
          })
          .eq('id', eventRowWrap.id);
      }

      // ── AUTO-FLIP OMEGA DIRECTION ─────────────────────────────
      // Conditions: confirmed direction (not volatile), HIGH or
      // MEDIUM confidence, AUD_USD-relevant event, direction
      // differs from current bridge_config value.
      // When all conditions met: UPDATE bridge_config so Fix 1
      // flip detector fires on next Omega signal → auto-closes
      // opposing positions → exploitation multiplier activates.
      const isAudUsdRelevant =
        Array.isArray(eventRowWrap.affected_pairs) &&
        (eventRowWrap.affected_pairs as string[]).some(
          (p) => p.replace('_', '').toUpperCase() === 'AUDUSD'
        );

      const shouldFlipDirection =
        directionMarked !== 'volatile' &&
        detectionConfidenceHydrated !== 'LOW' &&
        isAudUsdRelevant;

      const directionConflict =
        shouldFlipDirection &&
        directionFromBridge.toLowerCase() !== directionMarked;

      if (shouldFlipDirection) {
        if (directionConflict) {
          await supabase
            .from('bridge_config')
            .update({
              config_value: directionMarked,
              updated_at: new Date().toISOString(),
            })
            .eq('config_key', 'omega_direction');
          console.log(
            `[NewsAutoDetect] Direction flip: ` +
            `${directionFromBridge.toLowerCase()} → ${directionMarked}` +
            ` | Event: ${eventRowWrap.event_name}` +
            ` | pip_move: ${pipMoveRaw.toFixed(1)}` +
            ` | confidence: ${detectionConfidenceHydrated}`
          );
        } else {
          console.log(
            `[NewsAutoDetect] Direction confirmed — no flip needed: ` +
            `${directionMarked}` +
            ` | Event: ${eventRowWrap.event_name}` +
            ` | pip_move: ${pipMoveRaw.toFixed(1)}`
          );
        }
      }
      // ── END AUTO-FLIP ─────────────────────────────────────────

      await supabase.from('news_event_log').insert({
        news_event_id: eventRowWrap.id,
        event_name: eventRowWrap.event_name,
        event_datetime_utc: eventRowWrap.event_datetime_utc,
        pre_event_price: prePriceTracked,
        post_event_price: currentMidHydrated,
        pip_move: pipMoveRaw,
        direction_detected: directionMarked,
        detection_confidence: detectionConfidenceHydrated,
        current_override: directionFromBridge,
        conflict_detected: directionConflict,
        trades_blocked: 0,
        trades_allowed: 0,
        net_r_during_window: null,
        forecast_value: eventRowWrap.forecast_value ?? null,
        actual_value: eventRowWrap.actual_value ?? null,
        beat_miss: eventRowWrap.beat_miss ?? null,
      });
    } catch (oneRowErr: unknown) {
      console.error(
        `[NewsAutoDetect] event skip id=${eventRowWrap.id}:`,
        String(oneRowErr)
      );
    }
  }
}
