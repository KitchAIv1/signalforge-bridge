/**
 * Closes open Omega positions matching opposingDirection on direction flip.
 * Extracted from signalRouter.ts for reuse by AsianDirectionService.
 */
import type { SupabaseClient } from '@supabase/supabase-js';
import { closeTrade, getClosedTradeDetails } from '../connectors/oanda.js';
import { logInfo } from '../utils/logger.js';

export async function closeAllOpenOmegaPositions(
  supabase: SupabaseClient,
  opposingDirection: string,
): Promise<void> {
  try {
    const normalizedOppose = opposingDirection.toLowerCase();
    const { data: openTradeRows } = await supabase
      .from('bridge_trade_log')
      .select('id, oanda_trade_id, direction, fill_price, r_size_raw, created_at')
      .eq('engine_id', 'omega')
      .eq('status', 'open')
      .ilike('direction', normalizedOppose)
      .not('oanda_trade_id', 'is', null);

    if (openTradeRows == null || openTradeRows.length === 0) {
      logInfo('[Omega] No opposing positions to close', {
        opposingDirection: normalizedOppose,
      });
      return;
    }

    logInfo('[Omega] Auto-closing opposing positions on flip', {
      count: openTradeRows.length,
      opposingDirection: normalizedOppose,
    });

    for (const logRow of openTradeRows) {
      const oid = logRow.oanda_trade_id as string;
      try {
        await closeTrade(oid);

        const details = await getClosedTradeDetails(
          oid,
          logRow.created_at ?? new Date(Date.now() - 60 * 60 * 1000).toISOString(),
        );

        const fillPrice = logRow.fill_price != null ? Number(logRow.fill_price) : null;
        const rSize = logRow.r_size_raw != null ? Number(logRow.r_size_raw) : null;

        let pnlR: number | null = null;
        if (details.exitPrice != null && fillPrice != null && rSize != null && rSize > 0) {
          const rawMove =
            String(logRow.direction).toLowerCase() === 'short'
              ? fillPrice - details.exitPrice
              : details.exitPrice - fillPrice;
          pnlR = rawMove / rSize;
        }

        const result =
          details.pnlDollars == null
            ? 'breakeven'
            : details.pnlDollars > 0
              ? 'win'
              : details.pnlDollars < 0
                ? 'loss'
                : 'breakeven';

        const { error: updateErr } = await supabase
          .from('bridge_trade_log')
          .update({
            status: 'closed',
            close_reason: 'direction_flip_auto_close',
            closed_at: details.closedTime ?? new Date().toISOString(),
            exit_price: details.exitPrice,
            pnl_dollars: details.pnlDollars,
            pnl_r: pnlR,
            result,
          })
          .eq('id', logRow.id);

        if (updateErr) {
          console.error('[Omega] Failed to update bridge_trade_log after auto-close', {
            id: logRow.id,
            error: updateErr.message,
          });
        }
        logInfo('[Omega] Auto-closed opposing trade', {
          oanda_trade_id: oid,
          direction: logRow.direction,
        });
      } catch (flipErr: unknown) {
        console.error('[Omega] Failed to auto-close trade', {
          oanda_trade_id: oid,
          error: String(flipErr),
        });
      }
    }
  } catch (err: unknown) {
    console.error('[Omega] closeAllOpenOmegaPositions failed', String(err));
  }
}
