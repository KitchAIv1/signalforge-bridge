import { sendTelegramMessage, joinLines, DIVIDER } from './telegramClient.js';

export type PipThresholdAlertParams = {
  engineId: string;
  instrument: string;
  direction: string;
  entryPrice: number;
  currentPrice: number;
  pips: number;
  threshold: number;
};

function formatPair(instrument: string): string {
  return instrument.includes('_') ? instrument.replace('_', '/') : instrument;
}

export async function sendPipThresholdAlert(
  params: PipThresholdAlertParams,
): Promise<void> {
  const { engineId, instrument, direction, entryPrice, currentPrice, pips, threshold } = params;

  const text = joinLines([
    `⚡ <b>+${threshold}p Threshold — ${formatPair(instrument)}</b>`,
    DIVIDER,
    `Engine:    ${engineId}`,
    `Direction: ${direction.toUpperCase()}`,
    `Entry: <code>${entryPrice.toFixed(5)}</code>  Now: <code>${currentPrice.toFixed(5)}</code>`,
    `Pips:  <b>+${pips.toFixed(1)}p</b>`,
    DIVIDER,
    `<i>Consider manual close via Override Terminal</i>`,
  ]);

  await sendTelegramMessage(text);
}
