import type { BridgeTradeLogRow } from '@/lib/types';
import type { SpeedfloorPaperInput } from './paperSimTypes';

function toDir(raw: string): 'LONG' | 'SHORT' | null {
  const upper = raw.toUpperCase();
  if (upper === 'LONG' || upper === 'BUY') return 'LONG';
  if (upper === 'SHORT' || upper === 'SELL') return 'SHORT';
  return null;
}

export function mapTradeToPaperInput(
  row: BridgeTradeLogRow,
): SpeedfloorPaperInput | null {
  const direction = toDir(row.direction);
  const entryPrice = row.entry_price != null ? Number(row.entry_price) : NaN;
  if (!direction || !Number.isFinite(entryPrice)) return null;
  return {
    tradeId: row.id,
    signalId: String(row.signal_id ?? ''),
    direction,
    entryAt: row.signal_received_at || row.created_at,
    entryPrice,
    stopLoss: row.stop_loss != null ? Number(row.stop_loss) : null,
    equity:
      row.account_equity_at_signal != null
        ? Number(row.account_equity_at_signal)
        : null,
  };
}
