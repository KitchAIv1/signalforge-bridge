/**
 * Webhook POST to ALERT_WEBHOOK_URL; log to bridge_alert_log.
 */

import type { SupabaseClient } from '@supabase/supabase-js';

const WEBHOOK_URL = process.env.ALERT_WEBHOOK_URL;

export async function sendAlert(
  supabase: SupabaseClient,
  alertType: string,
  message: string,
  payload?: Record<string, unknown>
): Promise<void> {
  await supabase.from('bridge_alert_log').insert({
    alert_type: alertType,
    message,
    payload: payload ?? null,
    webhook_sent: false,
  });
  if (!WEBHOOK_URL) return;
  try {
    const body = JSON.stringify({ text: `[Bridge] ${alertType}: ${message}`, ...payload });
    await fetch(WEBHOOK_URL, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body });
  } catch {
    // ignore
  }
}
