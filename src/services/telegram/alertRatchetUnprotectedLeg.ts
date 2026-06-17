import { sendTelegramMessage, joinLines, DIVIDER, DASHBOARD_URL } from './telegramClient.js';

export type RatchetUnprotectedLegParams = {
  instrument: string;
  direction: string;
  legType: string;
  tradeId: string;
  requestedTakeProfit: string;
  units: number;
};

function formatPair(instrument: string): string {
  return instrument.includes('_') ? instrument.replace('_', '/') : instrument;
}

export async function sendRatchetUnprotectedLegAlert(
  params: RatchetUnprotectedLegParams,
): Promise<void> {
  const {
    instrument,
    direction,
    legType,
    tradeId,
    requestedTakeProfit,
    units,
  } = params;

  const text = joinLines([
    `⚠️ <b>AMD_FAILED Ratchet — UNPROTECTED LEG</b>`,
    DIVIDER,
    `Pair: <b>${formatPair(instrument)}</b> ${direction.toUpperCase()}`,
    `Leg: <b>${legType.toUpperCase()}</b> — ${Math.abs(units).toLocaleString()} units`,
    `Trade ID: <code>${tradeId}</code>`,
    `Requested TP: <code>${requestedTakeProfit}</code> — <b>NOT confirmed on OANDA</b>`,
    DIVIDER,
    `Position is open without a confirmed take-profit. Check OANDA and attach TP or close manually.`,
    `📊 <a href="${DASHBOARD_URL}">View Dashboard</a>`,
  ]);

  await sendTelegramMessage(text);
}
