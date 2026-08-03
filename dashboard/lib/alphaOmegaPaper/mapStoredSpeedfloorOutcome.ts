/** Map persisted SPEEDFLOOR paper close fields → UI outcome (no sim). */

import { parseSpeedfloorPaperTrigger } from './parseSpeedfloorPaperTrigger';
import {
  dollarsFromPaperPips,
  sizeSpeedfloorPaperUnits,
} from './sizeSpeedfloorPaperUnits';
import type { SpeedfloorPaperOutcome } from './paperSimTypes';
import type { BridgeTradeLogRow } from '@/lib/types';

export function mapStoredSpeedfloorOutcome(
  row: BridgeTradeLogRow,
): SpeedfloorPaperOutcome | null {
  if (row.status !== 'closed' || row.pnl_pips == null) return null;
  const entryPrice = row.entry_price != null ? Number(row.entry_price) : NaN;
  if (!Number.isFinite(entryPrice)) return null;
  const paperPips = Number(row.pnl_pips);
  const entryAt = row.signal_received_at || row.created_at;
  const paperUnits = sizeSpeedfloorPaperUnits(
    row.account_equity_at_signal != null ? Number(row.account_equity_at_signal) : 0,
    entryPrice,
    row.stop_loss != null ? Number(row.stop_loss) : null,
    new Date(entryAt),
  );
  const paperDollars =
    row.pnl_dollars != null
      ? Number(row.pnl_dollars)
      : paperUnits != null
        ? dollarsFromPaperPips(paperPips, paperUnits)
        : null;
  const trigger = parseSpeedfloorPaperTrigger(row.close_reason);
  return {
    tradeId: row.id,
    signalId: String(row.signal_id ?? ''),
    status: 'paper_closed',
    paperPips,
    paperDollars,
    paperUnits,
    exitTrigger: trigger ?? 'opposing_count',
    exitAt: row.closed_at ?? null,
    holdMinutes:
      row.duration_minutes != null ? Number(row.duration_minutes) : null,
    entryPrice,
    detail: 'Stored SPEEDFLOOR paper close',
  };
}
