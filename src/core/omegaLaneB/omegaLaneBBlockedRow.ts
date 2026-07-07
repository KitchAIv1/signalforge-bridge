import type { SupabaseClient } from '@supabase/supabase-js';
import type { SignalInsertPayload } from '../../connectors/supabase.js';
import type { ActiveAmdState } from '../../services/amdDetector/amdStateService.js';
import type { ActiveRegimeState } from '../../services/RegimeStateService.js';
import { logInfo } from '../../utils/logger.js';
import { OMEGA_LANE_B_BROKER_ID } from './omegaLaneBConstants.js';

type TradeLogBuilder = (
  payload: SignalInsertPayload,
  decision: 'BLOCKED',
  blockReason: string | null,
  decisionLatencyMs: number,
  equity: number | null,
  openTradeCount: number,
  instrument: string,
  direction?: string,
) => Record<string, unknown>;

type AuditAttacher = (
  row: Record<string, unknown>,
  regimeState: ActiveRegimeState | null,
  regimeSizeMultiplier: number,
  amdState: ActiveAmdState | null,
  directionMode: string,
) => void;

export interface LaneBBlockedRowParams {
  supabase: SupabaseClient;
  payload: SignalInsertPayload;
  signalId: string;
  brokerId: string;
  blockReason: string;
  decisionLatencyMs: number;
  routeEquity: number | null;
  openTradeCount: number;
  instrument: string;
  direction: string;
  regimeState: ActiveRegimeState | null;
  regimeSizeMultiplier: number;
  amdState: ActiveAmdState | null;
  directionMode: string;
  buildTradeLogRow: TradeLogBuilder;
  attachOmegaAuditFields: AuditAttacher;
  shadowAdvisory?: string | null;
}

export async function insertLaneBBlockedRow(params: LaneBBlockedRowParams): Promise<void> {
  const row = params.buildTradeLogRow(
    params.payload,
    'BLOCKED',
    params.blockReason,
    params.decisionLatencyMs,
    params.routeEquity,
    params.openTradeCount,
    params.instrument,
    params.direction,
  ) as Record<string, unknown>;

  row.broker_id = params.brokerId;
  row.status = 'pending';
  if (params.shadowAdvisory) {
    row.lane_advisory = params.shadowAdvisory;
  }

  params.attachOmegaAuditFields(
    row,
    params.regimeState,
    params.regimeSizeMultiplier,
    params.amdState,
    params.directionMode,
  );

  const { error } = await params.supabase.from('bridge_trade_log').insert(row);
  if (error) {
    logInfo('[Omega LaneB] Failed to insert BLOCKED row', {
      brokerId: params.brokerId,
      signalId: params.signalId,
      error: error.message,
    });
    return;
  }

  logInfo('[Omega LaneB] Entry blocked for experiment broker', {
    brokerId: params.brokerId,
    signalId: params.signalId,
    reason: params.blockReason,
  });
}

export function defaultLaneBBrokerId(): string {
  return OMEGA_LANE_B_BROKER_ID;
}
