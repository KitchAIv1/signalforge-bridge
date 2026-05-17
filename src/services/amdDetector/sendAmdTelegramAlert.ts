import type { AmdDateFeatures } from './amdTypes.js';
import { AMD_TAG_LABELS, AMD_TAG_MULTIPLIERS } from './amdTelegramTagDisplay.js';

export function buildAmdTelegramMessage(tradeDate: string, features: AmdDateFeatures): string {
  const tagKey = features.amd_tag;
  const label = AMD_TAG_LABELS[tagKey] ?? tagKey;
  const multiplierLine = AMD_TAG_MULTIPLIERS[tagKey] ?? '1.0×';

  const asianLine =
    features.asian_range_pips != null
      ? `Asian: ${features.asian_range_pips}pips ${
          features.asian_is_flat ? '(flat ✓)' : '(drifting)'
        }`
      : 'Asian: —';

  const judasLine = features.judas_direction
    ? `Judas: ${features.judas_direction} ${features.judas_pips ?? '?'}pips`
    : 'Judas: —';

  const reversalLine =
    features.reversal_confirmed === true
      ? 'Reversal: Confirmed ✓'
      : features.reversal_confirmed === false
        ? 'Reversal: Not confirmed ✗'
        : 'Reversal: —';

  return [
    `🔔 <b>AMD Detection — ${tradeDate}</b>`,
    '━━━━━━━━━━━━━━━━━━━━━━━',
    `Tag: ${label}`,
    asianLine,
    judasLine,
    reversalLine,
    `Size: ${multiplierLine}`,
    '━━━━━━━━━━━━━━━━━━━━━━━',
    '📊 <a href="https://signalforge-bridge.vercel.app/activity">View Dashboard</a>',
  ].join('\n');
}

export async function sendAmdTelegramAlert(
  tradeDate: string,
  features: AmdDateFeatures
): Promise<void> {
  const botToken = process.env.TELEGRAM_BOT_TOKEN?.trim();
  const chatId = process.env.TELEGRAM_CHAT_ID?.trim();

  if (!botToken || !chatId) {
    console.warn(
      '[AmdTelegram] TELEGRAM_BOT_TOKEN or TELEGRAM_CHAT_ID not set — skipping'
    );
    return;
  }

  const text = buildAmdTelegramMessage(tradeDate, features);

  const response = await fetch(`https://api.telegram.org/bot${botToken}/sendMessage`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      chat_id: chatId,
      text,
      parse_mode: 'HTML',
      disable_web_page_preview: false,
    }),
  });

  if (!response.ok) {
    const body = await response.text();
    console.warn(`[AmdTelegram] Send failed (${response.status}): ${body}`);
    return;
  }

  console.log('[AmdTelegram] Alert sent for', tradeDate);
}
