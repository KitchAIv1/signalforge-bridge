/**
 * RegimeStateService
 * Reads the latest regime state row for a pair from Supabase.
 * Used by signalRouter before executing omega signals.
 */
import { createClient } from '@supabase/supabase-js';
import type { RegimeDirection, RegimeConfidence } from './regimeDetector/regimeClassifier.js';

export interface ActiveRegimeState {
  direction:      RegimeDirection;
  confidence:     RegimeConfidence;
  evaluatedAt:    string;
  choppyOverride: boolean;

  layer4_result?:             string | null;
  layer4_bullish_count?:      number | null;
  layer4_bearish_count?:      number | null;
  layer5_result?:             string | null;
  layer5_pip_diff?:           number | null;
  layer6_position_pct?:       number | null;
  layer7_override_active?:    boolean | null;
  layer7_pip_diff?:           number | null;
  choppy_extended_override?:  boolean | null;
}

const CONFIDENCE_SIZE_MULTIPLIER: Record<RegimeConfidence, number> = {
  HIGH:   1.0,  // always full size — proven +$8,028 live
  MEDIUM: 0.3,  // reduced — positive but uncertain
  LOW:    0.15, // minimal — negative overall, small exposure for data
  PAUSE:  0.10, // token — worst condition, data collection only
};

export function getRegimeSizeMultiplier(confidence: RegimeConfidence): number {
  return CONFIDENCE_SIZE_MULTIPLIER[confidence] ?? 0.0;
}

export async function fetchLatestRegimeState(
  pair: string
): Promise<ActiveRegimeState | null> {
  const supabaseUrl = process.env.SUPABASE_URL;
  const supabaseKey =
    process.env.SUPABASE_SERVICE_ROLE_KEY ?? process.env.SUPABASE_SERVICE_KEY;

  if (!supabaseUrl || !supabaseKey) return null;

  const supabase = createClient(supabaseUrl, supabaseKey);

  const { data: regimeRaw, error } = await supabase
    .from('regime_state')
    .select(
      'regime_direction, regime_confidence, evaluated_at, choppy_extended_override, ' +
        'layer4_result, layer4_bullish_count, layer4_bearish_count, ' +
        'layer5_result, layer5_pip_diff, layer6_position_pct, ' +
        'layer7_override_active, layer7_pip_diff'
    )
    .eq('pair', pair)
    .order('evaluated_at', { ascending: false })
    .limit(1)
    .single();

  if (error || !regimeRaw) return null;

  const regimeRow = regimeRaw as unknown as Record<string, unknown>;

  return {
    direction:                regimeRow['regime_direction'] as RegimeDirection,
    confidence:               regimeRow['regime_confidence'] as RegimeConfidence,
    evaluatedAt:              regimeRow['evaluated_at'] as string,
    choppyOverride:          (regimeRow['choppy_extended_override'] ?? false) as boolean,
    layer4_result:           regimeRow['layer4_result'] as string | null ?? null,
    layer4_bullish_count:    regimeRow['layer4_bullish_count'] as number | null ?? null,
    layer4_bearish_count:    regimeRow['layer4_bearish_count'] as number | null ?? null,
    layer5_result:           regimeRow['layer5_result'] as string | null ?? null,
    layer5_pip_diff:          regimeRow['layer5_pip_diff'] as number | null ?? null,
    layer6_position_pct:     regimeRow['layer6_position_pct'] as number | null ?? null,
    layer7_override_active:  regimeRow['layer7_override_active'] as boolean | null ?? null,
    layer7_pip_diff:         regimeRow['layer7_pip_diff'] as number | null ?? null,
    choppy_extended_override: (regimeRow['choppy_extended_override'] ?? null) as boolean | null,
  };
}

/**
 * Reads presence_last_seen from bridge_config and returns
 * minutes since the last dashboard ping.
 * Returns 999 if key missing or fetch fails — treated as away.
 */
export async function fetchMinutesSincePresence(): Promise<number> {
  const supabaseUrl = process.env.SUPABASE_URL;
  const supabaseKey =
    process.env.SUPABASE_SERVICE_ROLE_KEY ?? process.env.SUPABASE_SERVICE_KEY;

  if (!supabaseUrl || !supabaseKey) return 999;

  const supabase = createClient(supabaseUrl, supabaseKey);

  const { data: presenceRow, error } = await supabase
    .from('bridge_config')
    .select('config_value')
    .eq('config_key', 'presence_last_seen')
    .single();

  if (error || !presenceRow?.config_value) return 999;

  const lastSeen = new Date(presenceRow.config_value as string).getTime();
  const minutesSince = (Date.now() - lastSeen) / 60_000;
  return minutesSince;
}
