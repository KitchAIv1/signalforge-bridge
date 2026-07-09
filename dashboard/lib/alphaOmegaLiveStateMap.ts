/**
 * Map Supabase alpha_omega_* rows into dashboard live-state snapshots.
 */

export interface AlphaOmegaStreakSnapshot {
  currentStreakDirection: string | null;
  currentStreakLength: number;
  currentStreakStartAt: string | null;
  lastFireAt: string | null;
  armed: boolean;
  armedDirection: string | null;
  updatedAt: string | null;
}

export interface AlphaOmegaOpenPositionSnapshot {
  oandaTradeId: string;
  direction: string;
  entryFiredAt: string;
  entryPrice: number | null;
  opposingFireCount: number;
  totalFireCount: number;
  updatedAt: string | null;
}

export function mapAlphaOmegaStreakRow(
  row: Record<string, unknown> | null,
): AlphaOmegaStreakSnapshot | null {
  if (!row) return null;
  return {
    currentStreakDirection: (row.current_streak_direction as string | null) ?? null,
    currentStreakLength: Number(row.current_streak_length ?? 0),
    currentStreakStartAt: (row.current_streak_start_at as string | null) ?? null,
    lastFireAt: (row.last_fire_at as string | null) ?? null,
    armed: Boolean(row.armed),
    armedDirection: (row.armed_direction as string | null) ?? null,
    updatedAt: (row.updated_at as string | null) ?? null,
  };
}

export function mapAlphaOmegaPositionRow(
  row: Record<string, unknown> | null,
): AlphaOmegaOpenPositionSnapshot | null {
  if (!row) return null;
  return {
    oandaTradeId: String(row.oanda_trade_id),
    direction: String(row.direction),
    entryFiredAt: String(row.entry_fired_at),
    entryPrice: row.entry_price != null ? Number(row.entry_price) : null,
    opposingFireCount: Number(row.opposing_fire_count ?? 0),
    totalFireCount: Number(row.total_fire_count ?? 0),
    updatedAt: (row.updated_at as string | null) ?? null,
  };
}
