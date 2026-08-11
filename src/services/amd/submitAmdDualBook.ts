/**
 * AMD dual-book fan-out — OANDA + VT via Promise.allSettled (AO pattern).
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import { settleBrokerFanOutTasks } from '../../core/alphaOmega/runAoFanOutParallel.js';
import type { AmdDistributionOrderPlan, AmdTradeDirection } from './buildAmdDistributionOrderPlan.js';
import { placeAmdOandaLeg } from './placeAmdOandaLeg.js';
import { placeAmdVtLeg } from './amdVtMirror.js';

export interface SubmitAmdDualBookParams {
  supabase: SupabaseClient;
  tag: string;
  direction: AmdTradeDirection;
  amdRow: Record<string, unknown>;
  plan: AmdDistributionOrderPlan;
  exitStrategy: string;
  todayStr: string;
  timeGateUtcHour: number | null;
}

/** Fire OANDA and VT legs together; one rejection does not unwind the other. */
export async function submitAmdDualBook(params: SubmitAmdDualBookParams): Promise<void> {
  const shared = {
    supabase: params.supabase,
    tag: params.tag,
    direction: params.direction,
    amdRow: params.amdRow,
    plan: params.plan,
    exitStrategy: params.exitStrategy,
    todayStr: params.todayStr,
  };
  await settleBrokerFanOutTasks('AMD dual-book', [
    () =>
      placeAmdOandaLeg({
        ...shared,
        timeGateUtcHour: params.timeGateUtcHour,
      }),
    () => placeAmdVtLeg(shared, params.timeGateUtcHour),
  ]);
}
