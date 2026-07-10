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
  /** e.g. ALPHAOMEGA — shown when set so Lane B is distinct from Lane A */
  laneLabel?: string | null;
  /** Optional founding hint for ALPHAOMEGA crack entries */
  foundingHint?: string | null;
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

function engineLine(engineId: string, directionSource: string, laneLabel?: string | null): string {
  if (laneLabel) {
    return `Engine:     ${engineId}  ·  Lane: <b>${laneLabel}</b>  ·  Source: ${directionSource}`;
  }
  return `Engine:     ${engineId}  ·  Source: ${directionSource}`;
}

export async function sendTradeExecutedAlert(
  params: TradeExecutionAlertParams,
): Promise<void> {
  const {
    oandaInstrument, direction, fillPrice, stopLoss, takeProfit,
    filledUnits, amdTag, amdSizeMultiplier, directionSource, engineId,
    laneLabel, foundingHint,
  } = params;

  const pairDisplay = formatPair(oandaInstrument);
  const multiplier = (amdSizeMultiplier ?? 1.0).toFixed(2);
  const amdLine = amdTag != null
    ? `AMD: ${amdTag}  ·  Size: ${multiplier}×`
    : null;
  const title = laneLabel
    ? `🚀 <b>${laneLabel} Executed — ${pairDisplay}</b>`
    : `🚀 <b>Trade Executed — ${pairDisplay}</b>`;

  const text = joinLines([
    title,
    DIVIDER,
    `Direction:  <b>${directionBadge(direction)}</b>`,
    engineLine(engineId, directionSource, laneLabel),
    foundingHint ? `Founding:   ${foundingHint}` : null,
    `Entry: <code>${priceField(fillPrice)}</code>  SL: <code>${priceField(stopLoss)}</code>  TP: <code>${priceField(takeProfit)}</code>`,
    `Units:  ${filledUnits}`,
    amdLine ? DIVIDER : null,
    amdLine,
    DIVIDER,
    `📊 <a href="${DASHBOARD_URL}">View Dashboard</a>`,
  ]);

  await sendTelegramMessage(text);
}
