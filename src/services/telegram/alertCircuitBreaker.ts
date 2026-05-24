import { sendTelegramMessage, joinLines, DIVIDER, DASHBOARD_URL } from './telegramClient.js';

export type CircuitBreakerAlertParams = {
  consecutiveLosses: number;
  cooldownMinutes: number;
  tripReason: string;
};

export async function sendCircuitBreakerAlert(
  params: CircuitBreakerAlertParams,
): Promise<void> {
  const { consecutiveLosses, cooldownMinutes, tripReason } = params;

  const text = joinLines([
    `🚨 <b>Circuit Breaker Tripped</b>`,
    DIVIDER,
    `Reason:              ${tripReason}`,
    `Consecutive losses:  ${consecutiveLosses}`,
    `Cooldown:            ${cooldownMinutes} minutes`,
    DIVIDER,
    `⚠️ <i>Trading paused — manual review recommended</i>`,
    DIVIDER,
    `📊 <a href="${DASHBOARD_URL}">View Dashboard</a>`,
  ]);

  await sendTelegramMessage(text);
}
