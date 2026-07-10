import { sendTelegramMessage, joinLines, DIVIDER, DASHBOARD_URL } from './telegramClient.js';

export type TradeCloseAlertParams = {
  engineId: string;
  instrument: string;
  direction: string;
  entryPrice: number;
  exitPrice: number;
  pnlPips: number;
  pnlDollars: number;
  closeReason: string;
  durationMinutes: number;
  /** e.g. ALPHAOMEGA — shown when set so Lane B is distinct from Lane A */
  laneLabel?: string | null;
};

function resultBadge(pnlDollars: number): string {
  if (pnlDollars > 0) return '✅ WIN';
  if (pnlDollars < 0) return '❌ LOSS';
  return '⚪ BREAKEVEN';
}

function formatPair(instrument: string): string {
  return instrument.includes('_') ? instrument.replace('_', '/') : instrument;
}

function directionLabel(direction: string): string {
  const d = direction.toUpperCase();
  if (d === 'LONG' || d === 'BUY') return '🟢 LONG';
  if (d === 'SHORT' || d === 'SELL') return '🔴 SHORT';
  return d;
}

export async function sendTradeClosedAlert(
  params: TradeCloseAlertParams,
): Promise<void> {
  const {
    engineId, instrument, direction, entryPrice, exitPrice,
    pnlPips, pnlDollars, closeReason, durationMinutes, laneLabel,
  } = params;

  const pnlSign = pnlDollars >= 0 ? '+' : '';
  const pipSign = pnlPips >= 0 ? '+' : '';
  const title = laneLabel
    ? `${resultBadge(pnlDollars)} <b>${laneLabel} Closed — ${formatPair(instrument)}</b>`
    : `${resultBadge(pnlDollars)} <b>Trade Closed — ${formatPair(instrument)}</b>`;
  const engineLine = laneLabel
    ? `Engine:    ${engineId}  ·  Lane: <b>${laneLabel}</b>`
    : `Engine:    ${engineId}`;

  const text = joinLines([
    title,
    DIVIDER,
    engineLine,
    `Direction: ${directionLabel(direction)}`,
    `Entry: <code>${entryPrice.toFixed(5)}</code>  Exit: <code>${exitPrice.toFixed(5)}</code>`,
    `P&L:   <b>${pnlSign}${pnlDollars.toFixed(2)} USD</b>  (${pipSign}${pnlPips.toFixed(1)}p)`,
    `Reason:    ${closeReason}`,
    `Duration:  ${durationMinutes}m`,
    DIVIDER,
    `📊 <a href="${DASHBOARD_URL}">View Dashboard</a>`,
  ]);

  await sendTelegramMessage(text);
}
