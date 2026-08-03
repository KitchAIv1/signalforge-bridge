import type { PaperExitTrigger } from './paperSimTypes';

const PREFIX = 'speedfloor_paper_';

export function parseSpeedfloorPaperTrigger(
  closeReason: string | null | undefined,
): PaperExitTrigger | null {
  const raw = (closeReason ?? '').trim();
  if (!raw.startsWith(PREFIX)) return null;
  const trigger = raw.slice(PREFIX.length) as PaperExitTrigger;
  const allowed: PaperExitTrigger[] = [
    'hard_stop',
    'giveback_trail',
    'opposing_count',
    'opposing_share',
    'backstop_crack',
    'max_hold',
  ];
  return allowed.includes(trigger) ? trigger : null;
}
