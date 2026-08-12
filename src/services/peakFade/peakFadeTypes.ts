/** Peak Fade — types + config loader. */

import {
  PEAK_FADE_DEFAULT_RISK_PCT,
  PEAK_FADE_DEFAULT_WEIGHT,
  PEAK_FADE_MIN_TREND_PROGRESS_PIPS,
  PEAK_FADE_NEAR_EXTREME_PIPS,
  PEAK_FADE_NEWS_POST_HOURS,
  PEAK_FADE_NEWS_PRE_HOURS,
  PEAK_FADE_PAIR,
  PEAK_FADE_RISK_REF_PIPS,
  PEAK_FADE_TARGET_PIPS,
  PEAK_FADE_TREND_BARS,
} from './peakFadeConstants.js';

export type PeakFadeDirection = 'long' | 'short';
export type PeakFadeResult = 'win' | 'loss' | 'force_close' | 'external_close';

export interface PeakFadeConfig {
  pair: string;
  nearExtremePips: number;
  trendBars: number;
  minTrendProgressPips: number;
  targetPips: number;
  riskRefPips: number;
  riskPct: number;
  engineWeight: number;
  newsPreHours: number;
  newsPostHours: number;
  oandaAccountId: string | undefined;
}

export interface PeakFadeTrade {
  id: number;
  trade_date: string;
  pair: string;
  broker_id: string | null;
  broker_trade_id: string | null;
  units: number | null;
  direction: PeakFadeDirection;
  entry_price: number;
  tp_price: number;
  ref_day_key: string | null;
  ref_extreme: number | null;
  near_pips: number | null;
  trend_progress_pips: number | null;
  exit_price: number | null;
  pnl_pips: number | null;
  pnl_pips_actual: number | null;
  result: PeakFadeResult | null;
  opened_at: string | null;
  closed_at: string | null;
  close_reason: string | null;
  created_at: string;
}

export interface PeakFadeSetup {
  direction: PeakFadeDirection;
  entry: number;
  tp: number;
  refDayKey: string;
  refExtreme: number;
  nearPips: number;
  trendProgressPips: number;
}

export function loadPeakFadeConfig(): PeakFadeConfig {
  return {
    pair: process.env.PEAK_FADE_PAIR ?? PEAK_FADE_PAIR,
    nearExtremePips: Number(
      process.env.PEAK_FADE_NEAR_PIPS ?? PEAK_FADE_NEAR_EXTREME_PIPS,
    ),
    trendBars: Number(process.env.PEAK_FADE_TREND_BARS ?? PEAK_FADE_TREND_BARS),
    minTrendProgressPips: Number(
      process.env.PEAK_FADE_MIN_TREND_PIPS ?? PEAK_FADE_MIN_TREND_PROGRESS_PIPS,
    ),
    targetPips: Number(process.env.PEAK_FADE_TARGET_PIPS ?? PEAK_FADE_TARGET_PIPS),
    riskRefPips: Number(
      process.env.PEAK_FADE_RISK_REF_PIPS ?? PEAK_FADE_RISK_REF_PIPS,
    ),
    riskPct: Number(process.env.PEAK_FADE_RISK_PCT ?? PEAK_FADE_DEFAULT_RISK_PCT),
    engineWeight: Number(
      process.env.PEAK_FADE_WEIGHT ?? PEAK_FADE_DEFAULT_WEIGHT,
    ),
    newsPreHours: Number(
      process.env.PEAK_FADE_NEWS_PRE_HOURS ?? PEAK_FADE_NEWS_PRE_HOURS,
    ),
    newsPostHours: Number(
      process.env.PEAK_FADE_NEWS_POST_HOURS ?? PEAK_FADE_NEWS_POST_HOURS,
    ),
    oandaAccountId: process.env.PEAK_FADE_OANDA_ACCOUNT_ID || undefined,
  };
}

export function todayUtcString(): string {
  return new Date().toISOString().slice(0, 10);
}

export function pipsToPrice(pips: number): number {
  return pips * 0.0001;
}

export function priceToPips(delta: number): number {
  return delta / 0.0001;
}

export function signedPips(
  entry: number,
  exit: number,
  direction: PeakFadeDirection,
): number {
  return direction === 'long'
    ? priceToPips(exit - entry)
    : priceToPips(entry - exit);
}
