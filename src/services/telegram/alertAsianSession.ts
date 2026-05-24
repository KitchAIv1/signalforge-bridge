import { sendTelegramMessage, joinLines, DIVIDER, DASHBOARD_URL } from './telegramClient.js';

export type AsianOpenAlertParams = {
  directionSet: string;
  previousDirection: string | null;
  amdTag: string;
  priorD1Direction: string;
  priorD1BodyPips: number;
  directionChanged: boolean;
};

export type AsianCloseAlertParams = {
  directionWas: string | null;
  tradeDate: string;
};

function directionArrow(direction: string | null): string {
  if (direction === 'long') return '↑ LONG';
  if (direction === 'short') return '↓ SHORT';
  return '—';
}

export async function sendAsianOpenAlert(
  params: AsianOpenAlertParams,
): Promise<void> {
  const {
    directionSet, previousDirection, amdTag,
    priorD1Direction, priorD1BodyPips, directionChanged,
  } = params;

  const changeLabel = directionChanged
    ? `${directionArrow(previousDirection)} → <b>${directionArrow(directionSet)}</b> ✓`
    : `<b>${directionArrow(directionSet)}</b> (unchanged)`;

  const text = joinLines([
    `🌏 <b>Asian Open — Direction Set</b>`,
    DIVIDER,
    `Direction:  ${changeLabel}`,
    `AMD Tag:    ${amdTag}`,
    `Prior D1:   ${priorD1Direction} (${priorD1BodyPips.toFixed(1)} pips)`,
    DIVIDER,
    `📊 <a href="${DASHBOARD_URL}">View Dashboard</a>`,
  ]);

  await sendTelegramMessage(text);
}

export async function sendAsianCloseAlert(
  params: AsianCloseAlertParams,
): Promise<void> {
  const { directionWas, tradeDate } = params;

  const text = joinLines([
    `🔔 <b>Asian Close — 08:00 UTC</b>`,
    DIVIDER,
    `Date:           ${tradeDate}`,
    `Direction was:  <b>${directionArrow(directionWas)}</b>`,
    `Action:         All open Omega positions closed`,
    DIVIDER,
    `📊 <a href="${DASHBOARD_URL}">View Dashboard</a>`,
  ]);

  await sendTelegramMessage(text);
}
