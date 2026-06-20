const CLOSE_REASON_LABELS: Record<string, string> = {
  tp_hit: 'TP hit',
  ratchet_floor: 'T2 floor (4p)',
  trail_stop: 'Trail stop',
  trail_sl_hit: 'Trail SL',
  max_hold: 'Max hold',
  direction_flip_auto_close: 'Direction flip',
  external_close: 'External close',
};

export function formatCloseReason(closeReason: string | null): string {
  if (!closeReason) return '—';
  return CLOSE_REASON_LABELS[closeReason] ?? closeReason;
}
