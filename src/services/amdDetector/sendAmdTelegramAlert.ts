import type { AmdDateFeatures } from './amdTypes.js';
import { AMD_TAG_LABELS, AMD_TAG_MULTIPLIERS } from './amdTelegramTagDisplay.js';
import { sendTelegramMessage } from '../telegram/telegramClient.js';

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

  const timingDisplay = features.judas_timing === 'LATE'
    ? 'Late (H9) · 75% hist confirm'
    : features.judas_timing === 'EARLY'
      ? 'Early (H8) · 52% hist confirm'
      : '—';

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
    `Timing: ${timingDisplay}`,
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
  const text = buildAmdTelegramMessage(tradeDate, features);
  await sendTelegramMessage(text);
  console.log('[AmdTelegram] Alert sent for', tradeDate);
}

export async function sendAmdDetectionRerunBlockedAlert(
  tradeDate: string,
  lockedAt: string | null,
  lockReason: string | null,
): Promise<void> {
  const text =
    `⚠️ AMD rerun blocked for ${tradeDate} — ` +
    `direction locked since ${lockedAt ?? 'unknown'}. ` +
    `Reason: ${lockReason ?? 'unknown'}`;
  await sendTelegramMessage(text);
  console.log('[AmdTelegram] Rerun-blocked alert sent for', tradeDate);
}
