/**
 * Builds a sized AMD distribution market-order plan.
 * Applies amd_size_multiplier via effective engine weight.
 */
import { getAccountSummary, getPricing } from '../../connectors/oanda.js';
import { calculateUnits } from '../../core/positionSizer.js';
import { logError, logInfo } from '../../utils/logger.js';
import { AMD_HARD_SL_PIPS } from './amdTrailConstants.js';
import { resolveAmdOandaAccountId } from './resolveAmdOandaAccountId.js';
import { amdEffectiveEngineWeight } from './resolveAmdSizeMultiplier.js';

const INSTRUMENT = 'AUD_USD';
const BASELINE_RISK_PCT = 0.02;

export type AmdTradeDirection = 'long' | 'short';

export type AmdDistributionOrderPlan = {
  entryPrice: number;
  hardSlPrice: number;
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
  const slDistance = AMD_HARD_SL_PIPS * 0.0001;
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
    slPipsOverride: AMD_HARD_SL_PIPS,
  });
  logInfo('[AmdDistribution] Sized units', {
    engineWeight: weight,
    sizeMultiplier,
    effectiveWeight,
    units,
  });
  return {
    entryPrice,
    hardSlPrice,
    signedUnits: direction === 'long' ? units : -units,
    exitStrategy: 'S0',
    equity: account.equity,
    weight,
    sizeMultiplier,
  };
}
