/**
 * Closes open Omega positions matching opposingDirection on direction flip.
 * Extracted from signalRouter.ts for reuse by AsianDirectionService.
 *
 * ALPHAOMEGA fix (2026-07-09): previously closed via the default OANDA
 * account (closeTrade with no account arg) regardless of which broker the
 * position actually lived on — meaning Lane B (oanda_phase2_demo) trades
 * could be marked "closed" in bridge_trade_log without ever actually closing
 * at the broker. Now routes through resolveBrokerForLogRow/closeTradeViaBroker
 * for correct-account closes. Lane A behavior is unchanged (resolves to the
 * same default oanda_practice account it always used).
 *
 * Lane B positions are also now EXCLUDED from this function's scope entirely:
 * ALPHAOMEGA gives Lane B its own validated exit (opposing-fire count, hard
 * stop, backstop-crack — see src/core/alphaOmega/) which deliberately does
 * NOT close on every single opposing signal the way this legacy flip-close
 * does. Letting this function also apply to Lane B would short-circuit that
 * validated logic and close trades prematurely.
 */
import type { SupabaseClient } from '@supabase/supabase-js';
import { logInfo } from '../utils/logger.js';
import { resolveBrokerForLogRow } from './broker/resolveBrokerForLogRow.js';
import { closeTradeViaBroker } from '../monitoring/brokerTradeLifecycle.js';
import { isOmegaLaneBBroker } from '../core/alphaOmega/alphaOmegaConstants.js';

export async function closeAllOpenOmegaPositions(
  supabase: SupabaseClient,
  opposingDirection: string,
): Promise<void> {
  try {
    const normalizedOppose = opposingDirection.toLowerCase();
    const { data: openTradeRows } = await supabase
      .from('bridge_trade_log')
      .select('id, oanda_trade_id, direction, fill_price, r_size_raw, created_at, broker_id')
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
      const brokerId = logRow.broker_id as string | null | undefined;
      if (isOmegaLaneBBroker(brokerId)) {
        logInfo('[Omega] Skipping Lane B position — managed by ALPHAOMEGA exit logic', {
          oanda_trade_id: oid,
        });
        continue;
      }
      try {
        const broker = await resolveBrokerForLogRow(supabase, brokerId, 'omega');
        const details = await closeTradeViaBroker(broker, oid);

        const fillPrice = logRow.fill_price != null ? Number(logRow.fill_price) : null;
        const rSize = logRow.r_size_raw != null ? Number(logRow.r_size_raw) : null;

        let pnlR: number | null = null;
        if (details.exitPriceNum != null && fillPrice != null && rSize != null && rSize > 0) {
          const rawMove =
            String(logRow.direction).toLowerCase() === 'short'
              ? fillPrice - details.exitPriceNum
              : details.exitPriceNum - fillPrice;
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
            closed_at: details.closedAt,
            exit_price: details.exitPriceNum,
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
