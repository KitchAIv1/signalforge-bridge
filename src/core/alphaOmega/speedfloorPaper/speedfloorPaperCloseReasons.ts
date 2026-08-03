/** Stored close_reason values for SPEEDFLOOR paper — distinct from live alphaomega_*. */

export type SpeedfloorPaperTrigger =
  | 'hard_stop'
  | 'giveback_trail'
  | 'opposing_count'
  | 'opposing_share'
  | 'backstop_crack'
  | 'max_hold';

export const SPEEDFLOOR_PAPER_CLOSE_PREFIX = 'speedfloor_paper_';

export function speedfloorPaperCloseReason(trigger: SpeedfloorPaperTrigger): string {
  return `${SPEEDFLOOR_PAPER_CLOSE_PREFIX}${trigger}`;
}

export function parseSpeedfloorPaperTrigger(
  closeReason: string | null | undefined,
): SpeedfloorPaperTrigger | null {
  const raw = (closeReason ?? '').trim();
  if (!raw.startsWith(SPEEDFLOOR_PAPER_CLOSE_PREFIX)) return null;
  const trigger = raw.slice(SPEEDFLOOR_PAPER_CLOSE_PREFIX.length) as SpeedfloorPaperTrigger;
  const allowed: SpeedfloorPaperTrigger[] = [
    'hard_stop',
    'giveback_trail',
    'opposing_count',
    'opposing_share',
    'backstop_crack',
    'max_hold',
  ];
  return allowed.includes(trigger) ? trigger : null;
}
