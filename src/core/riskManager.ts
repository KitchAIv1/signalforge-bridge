/**
 * Risk manager: five layers. Uses cached account summary; returns first failure.
 */

import type { BridgeConfig } from '../types/config.js';
import type { AccountSummary } from '../connectors/oanda.js';
import { isForexMarketOpen } from '../utils/time.js';

export interface RiskCheckInput {
  config: BridgeConfig;
  cachedAccount: AccountSummary | null;
  signalConfluenceScore: number;
  engineThreshold: number;
  hasStopLoss: boolean;
  riskRewardRatio: number | null;
  engineId: string;
  engineTradesToday: number;
  engineMaxDailyTrades: number;
  globalTradesToday: number;
  openPositionsCount: number;
  openPositionsSamePair: number;
  correlatedOverLimit: boolean;
  isMarketOpen: boolean;
}

export interface RiskCheckResult {
  pass: boolean;
  reason?: string;
}

function layer1PerTrade(input: RiskCheckInput): RiskCheckResult {
  if (!input.hasStopLoss) return { pass: false, reason: 'No stop-loss provided' };
  if (input.riskRewardRatio !== null && input.riskRewardRatio < input.config.minRiskRewardRatio) {
    return { pass: false, reason: `R:R ${input.riskRewardRatio} below min ${input.config.minRiskRewardRatio}` };
  }
  if (input.signalConfluenceScore < input.engineThreshold) {
    return { pass: false, reason: `Confluence score ${input.signalConfluenceScore} below engine threshold ${input.engineThreshold}` };
  }
  return { pass: true };
}

function layer2PerSession(input: RiskCheckInput): RiskCheckResult {
  if (
    input.engineMaxDailyTrades > 0 &&
    input.engineTradesToday >= input.engineMaxDailyTrades
  ) return { pass: false, reason: 'Engine daily trade limit reached' };
  if (input.globalTradesToday >= 24) return { pass: false, reason: 'Global daily trade limit reached' };
  return { pass: true };
}

function layer3Portfolio(input: RiskCheckInput): RiskCheckResult {
  if (
    input.engineId !== 'omega' &&
    input.openPositionsSamePair >= input.config.maxPerPairPositions
  ) {
    return { pass: false, reason: `Max per-pair positions (${input.config.maxPerPairPositions}) reached` };
  }
  if (input.correlatedOverLimit) return { pass: false, reason: 'Correlation cap exceeded' };
  if (!input.cachedAccount) return { pass: false, reason: 'No cached account summary' };
  return { pass: true };
}

function layer5Infrastructure(input: RiskCheckInput): RiskCheckResult {
  if (!input.isMarketOpen) return { pass: false, reason: 'Forex market closed' };
  return { pass: true };
}

export function runRiskChecks(input: RiskCheckInput): RiskCheckResult {
  const layers = [layer1PerTrade, layer2PerSession, layer3Portfolio, layer5Infrastructure];
  for (const layer of layers) {
    const result = layer(input);
    if (!result.pass) return result;
  }
  return { pass: true };
}

export function isMarketOpenForRisk(config: BridgeConfig): boolean {
  return isForexMarketOpen(new Date(), config.weekendCloseBufferMinutes);
}
