/** Peak Fade adverse MAE alert — human flatten assist (no auto-close). */

import { sendTelegramMessage, joinLines, DIVIDER, DASHBOARD_URL } from './telegramClient.js';

export type PeakFadeMaeAlertParams = {
  brokerId: string;
  instrument: string;
  direction: string;
  entryPrice: number;
  currentPrice: number;
  adversePips: number;
  thresholdPips: number;
};

export async function sendPeakFadeMaeAlert(
  params: PeakFadeMaeAlertParams,
): Promise<void> {
  const {
    brokerId,
    instrument,
    direction,
    entryPrice,
    currentPrice,
    adversePips,
    thresholdPips,
  } = params;
  const pair = instrument.includes('_') ? instrument.replace('_', '/') : instrument;
  const text = joinLines([
    `⚠ <b>Peak Fade MAE — ${pair}</b>`,
    DIVIDER,
    `Broker:    ${brokerId}`,
    `Direction: ${direction.toUpperCase()}`,
    `Entry: <code>${entryPrice.toFixed(5)}</code>  Now: <code>${currentPrice.toFixed(5)}</code>`,
    `Adverse: <b>${adversePips.toFixed(1)}p</b> (alert ≥ ${thresholdPips}p)`,
    DIVIDER,
    `<i>No SL on ticket — consider manual flatten</i>`,
    `<a href="${DASHBOARD_URL}">Open dashboard</a>`,
  ]);
  await sendTelegramMessage(text);
}
