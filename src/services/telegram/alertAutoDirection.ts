import { sendTelegramMessage, joinLines, DIVIDER, DASHBOARD_URL } from './telegramClient.js';

const CONFIDENCE_EMOJI: Record<string, string> = {
  high: '🟢',
  medium: '🟡',
  low: '🟠',
  very_low: '🔴',
};

export type AutoDirectionAlertParams = {
  autoDirection: string;
  reason: string;
  confidence: string;
  amdSizeMultiplier: number;
  amdTag: string;
};

function directionArrow(direction: string): string {
  const d = direction.toLowerCase();
  if (d === 'long') return '↑ LONG';
  if (d === 'short') return '↓ SHORT';
  return '— NEUTRAL';
}

function formatConfidence(level: string): string {
  const emoji = CONFIDENCE_EMOJI[level] ?? '⚪';
  const label = level.replace(/_/g, ' ');
  return `${emoji} ${label.charAt(0).toUpperCase() + label.slice(1)}`;
}

export async function sendAutoDirectionAlert(
  params: AutoDirectionAlertParams,
): Promise<void> {
  const { autoDirection, reason, confidence, amdSizeMultiplier, amdTag } = params;

  const text = joinLines([
    `⚡ <b>Auto Direction — AUD/USD</b>`,
    DIVIDER,
    `Direction:   <b>${directionArrow(autoDirection)}</b>`,
    `Confidence:  ${formatConfidence(confidence)}`,
    `Size:        <b>${amdSizeMultiplier.toFixed(2)}×</b>`,
    `Tag:         ${amdTag}`,
    DIVIDER,
    `<i>${reason}</i>`,
    DIVIDER,
    `📊 <a href="${DASHBOARD_URL}">View Dashboard</a>`,
  ]);

  await sendTelegramMessage(text);
}
