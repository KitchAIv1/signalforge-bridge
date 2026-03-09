/** Bridge config types. bridge_config.config_value is JSONB — parsed as number, boolean, or string. */

export interface BridgeConfigRaw {
  config_key: string;
  config_value: unknown;
}

export interface BridgeConfig {
  riskPerTradePct: number;
  maxTotalExposurePct: number;
  maxPerPairPositions: number;
  maxCorrelatedExposure: number;
  dailyLossLimitPct: number;
  maxConsecutiveLosses: number;
  cooldownAfterLossesMinutes: number;
  graduatedResponseThreshold: number;
  circuitBreakerDrawdownPct: number;
  deduplicationWindowMs: number;
  conflictResolution: string;
  maxLatencyMs: number;
  defaultRiskReward: number;
  minRiskRewardRatio: number;
  maxOrderTimeoutMs: number;
  staleSignalMaxAgeMs: number;
  tradeMonitorIntervalMs: number;
  maxSpreadMultiplier: number;
  newsBlackoutEnabled: boolean;
  weekendCloseBufferMinutes: number;
  heartbeatIntervalMs: number;
  trailingStopEnabled: boolean;
  partialTpEnabled: boolean;
  killSwitch: boolean;
  bridgeActive: boolean;
  logAllDecisions: boolean;
}

export interface BridgeEngineRow {
  engine_id: string;
  is_active: boolean;
  execution_threshold: number;
  max_hold_hours: number;
  weight: number;
  max_daily_trades: number;
  trades_today: number;
}
