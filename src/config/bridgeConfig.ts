/**
 * Load bridge config from env + Supabase bridge_config table.
 * config_value is JSONB: parse as number, boolean, or string.
 */

import type { BridgeConfig, BridgeConfigRaw, BridgeEngineRow } from '../types/config.js';
import type { SupabaseClient } from '@supabase/supabase-js';

const CONFIG_KEYS: (keyof BridgeConfig)[] = [
  'riskPerTradePct', 'maxTotalExposurePct', 'maxPerPairPositions', 'maxCorrelatedExposure',
  'dailyLossLimitPct', 'maxConsecutiveLosses', 'cooldownAfterLossesMinutes', 'graduatedResponseThreshold',
  'circuitBreakerDrawdownPct', 'deduplicationWindowMs', 'conflictResolution', 'maxLatencyMs',
  'defaultRiskReward', 'minRiskRewardRatio', 'maxOrderTimeoutMs', 'staleSignalMaxAgeMs', 'tradeMonitorIntervalMs',
  'maxSpreadMultiplier', 'newsBlackoutEnabled', 'weekendCloseBufferMinutes', 'heartbeatIntervalMs',
  'trailingStopEnabled', 'partialTpEnabled', 'killSwitch', 'bridgeActive', 'logAllDecisions',
];

const KEY_TO_DB: Record<string, string> = {
  riskPerTradePct: 'risk_per_trade_pct',
  maxTotalExposurePct: 'max_total_exposure_pct',
  maxPerPairPositions: 'max_per_pair_positions',
  maxCorrelatedExposure: 'max_correlated_exposure',
  dailyLossLimitPct: 'daily_loss_limit_pct',
  maxConsecutiveLosses: 'max_consecutive_losses',
  cooldownAfterLossesMinutes: 'cooldown_after_losses_minutes',
  graduatedResponseThreshold: 'graduated_response_threshold',
  circuitBreakerDrawdownPct: 'circuit_breaker_drawdown_pct',
  deduplicationWindowMs: 'deduplication_window_ms',
  conflictResolution: 'conflict_resolution',
  maxLatencyMs: 'max_latency_ms',
  defaultRiskReward: 'default_risk_reward',
  minRiskRewardRatio: 'min_risk_reward_ratio',
  maxOrderTimeoutMs: 'max_order_timeout_ms',
  staleSignalMaxAgeMs: 'stale_signal_max_age_ms',
  tradeMonitorIntervalMs: 'trade_monitor_interval_ms',
  maxSpreadMultiplier: 'max_spread_multiplier',
  newsBlackoutEnabled: 'news_blackout_enabled',
  weekendCloseBufferMinutes: 'weekend_close_buffer_minutes',
  heartbeatIntervalMs: 'heartbeat_interval_ms',
  trailingStopEnabled: 'trailing_stop_enabled',
  partialTpEnabled: 'partial_tp_enabled',
  killSwitch: 'kill_switch',
  bridgeActive: 'bridge_active',
  logAllDecisions: 'log_all_decisions',
};

function parseConfigValue(val: unknown): number | boolean | string {
  if (typeof val === 'number' || typeof val === 'boolean' || typeof val === 'string') return val;
  if (val === null || val === undefined) return '';
  return String(val);
}

function mapRowToConfig(rows: BridgeConfigRaw[]): BridgeConfig {
  const byKey: Record<string, number | boolean | string> = {};
  for (const row of rows) {
    const key = row.config_key;
    const v = parseConfigValue(row.config_value);
    if (key === 'risk_per_trade_pct') byKey.riskPerTradePct = Number(v);
    else if (key === 'max_total_exposure_pct') byKey.maxTotalExposurePct = Number(v);
    else if (key === 'max_per_pair_positions') byKey.maxPerPairPositions = Number(v);
    else if (key === 'max_correlated_exposure') byKey.maxCorrelatedExposure = Number(v);
    else if (key === 'daily_loss_limit_pct') byKey.dailyLossLimitPct = Number(v);
    else if (key === 'max_consecutive_losses') byKey.maxConsecutiveLosses = Number(v);
    else if (key === 'cooldown_after_losses_minutes') byKey.cooldownAfterLossesMinutes = Number(v);
    else if (key === 'graduated_response_threshold') byKey.graduatedResponseThreshold = Number(v);
    else if (key === 'circuit_breaker_drawdown_pct') byKey.circuitBreakerDrawdownPct = Number(v);
    else if (key === 'deduplication_window_ms') byKey.deduplicationWindowMs = Number(v);
    else if (key === 'conflict_resolution') byKey.conflictResolution = String(v);
    else if (key === 'max_latency_ms') byKey.maxLatencyMs = Number(v);
    else if (key === 'default_risk_reward') byKey.defaultRiskReward = Number(v);
    else if (key === 'min_risk_reward_ratio') byKey.minRiskRewardRatio = Number(v);
    else if (key === 'max_order_timeout_ms') byKey.maxOrderTimeoutMs = Number(v);
    else if (key === 'stale_signal_max_age_ms') byKey.staleSignalMaxAgeMs = Number(v);
    else if (key === 'trade_monitor_interval_ms') byKey.tradeMonitorIntervalMs = Number(v);
    else if (key === 'max_spread_multiplier') byKey.maxSpreadMultiplier = Number(v);
    else if (key === 'news_blackout_enabled') byKey.newsBlackoutEnabled = v === true || v === 'true';
    else if (key === 'weekend_close_buffer_minutes') byKey.weekendCloseBufferMinutes = Number(v);
    else if (key === 'heartbeat_interval_ms') byKey.heartbeatIntervalMs = Number(v);
    else if (key === 'trailing_stop_enabled') byKey.trailingStopEnabled = v === true || v === 'true';
    else if (key === 'partial_tp_enabled') byKey.partialTpEnabled = v === true || v === 'true';
    else if (key === 'kill_switch') byKey.killSwitch = v === true || v === 'true';
    else if (key === 'bridge_active') byKey.bridgeActive = v === true || v === 'true';
    else if (key === 'log_all_decisions') byKey.logAllDecisions = v === true || v === 'true';
  }
  const d = (n: number, def: number) => (typeof n === 'number' && !Number.isNaN(n) ? n : def);
  const b = (x: boolean | undefined, def: boolean) => (typeof x === 'boolean' ? x : def);
  return {
    riskPerTradePct: d(byKey.riskPerTradePct as number, 0.02),
    maxTotalExposurePct: d(byKey.maxTotalExposurePct as number, 0.06),
    maxPerPairPositions: d(byKey.maxPerPairPositions as number, 2),
    maxCorrelatedExposure: d(byKey.maxCorrelatedExposure as number, 2),
    dailyLossLimitPct: d(byKey.dailyLossLimitPct as number, 0.05),
    maxConsecutiveLosses: d(byKey.maxConsecutiveLosses as number, 5),
    cooldownAfterLossesMinutes: d(byKey.cooldownAfterLossesMinutes as number, 240),
    graduatedResponseThreshold: d(byKey.graduatedResponseThreshold as number, 3),
    circuitBreakerDrawdownPct: d(byKey.circuitBreakerDrawdownPct as number, 0.10),
    deduplicationWindowMs: d(byKey.deduplicationWindowMs as number, 30000),
    conflictResolution: (byKey.conflictResolution as string) ?? 'highest_score',
    maxLatencyMs: d(byKey.maxLatencyMs as number, 500),
    defaultRiskReward: d(byKey.defaultRiskReward as number, 1.5),
    minRiskRewardRatio: d(byKey.minRiskRewardRatio as number, 0.5),
    maxOrderTimeoutMs: d(byKey.maxOrderTimeoutMs as number, 10000),
    staleSignalMaxAgeMs: d(byKey.staleSignalMaxAgeMs as number, 60000),
    tradeMonitorIntervalMs: d(byKey.tradeMonitorIntervalMs as number, 30000),
    maxSpreadMultiplier: d(byKey.maxSpreadMultiplier as number, 2),
    newsBlackoutEnabled: b(byKey.newsBlackoutEnabled as boolean, true),
    weekendCloseBufferMinutes: d(byKey.weekendCloseBufferMinutes as number, 30),
    heartbeatIntervalMs: d(byKey.heartbeatIntervalMs as number, 30000),
    trailingStopEnabled: b(byKey.trailingStopEnabled as boolean, false),
    partialTpEnabled: b(byKey.partialTpEnabled as boolean, false),
    killSwitch: b(byKey.killSwitch as boolean, false),
    bridgeActive: b(byKey.bridgeActive as boolean, true),
    logAllDecisions: b(byKey.logAllDecisions as boolean, true),
  };
}

export async function loadBridgeConfig(supabase: SupabaseClient): Promise<BridgeConfig> {
  const { data: rows, error } = await supabase.from('bridge_config').select('config_key, config_value');
  if (error) throw new Error(`Failed to load bridge_config: ${error.message}`);
  return mapRowToConfig((rows ?? []) as BridgeConfigRaw[]);
}

export async function loadActiveEngines(supabase: SupabaseClient): Promise<BridgeEngineRow[]> {
  const { data, error } = await supabase
    .from('bridge_engines')
    .select('engine_id, is_active, execution_threshold, max_hold_hours, weight, max_daily_trades, trades_today')
    .eq('is_active', true);
  if (error) throw new Error(`Failed to load bridge_engines: ${error.message}`);
  return (data ?? []) as BridgeEngineRow[];
}
