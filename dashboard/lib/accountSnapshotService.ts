import type { SupabaseClient } from '@supabase/supabase-js';

export type AccountSnapshot = {
  balance: number;
  equity: number;
  unrealizedPL: number;
  marginUsed: number;
  marginAvailable: number;
  openTradeCount: number;
  checkedAt: string;
};

export async function fetchLatestAccountSnapshot(
  supabase: SupabaseClient
): Promise<AccountSnapshot | null> {
  const { data: healthRow, error } = await supabase
    .from('bridge_health_log')
    .select('details, checked_at')
    .eq('oanda_ok', true)
    .not('details', 'is', null)
    .order('checked_at', { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error || !healthRow?.details || !healthRow.checked_at) return null;
  const d = healthRow.details as Record<string, unknown>;
  const bal = Number(d.balance);
  const eq = Number(d.equity);
  if (!Number.isFinite(bal) || !Number.isFinite(eq)) return null;
  return {
    balance: bal,
    equity: eq,
    unrealizedPL: Number(d.unrealizedPL ?? 0),
    marginUsed: Number(d.marginUsed ?? 0),
    marginAvailable: Number(d.marginAvailable ?? 0),
    openTradeCount: Number(d.openTradeCount ?? 0),
    checkedAt: String(healthRow.checked_at),
  };
}
