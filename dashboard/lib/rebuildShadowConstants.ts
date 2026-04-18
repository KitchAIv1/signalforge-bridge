export const REBUILD_REFRESH_MS = 15_000;

// ── Filter constants (derived from April 13-17 analysis) ──
// Block hours where avg P&L R is structurally negative
export const REBUILD_BLOCKED_HOURS_UTC = [7, 9, 14, 15, 19] as const;
// Block medium R bucket — noise band for GBPUSD
export const REBUILD_FILTERED_R_MIN_PIPS = 7;   // exclusive lower bound
export const REBUILD_FILTERED_R_MAX_PIPS = 10;  // exclusive upper bound
// A signal is filtered OUT if: hour in BLOCKED_HOURS
//   OR r_size_pips in (7, 10) exclusive
//   OR during_news_event IS NOT NULL

// ── Phase 4 gates — FILTERED signals only ──
// Updated from analysis of 74 filtered signals, week of Apr 13-17
export const REBUILD_FILTERED_MIN_SIGNALS = 150;   // gate 1 — need OOS validation at this n
export const REBUILD_GATE_FILTERED_TP    = 0.35;   // gate 2 — 35% filtered TP rate sustained
export const REBUILD_GATE_FILTERED_PNL_R = 0.20;   // gate 3 — avg P&L R ≥ 0.20R
export const REBUILD_FILTERED_SESSION_TP_FLOOR = 0.25; // gate 5 — no session below 25% TP
export const REBUILD_FILTERED_SESSION_MIN_N    = 20;   // gate 5 — only fires when n ≥ 20

// ── Legacy unfiltered constants (kept for stats bar "All" column) ──
export const REBUILD_MIN_RESOLVED_GATES   = 100;  // unfiltered signal count reference
export const REBUILD_SESSION_ORDER = ['Asian', 'London', 'NY', 'overlap'] as const;

// Chart reference line
export const REBUILD_CHART_TARGET_RATE = 0.35;  // updated from 0.60 — filtered gate target
