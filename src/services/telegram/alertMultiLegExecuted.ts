import { sendTelegramMessage, joinLines, DIVIDER, DASHBOARD_URL } from './telegramClient.js';

export type MultiLegExecutedParams = {
  instrument: string;
  direction: string;
  legs: Array<{ legType: string; units: number; fillPrice: number; takeProfitPrice: string | null }>;
  engineLabel?: string;
  trailMarkerLabel?: string;
};

function formatPair(instrument: string): string {
  return instrument.includes('_') ? instrument.replace('_', '/') : instrument;
}

function directionBadge(direction: string): string {
  const d = direction.toUpperCase();
  if (d === 'LONG' || d === 'BUY') return '🟢 ↑ LONG';
  if (d === 'SHORT' || d === 'SELL') return '🔴 ↓ SHORT';
  return d;
}

export async function sendMultiLegExecutedAlert(
  params: MultiLegExecutedParams,
): Promise<void> {
  const {
    instrument,
    direction,
    legs,
    engineLabel = 'Ratchet',
    trailMarkerLabel = '10p marker',
  } = params;

  const legLines = legs.map((leg) => {
    const tpLabel = leg.takeProfitPrice
      ? `TP <code>${leg.takeProfitPrice}</code>`
      : `Trail (${trailMarkerLabel})`;
    return `${leg.legType.toUpperCase()}: ${Math.abs(leg.units).toLocaleString()} units — ${tpLabel}`;
  });

  const text = joinLines([
    `🚀 <b>${engineLabel} Trade Executed — ${formatPair(instrument)}</b>`,
    DIVIDER,
    `Direction: <b>${directionBadge(direction)}</b>`,
    ...legLines,
    DIVIDER,
    `📊 <a href="${DASHBOARD_URL}">View Dashboard</a>`,
  ]);

  await sendTelegramMessage(text);
}
