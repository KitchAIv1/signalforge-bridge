/**
 * Persist SPEEDFLOOR paper close onto existing BLOCKED rows.
 * Never writes updated_at (column absent). Never touches EXECUTED / ao_shadow_paper.
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import { logInfo, logWarn } from '../../../utils/logger.js';
import { OMEGA_AO_BROKER_IDS, PIP_SIZE } from '../alphaOmegaConstants.js';
import type { AlphaOmegaDirection } from '../alphaOmegaStreakTracker.js';
import { isOpenSpeedfloorPaperRow } from './speedfloorPaperIdentity.js';
import {
  speedfloorPaperCloseReason,
  type SpeedfloorPaperTrigger,
} from './speedfloorPaperCloseReasons.js';
import { signedSpeedfloorPaperPips } from './speedfloorPaperWalk.js';

const ENGINE_WEIGHT = 0.25;
const RISK_PCT = 0.03;
const MAX_ABS_UNITS = 3_000_000;
const ASIAN_WEIGHT = 0.1;

export interface SpeedfloorPaperCloseParams {
  signalId: string;
  direction: AlphaOmegaDirection;
  entryPrice: number;
  entryAt: string;
  stopLoss: number | null;
  equity: number | null;
  trigger: SpeedfloorPaperTrigger;
  exitAt: string;
  exitPrice: number;
}

interface CloseCandidateRow {
  id: string;
  broker_id: string | null;
  decision: string | null;
  block_reason: string | null;
  lane_advisory: string | null;
  status: string | null;
  pnl_pips: number | null;
}

function paperUnits(
  equity: number | null,
  entry: number,
  stopLoss: number | null,
  entryAt: string,
): number | null {
  if (equity == null || !(equity > 0) || stopLoss == null) return null;
  const slPips = Math.abs(entry - stopLoss) / PIP_SIZE;
  if (!(slPips > 0)) return null;
  let units = Math.floor((equity * ENGINE_WEIGHT * RISK_PCT) / (slPips * PIP_SIZE));
  if (units > MAX_ABS_UNITS) units = MAX_ABS_UNITS;
  const hour = new Date(entryAt).getUTCHours();
  if (hour >= 21 || hour < 8) {
    units = Math.max(1, Math.round(units * (ASIAN_WEIGHT / ENGINE_WEIGHT)));
  }
  return units;
}

async function loadOpenIdsForSignal(
  supabase: SupabaseClient,
  signalId: string,
): Promise<string[]> {
  const { data, error } = await supabase
    .from('bridge_trade_log')
    .select('id,broker_id,decision,block_reason,lane_advisory,status,pnl_pips')
    .eq('engine_id', 'omega')
    .eq('decision', 'BLOCKED')
    .eq('signal_id', signalId)
    .in('broker_id', [...OMEGA_AO_BROKER_IDS])
    .is('pnl_pips', null)
    .neq('status', 'closed');
  if (error || !data) {
    logWarn('[SpeedfloorPaper] close candidate load failed', {
      signalId,
      error: error?.message,
    });
    return [];
  }
  const rows = data as unknown as CloseCandidateRow[];
  return rows.filter((row) => isOpenSpeedfloorPaperRow(row)).map((row) => row.id);
}

/** Close all open SPEEDFLOOR BLOCKED rows for this signal_id on AO brokers. */
export async function persistSpeedfloorPaperClose(
  supabase: SupabaseClient,
  params: SpeedfloorPaperCloseParams,
): Promise<number> {
  const rowIds = await loadOpenIdsForSignal(supabase, params.signalId);
  if (rowIds.length === 0) return 0;

  const pnlPips = signedSpeedfloorPaperPips(
    params.direction,
    params.entryPrice,
    params.exitPrice,
  );
  const units = paperUnits(
    params.equity,
    params.entryPrice,
    params.stopLoss,
    params.entryAt,
  );
  const pnlDollars =
    units != null ? Math.round(pnlPips * units * PIP_SIZE * 100) / 100 : null;
  const holdMinutes = Math.round(
    (Date.parse(params.exitAt) - Date.parse(params.entryAt)) / 60_000,
  );
  const closeReason = speedfloorPaperCloseReason(params.trigger);

  const { data, error } = await supabase
    .from('bridge_trade_log')
    .update({
      status: 'closed',
      closed_at: params.exitAt,
      close_reason: closeReason,
      exit_price: params.exitPrice,
      pnl_pips: pnlPips,
      pnl_dollars: pnlDollars,
      duration_minutes: holdMinutes,
    })
    .in('id', rowIds)
    .is('pnl_pips', null)
    .neq('status', 'closed')
    .select('id,broker_id');

  if (error) {
    logWarn('[SpeedfloorPaper] close update failed', {
      signalId: params.signalId,
      error: error.message,
    });
    return 0;
  }

  const n = data?.length ?? 0;
  if (n > 0) {
    logInfo('[SpeedfloorPaper] paper closed', {
      signalId: params.signalId,
      trigger: params.trigger,
      pnlPips,
      rows: n,
    });
  }
  return n;
}
