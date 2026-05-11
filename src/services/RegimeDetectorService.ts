/**
 * RegimeDetectorService
 * Fetches OANDA candles, runs all layers, writes result to regime_state table.
 * Called by the bridge scheduler every H4 close.
 */
import { createClient } from '@supabase/supabase-js';
import { fetchCompletedCandles } from '../connectors/oanda.js';
import {
  computeLayer4,
  computeLayer5,
  computeLayer6,
  computeLayer7,
  fetchCurrentMidPrice,
  isWeeklyOpenWindow,
} from './regimeDetector/layerComputation.js';
import { classifyRegime } from './regimeDetector/regimeClassifier.js';

const AUDUSD_PAIR   = 'AUD_USD';
const D1_DAYS_BACK  = 18;
const H4_DAYS_BACK  = 3;

function buildLookbackISO(daysBack: number): string {
  const lookbackDate = new Date();
  lookbackDate.setUTCDate(lookbackDate.getUTCDate() - daysBack);
  lookbackDate.setUTCHours(0, 0, 0, 0);
  return lookbackDate.toISOString();
}

function buildRegimeSupabaseClient() {
  const supabaseUrl = process.env.SUPABASE_URL;
  const supabaseKey =
    process.env.SUPABASE_SERVICE_ROLE_KEY ?? process.env.SUPABASE_SERVICE_KEY;
  if (!supabaseUrl || !supabaseKey) {
    throw new Error('[RegimeDetector] Missing SUPABASE_URL or service key env var');
  }
  return createClient(supabaseUrl, supabaseKey);
}

export async function runRegimeDetection(): Promise<void> {
  const evaluatedAt = new Date();
  const toISO       = evaluatedAt.toISOString();

  console.log(`[RegimeDetector] Running for ${AUDUSD_PAIR} at ${toISO}`);

  const [d1Candles, h4Candles] = await Promise.all([
    fetchCompletedCandles(AUDUSD_PAIR, 'D',  buildLookbackISO(D1_DAYS_BACK), toISO),
    fetchCompletedCandles(AUDUSD_PAIR, 'H4', buildLookbackISO(H4_DAYS_BACK), toISO),
  ]);

  if (d1Candles.length < 5 || h4Candles.length < 6) {
    console.warn(
      `[RegimeDetector] Insufficient candles — D1: ${d1Candles.length}, H4: ${h4Candles.length} — skipping`
    );
    return;
  }

  const l4 = computeLayer4(d1Candles, evaluatedAt);
  const l5 = computeLayer5(h4Candles, evaluatedAt);
  const l6 = computeLayer6(d1Candles, evaluatedAt);

  // Layer 7 — weekly open reality check (active Sunday 21:00 → Monday 01:00 UTC only)
  let effectiveL5Result = l5.result;
  let layer7Output: Awaited<ReturnType<typeof computeLayer7>> | null = null;

  if (isWeeklyOpenWindow(evaluatedAt)) {
    const currentMidPrice = await fetchCurrentMidPrice(AUDUSD_PAIR);
    layer7Output = computeLayer7(d1Candles, currentMidPrice ?? 0, evaluatedAt);

    if (layer7Output.l5Override !== null) {
      effectiveL5Result = layer7Output.l5Override;
      console.log(
        `[RegimeDetector] Layer7 ACTIVE — ${layer7Output.overrideReason} ` +
        `| fridayClose: ${layer7Output.fridayClose} ` +
        `| currentPrice: ${layer7Output.currentPrice} ` +
        `| pipDiff: ${layer7Output.pipDiff} ` +
        `| L5 overridden: ${l5.result} → ${effectiveL5Result}`
      );
    } else {
      console.log(
        `[RegimeDetector] Layer7 ACTIVE — no override ` +
        `| ${layer7Output.overrideReason}`
      );
    }
  }

  const regime = classifyRegime(
    l4.result,
    effectiveL5Result,
    l6.positionPct,
    Math.abs(l5.pipDiff)
  );

  const supabase = buildRegimeSupabaseClient();
  const { error } = await supabase.from('regime_state').insert({
    pair:                    AUDUSD_PAIR,
    evaluated_at:            toISO,
    regime_direction:        regime.direction,
    regime_confidence:       regime.confidence,
    choppy_extended_override: regime.choppyExtendedOverride,
    layer4_result:           l4.result,
    layer4_bullish_count:    l4.bullishCount,
    layer4_bearish_count:    l4.bearishCount,
    layer5_result:          effectiveL5Result,
    layer5_result_raw:      l5.result,
    layer7_pip_diff:        layer7Output?.pipDiff ?? null,
    layer7_override_active: layer7Output != null && layer7Output.l5Override !== null,
    layer5_pip_diff:         l5.pipDiff,
    layer6_position_pct:     l6.positionPct,
  });

  if (error) {
    console.error('[RegimeDetector] Write to regime_state failed:', error.message);
    return;
  }

  console.log(
    `[RegimeDetector] Written → ${regime.direction} (${regime.confidence}) ` +
    `| L4:${l4.result}(${l4.bullishCount}b/${l4.bearishCount}br) ` +
    `| L5:${l5.result}→effective:${effectiveL5Result}(${l5.pipDiff}pips) ` +
    `| L6:${l6.positionPct}% ` +
    `| choppy:${regime.choppyExtendedOverride} ` +
    `| L7:${layer7Output ? `active(${layer7Output.pipDiff}pips→${layer7Output.l5Override ?? 'no override'})` : 'inactive'}`
  );
}
