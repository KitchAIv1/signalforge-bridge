// Intelligence page types — all data shapes for monitoring + snapshots

export interface TimeGateRow {
  amd_tag: string;
  utc_hour: number;
  n_trades: number;
  avg_pnl_r: number;
  win_rate_pct: number;
  in_optimal_window: boolean;
}

export interface AmdPerformanceRow {
  amd_tag: string;
  n_trades: number;
  avg_pnl_r: number;
  win_rate_pct: number;
  avg_size_multiplier: number;
}

export interface DirectionSourceRow {
  direction_source: string;
  n_trades: number;
  avg_pnl_r: number;
  win_rate_pct: number;
}

export interface AccumulationRow {
  range_bucket: string;
  asian_is_flat: boolean | null;
  amd_tag: string;
  n: number;
}

export interface ObsThreshold {
  id: string;
  label: string;
  hypothesis: string;
  current_n: number;
  threshold_n: number;
  status: 'WATCHING' | 'APPROACHING' | 'READY_TO_ACT';
  action_when_ready: string;
}

export interface IntelligenceData {
  // System health
  last_amd_evaluated_at: string | null;
  direction_mode: string | null;
  omega_direction: string | null;
  today_amd_tag: string | null;
  today_auto_direction: string | null;
  today_size_multiplier: number | null;
  total_amd_tagged_trades: number;

  // Time gate monitoring
  time_gate_rows: TimeGateRow[];

  // AMD performance
  amd_performance: AmdPerformanceRow[];

  // Direction source
  direction_source: DirectionSourceRow[];

  // Accumulation monitoring
  accumulation_rows: AccumulationRow[];

  // OBS thresholds
  obs_thresholds: ObsThreshold[];

  // Last snapshot for comparison
  last_snapshot: IntelligenceSnapshot | null;
}

export interface IntelligenceSnapshot {
  id: string;
  snapshot_date: string;
  snapshot_type: 'weekly_auto' | 'manual';
  obs_001_asian_range_n: number | null;
  obs_001_transition_zone_n: number | null;
  obs_002_time_gate_n_per_tag: Record<string, number> | null;
  obs_003_exit_degradation_n_per_tag: Record<string, number> | null;
  obs_004_shifted_strong_judas_n: number | null;
  time_gate_summary: Record<string, unknown> | null;
  accumulation_summary: Record<string, unknown> | null;
  amd_performance: Record<string, unknown> | null;
  direction_source_summary: Record<string, unknown> | null;
  claude_evaluation: string | null;
  claude_flags: Record<string, string> | null;
  claude_weekly_summary: string | null;
  trades_analyzed: number | null;
  amd_days_analyzed: number | null;
  created_at: string;
}

export interface ClaudeEvalRequest {
  current_data: IntelligenceData;
  previous_snapshot: IntelligenceSnapshot | null;
  snapshot_date: string;
}

export interface ClaudeEvalResponse {
  weekly_summary: string;
  obs_flags: Record<string, 'WATCHING' | 'APPROACHING' | 'READY_TO_ACT' | 'ACTION_REQUIRED'>;
  time_gate_finding: string;
  accumulation_finding: string;
  performance_finding: string;
  recommended_actions: string[];
  overall_status: 'ALL_GOOD' | 'NEEDS_ATTENTION' | 'ACTION_REQUIRED';
}
