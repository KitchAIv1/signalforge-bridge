/**
 * Read-only data assembly for the Combined Stack status card.
 * Five small selects, no writes, no engine behavior — display only.
 */

import { getSupabase } from '@/lib/supabase';
import {
  ALPHAOMEGA_AMD_DAY_GATE_CONFIG_KEY,
  AMD_DEAD_TRADE_ABORT_CONFIG_KEY,
  AMD_TRAIL_SPLIT_CONFIG_KEY,
  parseBridgeConfigBool,
} from '@/lib/combinedStackConfig';
import type { AmdTodaySnapshot, CombinedStackLever } from '@/lib/combinedStackStatusModel';

export const AMD_VT_MIRROR_CONFIG_KEY = 'amd_vt_mirror_enabled';
export const AMD_DAY_GATE_BLOCK_REASON = 'ALPHAOMEGA_AMD_DAY_GATE';
const AMD_VT_BROKER_ID = 'vtmarkets_ao_live';
const PIP_SIZE = 0.0001;

export interface CombinedStackStatusData {
  gateEnabled: boolean;
  levers: CombinedStackLever[];
  amdToday: AmdTodaySnapshot;
  gateBlocksToday: number;
}

function todayUtc(): string {
  return new Date().toISOString().slice(0, 10);
}

function peakPipsFrom(trailRow: Record<string, unknown> | null): number | null {
  if (!trailRow) return null;
  const fillPrice = Number(trailRow.fill_price);
  const peakPrice = Number(trailRow.peak_favorable_price);
  if (!Number.isFinite(fillPrice) || !Number.isFinite(peakPrice)) return null;
  const favorable =
    trailRow.direction === 'long' ? peakPrice - fillPrice : fillPrice - peakPrice;
  return Math.max(0, favorable / PIP_SIZE);
}

export async function fetchCombinedStackStatus(): Promise<CombinedStackStatusData> {
  const supabase = getSupabase();
  const tradeDate = todayUtc();
  const dayStartIso = `${tradeDate}T00:00:00Z`;

  const [configResult, linkResult, amdStateResult, blocksResult, amdLogResult, trailResult] =
    await Promise.all([
      supabase
        .from('bridge_config')
        .select('config_key, config_value')
        .in('config_key', [
          ALPHAOMEGA_AMD_DAY_GATE_CONFIG_KEY,
          AMD_DEAD_TRADE_ABORT_CONFIG_KEY,
          AMD_TRAIL_SPLIT_CONFIG_KEY,
          AMD_VT_MIRROR_CONFIG_KEY,
        ]),
      supabase
        .from('bridge_links')
        .select('is_active')
        .eq('engine_id', 'engine_amd')
        .eq('broker_id', AMD_VT_BROKER_ID)
        .maybeSingle(),
      supabase
        .from('amd_state')
        .select('amd_tag, created_at')
        .eq('trade_date', tradeDate)
        .maybeSingle(),
      supabase
        .from('bridge_trade_log')
        .select('id', { count: 'exact', head: true })
        .eq('block_reason', AMD_DAY_GATE_BLOCK_REASON)
        .gte('created_at', dayStartIso),
      supabase
        .from('bridge_trade_log')
        .select('broker_id, status, pnl_pips')
        .eq('engine_id', 'engine_amd')
        .eq('decision', 'EXECUTED')
        .gte('created_at', dayStartIso),
      supabase
        .from('amd_trail_stop_state')
        .select('fill_price, peak_favorable_price, direction')
        .eq('trade_date', tradeDate)
        .eq('status', 'open')
        .neq('broker_id', AMD_VT_BROKER_ID)
        .maybeSingle(),
    ]);

  const configValueByKey = new Map(
    (configResult.data ?? []).map((row) => [row.config_key as string, row.config_value]),
  );
  const readFlag = (key: string): boolean =>
    parseBridgeConfigBool(configValueByKey.get(key));

  const amdLogRows = amdLogResult.data ?? [];
  const oandaRow = amdLogRows.find((row) => row.broker_id !== AMD_VT_BROKER_ID) ?? null;
  const vtRow = amdLogRows.find((row) => row.broker_id === AMD_VT_BROKER_ID) ?? null;

  return {
    gateEnabled: readFlag(ALPHAOMEGA_AMD_DAY_GATE_CONFIG_KEY),
    levers: [
      { label: 'GATE', enabled: readFlag(ALPHAOMEGA_AMD_DAY_GATE_CONFIG_KEY) },
      { label: 'ABORT', enabled: readFlag(AMD_DEAD_TRADE_ABORT_CONFIG_KEY) },
      { label: 'TRAIL 6/4', enabled: readFlag(AMD_TRAIL_SPLIT_CONFIG_KEY) },
    ],
    amdToday: {
      tag: (amdStateResult.data?.amd_tag as string | null) ?? null,
      tagWrittenAtIso: (amdStateResult.data?.created_at as string | null) ?? null,
      oandaStatus:
        oandaRow == null ? 'none' : oandaRow.status === 'closed' ? 'closed' : 'open',
      oandaPeakPips: peakPipsFrom(trailResult.data as Record<string, unknown> | null),
      oandaClosedPips: oandaRow?.pnl_pips != null ? Number(oandaRow.pnl_pips) : null,
      vtFilled: vtRow != null,
      vtArmed:
        readFlag(AMD_VT_MIRROR_CONFIG_KEY) && (linkResult.data?.is_active ?? false),
    },
    gateBlocksToday: blocksResult.count ?? 0,
  };
}
