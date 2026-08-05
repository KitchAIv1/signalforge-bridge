/**
 * Builds a sized AMD distribution market-order plan.
 * Applies amd_size_multiplier via effective engine weight.
 */
import { getAccountSummary, getPricing } from '../../connectors/oanda.js';
import { getSupabaseClient } from '../../connectors/supabase.js';
import { calculateUnits } from '../../core/positionSizer.js';
import { logError, logInfo } from '../../utils/logger.js';
import { loadAmdHardSlPips } from './loadAmdHardSlPips.js';
import { resolveAmdOandaAccountId } from './resolveAmdOandaAccountId.js';
import { amdEffectiveEngineWeight } from './resolveAmdSizeMultiplier.js';

const INSTRUMENT = 'AUD_USD';
const BASELINE_RISK_PCT = 0.02;

export type AmdTradeDirection = 'long' | 'short';

export type AmdDistributionOrderPlan = {
  entryPrice: number;
  hardSlPrice: number;
  /** SL distance (pips) actually used for this plan — broker SL + sizing. */
  hardSlPips: number;
  signedUnits: number;
  exitStrategy: string;
  equity: number;
  weight: number;
  sizeMultiplier: number;
};

export async function buildAmdDistributionOrderPlan(
  direction: AmdTradeDirection,
  weight: number,
  sizeMultiplier: number,
): Promise<AmdDistributionOrderPlan | null> {
  const amdAccountId = resolveAmdOandaAccountId();
  const account = await getAccountSummary(amdAccountId);
  const pricing = await getPricing(INSTRUMENT, amdAccountId);
  if (!pricing.length) {
    logError('[AmdDistribution] getPricing returned empty');
    return null;
  }
  const askPrice = parseFloat(pricing[0].ask);
  const bidPrice = parseFloat(pricing[0].bid);
  const entryPrice = direction === 'long' ? askPrice : bidPrice;
  const hardSlPips = await loadAmdHardSlPips(getSupabaseClient());
  const slDistance = hardSlPips * 0.0001;
  const hardSlPrice =
    direction === 'long' ? entryPrice - slDistance : entryPrice + slDistance;
  const effectiveWeight = amdEffectiveEngineWeight(weight, sizeMultiplier);
  const units = calculateUnits({
    equity: account.equity,
    engineWeight: effectiveWeight,
    riskPct: BASELINE_RISK_PCT,
    entry: entryPrice,
    stopLoss: hardSlPrice,
    instrument: INSTRUMENT,
    consecutiveLosses: 0,
    graduatedThreshold: 999,
    confluenceScore: 75,
    slPipsOverride: hardSlPips,
  });
  logInfo('[AmdDistribution] Sized units', {
    engineWeight: weight,
    sizeMultiplier,
    effectiveWeight,
    hardSlPips,
    units,
  });
  return {
    entryPrice,
    hardSlPrice,
    hardSlPips,
    signedUnits: direction === 'long' ? units : -units,
    exitStrategy: 'S0',
    equity: account.equity,
    weight,
    sizeMultiplier,
  };
}
