import { sendTelegramMessage, joinLines, DIVIDER, DASHBOARD_URL } from './telegramClient.js';

export type TradeExecutionAlertParams = {
  oandaInstrument: string;
  direction: string;
  fillPrice: number | null;
  stopLoss: number | null;
  takeProfit: number | null;
  filledUnits: number;
  amdTag: string | null;
  amdSizeMultiplier: number | null;
  directionSource: string;
  engineId: string;
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

function priceField(value: number | null, decimals = 5): string {
  return value != null ? value.toFixed(decimals) : '—';
}

export async function sendTradeExecutedAlert(
  params: TradeExecutionAlertParams,
): Promise<void> {
  const {
    oandaInstrument, direction, fillPrice, stopLoss, takeProfit,
    filledUnits, amdTag, amdSizeMultiplier, directionSource, engineId,
  } = params;

  const pairDisplay = formatPair(oandaInstrument);
  const multiplier = (amdSizeMultiplier ?? 1.0).toFixed(2);
  const amdLine = amdTag != null
    ? `AMD: ${amdTag}  ·  Size: ${multiplier}×`
    : null;

  const text = joinLines([
    `🚀 <b>Trade Executed — ${pairDisplay}</b>`,
    DIVIDER,
    `Direction:  <b>${directionBadge(direction)}</b>`,
    `Engine:     ${engineId}  ·  Source: ${directionSource}`,
    `Entry: <code>${priceField(fillPrice)}</code>  SL: <code>${priceField(stopLoss)}</code>  TP: <code>${priceField(takeProfit)}</code>`,
    `Units:  ${filledUnits}`,
    amdLine ? DIVIDER : null,
    amdLine,
    DIVIDER,
    `📊 <a href="${DASHBOARD_URL}">View Dashboard</a>`,
  ]);

  await sendTelegramMessage(text);
}
