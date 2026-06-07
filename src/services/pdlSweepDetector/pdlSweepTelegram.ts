import { sendTelegramMessage } from '../telegram/telegramClient.js';
import type { PdlSweepComputed } from './pdlSweepTypes.js';

export async function sendPdlSweepFireAlert(
  tradeDate: string,
  computed: PdlSweepComputed,
): Promise<void> {
  const depth = computed.pdl_sweep_depth_pips ?? 0;
  const london = computed.london_net_pips ?? 0;
  const h11 = computed.h11_net_pips ?? 0;
  const engine = computed.decision_auto_direction ?? '—';
  const amdTag = computed.amd_outcome_tag ?? 'pending';

  const message = [
    `🔴 <b>PDL SWEEP SIGNAL — ${tradeDate}</b>`,
    `Price swept below prior day low by ${depth}p`,
    `London ran DOWN ${london}p`,
    `H11 recovering UP ${h11}p`,
    '→ Predicted: LONG 12:00–13:00',
    `AMD context: ${amdTag} | Engine: ${engine}`,
    '[SHADOW — no execution]',
  ].join('\n');

  await sendTelegramMessage(message);
}

export async function sendPdlSweepOutcomeAlert(
  tradeDate: string,
  h12Direction: string,
  h12NetPips: number,
  correct: boolean,
): Promise<void> {
  const verdict = correct ? 'correct' : 'wrong';
  const message =
    `PDL Sweep Outcome: ${tradeDate} — h12 ${h12Direction} ${h12NetPips}p. Signal: ${verdict}`;
  await sendTelegramMessage(message);
}
