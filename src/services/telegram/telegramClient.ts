/** Shared Telegram HTTP client and formatting primitives. */

export const DASHBOARD_URL = 'https://signalforge-bridge.vercel.app/activity';
export const DIVIDER = '━━━━━━━━━━━━━━━━━━━━━━━';

/** Joins non-empty lines with newlines, filtering nulls/undefineds. */
export function joinLines(lines: (string | null | undefined)[]): string {
  return lines.filter(Boolean).join('\n');
}

/**
 * Sends a Telegram HTML message to the configured bot/chat.
 * Silent no-op when env vars are missing.
 */
export async function sendTelegramMessage(text: string): Promise<void> {
  const botToken = process.env.TELEGRAM_BOT_TOKEN?.trim();
  const chatId = process.env.TELEGRAM_CHAT_ID?.trim();

  if (!botToken || !chatId) {
    console.warn('[Telegram] TELEGRAM_BOT_TOKEN or TELEGRAM_CHAT_ID not set — skipping');
    return;
  }

  const response = await fetch(
    `https://api.telegram.org/bot${botToken}/sendMessage`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        chat_id: chatId,
        text,
        parse_mode: 'HTML',
        disable_web_page_preview: false,
      }),
    },
  );

  if (!response.ok) {
    const body = await response.text();
    console.warn(`[Telegram] Send failed (${response.status}): ${body}`);
  }
}
