/**
 * Asian session intraday condition detection — sets omega_direction during 00:00–08:00 UTC.
 */
import { getSupabaseClient } from '../connectors/supabase.js';
import { nextAsianSessionExpiry } from './asianDirection/asianSessionExpiry.js';
import {
  getBridgeConfigValue,
  setBridgeConfigValues,
} from './asianDetection/bridgeConfigHelpers.js';
import { detectConditionA } from './asianDetection/detectConditionA.js';
import { detectConditionB } from './asianDetection/detectConditionB.js';
import { detectConditionBSlow } from './asianDetection/detectConditionBSlow.js';
import { detectConditionC } from './asianDetection/detectConditionC.js';
import { fetchTodayAsianCandlesLive } from './asianDetection/fetchTodayAsianCandlesLive.js';
import { isValidForAsianSession } from './asianDetection/isValidForAsianSession.js';
import { logAsianSessionDetection } from './asianDetection/logAsianSessionDetection.js';
import type { DetectionResult, M5Candle } from './asianDetection/types.js';

type ConditionLabel = 'C' | 'B_SLOW' | 'B' | 'A';
type ConfidenceTier = 'HIGH' | 'MEDIUM' | 'LOW';

const OANDA_BAR_SETTLE_MS = 45_000;

// Forward validation gates before any execution wiring:
// - Minimum 30 HIGH confidence detections before wiring HIGH = larger size
// - Minimum 30 LOW confidence detections before wiring LOW = skip/reduce
// Not enforced yet — confidence is advisory/logged only.

function computeHourBias(hourUtc: number): 'long' | 'short' | 'neutral' {
  if (hourUtc >= 6) return 'long';
  if (hourUtc === 4) return 'neutral';
  return 'short';
}

function computeConfidenceTier(
  patternDir: 'long' | 'short',
  priorBias: string,
  hourBias: 'long' | 'short' | 'neutral',
): ConfidenceTier {
  const priorConflicts = priorBias !== 'neutral' && priorBias !== patternDir;
  const priorAgrees = priorBias === patternDir;
  const hourAgrees = hourBias === patternDir;

  if (priorConflicts) return 'LOW';
  if (priorAgrees && hourAgrees) return 'HIGH';
  if (priorAgrees || hourAgrees) return 'MEDIUM';
  return 'MEDIUM';
}

function utcTodayDate(): string {
  return new Date().toISOString().slice(0, 10);
}

async function runConditionCheck(
  conditionLabel: ConditionLabel,
  checkTime: string,
  barsNeeded: number,
  detectFn: (candles: M5Candle[]) => DetectionResult,
): Promise<void> {
  const supabase = getSupabaseClient();
  const tradeDate = utcTodayDate();

  const existingDirection = await getBridgeConfigValue(supabase, 'omega_direction');
  const existingValidUntil = await getBridgeConfigValue(supabase, 'omega_direction_valid_until');
  if (isValidForAsianSession(existingValidUntil, tradeDate)) {
    await logAsianSessionDetection(supabase, {
      trade_date: tradeDate,
      condition_check_time: checkTime,
      action: 'ALREADY_SET',
      direction_set: existingDirection,
    });
    return;
  }

  const directionMode = await getBridgeConfigValue(supabase, 'direction_mode');
  if (directionMode === 'manual') {
    await logAsianSessionDetection(supabase, {
      trade_date: tradeDate,
      condition_check_time: checkTime,
      action: 'SKIPPED_MANUAL_MODE',
    });
    return;
  }

  const priorAmdShifted = (await getBridgeConfigValue(supabase, 'asian_prior_amd_shifted')) === 'true';
  const priorAmdTag = await getBridgeConfigValue(supabase, 'asian_prior_amd_tag');
  const sizeMultiplier = priorAmdShifted ? 1.0 : 0.75;

  const priorBias = (await getBridgeConfigValue(supabase, 'asian_prior_direction_bias')) ?? 'neutral';
  const hourUtc = new Date().getUTCHours();
  const hourBias = computeHourBias(hourUtc);

  await new Promise<void>((resolve) => setTimeout(resolve, OANDA_BAR_SETTLE_MS));

  let candles: M5Candle[];
  try {
    candles = await fetchTodayAsianCandlesLive(barsNeeded);
  } catch (fetchErr: unknown) {
    await logAsianSessionDetection(supabase, {
      trade_date: tradeDate,
      condition_check_time: checkTime,
      action: 'NO_DETECTION',
      error_message: String(fetchErr),
      candle_count: 0,
    });
    return;
  }

  if (candles.length < barsNeeded) {
    await logAsianSessionDetection(supabase, {
      trade_date: tradeDate,
      condition_check_time: checkTime,
      action: 'FETCH_INSUFFICIENT_CANDLES',
      error_message: `Insufficient candles: ${candles.length}/${barsNeeded}`,
      candle_count: candles.length,
    });
    return;
  }

  const result = detectFn(candles);
  if (!result.detected || result.direction == null) {
    await logAsianSessionDetection(supabase, {
      trade_date: tradeDate,
      condition_check_time: checkTime,
      condition_fired: null,
      action: 'NO_DETECTION',
      candle_count: candles.length,
    });
    return;
  }

  const sessionExpiry = nextAsianSessionExpiry();
  const patternDir = result.direction;
  const confidenceTier = computeConfidenceTier(patternDir, priorBias, hourBias);

  await setBridgeConfigValues(supabase, {
    omega_direction: result.direction,
    omega_direction_valid_until: sessionExpiry,
    asian_detection_confidence: confidenceTier,
  });

  const action = result.direction === 'long' ? 'SET_LONG' : 'SET_SHORT';
  await logAsianSessionDetection(supabase, {
    trade_date: tradeDate,
    condition_fired: conditionLabel,
    condition_check_time: checkTime,
    detection_bar: result.detection_bar,
    detection_direction: result.direction,
    detection_net_pips: result.net_pips,
    prior_amd_shifted: priorAmdShifted,
    prior_amd_tag: priorAmdTag,
    size_multiplier: sizeMultiplier,
    confidence_tier: confidenceTier,
    prior_direction_bias: priorBias,
    action,
    direction_set: result.direction,
    valid_until: sessionExpiry,
    candle_count: candles.length,
  });

  console.log(
    `[AsianDetection] ${checkTime} UTC — Condition ${conditionLabel} FIRED`,
    `direction=${result.direction}`,
    `confidence=${confidenceTier}`,
    `prior_bias=${priorBias}`,
    `hour_bias=${hourBias}`,
    `prior_shifted=${priorAmdShifted}`,
    `size=${sizeMultiplier}x`,
    `valid_until=${sessionExpiry}`,
  );
}

export async function runConditionCCheck(): Promise<void> {
  await runConditionCheck('C', '01:00', 12, detectConditionC);
}

export async function runConditionBSlowCheck(): Promise<void> {
  await runConditionCheck('B_SLOW', '04:05', 49, detectConditionBSlow);
}

export async function runConditionBCheck(): Promise<void> {
  await runConditionCheck('B', '03:05', 37, detectConditionB);
}

export async function runConditionACheck(): Promise<void> {
  await runConditionCheck('A', '04:10', 50, detectConditionA);
}
