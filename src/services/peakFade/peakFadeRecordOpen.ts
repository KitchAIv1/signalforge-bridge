/** Persist open Peak Fade row + Telegram execute alert. */

import type { BrokerClient } from '../../connectors/broker/types.js';
import { sendTradeExecutedAlert } from '../telegram/alertTradeExecution.js';
import { PEAK_FADE_ENGINE_ID } from './peakFadeConstants.js';
import { insertTrade } from './peakFadeDayState.js';
import { peakFadeLog } from './peakFadeLogger.js';
import type { PeakFadeConfig, PeakFadeSetup } from './peakFadeTypes.js';

export type PeakFadeOpenRecord = {
  cfg: PeakFadeConfig;
  setup: PeakFadeSetup;
  broker: BrokerClient;
  brokerId: string;
  tradeDate: string;
  tradeId: string;
  fillPrice: number;
  units: number;
  tpFromFill: number;
};

function notifyPeakFadeOpen(rec: PeakFadeOpenRecord): void {
  void sendTradeExecutedAlert({
    oandaInstrument: rec.broker.toBrokerInstrument(rec.cfg.pair),
    direction: rec.setup.direction.toUpperCase(),
    fillPrice: rec.fillPrice,
    stopLoss: null,
    takeProfit: rec.tpFromFill,
    filledUnits: rec.units,
    amdTag: null,
    amdSizeMultiplier: null,
    directionSource: `peak_fade:${rec.brokerId}`,
    engineId: PEAK_FADE_ENGINE_ID,
  }).catch(() => {});
}

export async function recordPeakFadeOpen(rec: PeakFadeOpenRecord): Promise<void> {
  await insertTrade({
    trade_date: rec.tradeDate,
    pair: rec.cfg.pair,
    broker_id: rec.brokerId,
    broker_trade_id: rec.tradeId,
    units: rec.units,
    direction: rec.setup.direction,
    entry_price: rec.fillPrice,
    tp_price: rec.tpFromFill,
    ref_day_key: rec.setup.refDayKey,
    ref_extreme: rec.setup.refExtreme,
    near_pips: rec.setup.nearPips,
    trend_progress_pips: rec.setup.trendProgressPips,
    opened_at: new Date().toISOString(),
  });
  notifyPeakFadeOpen(rec);
  peakFadeLog('Trade opened', {
    brokerId: rec.brokerId,
    direction: rec.setup.direction,
    units: rec.units,
    tradeId: rec.tradeId,
    fillPrice: rec.fillPrice,
  });
}
