/**
 * Venue-scoped operations for the AMD trail monitor. Each amd_trail_stop_state
 * row carries a broker_id; OANDA rows keep the legacy REST path, VT rows go
 * through the shared BrokerClient adapter (MetaApi). A venue whose open-trade
 * snapshot fails is marked unavailable so its rows are SKIPPED for the cycle —
 * never false-flagged as externally closed.
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import {
  closeTrade as oandaCloseTrade,
  getClosedTradeDetails,
  getOpenTrades as oandaGetOpenTrades,
} from '../../connectors/oanda.js';
import { resolveBrokerForLogRow } from '../broker/resolveBrokerForLogRow.js';
import { logError } from '../../utils/logger.js';
import { AMD_BROKER_ID, resolveAmdOandaAccountId } from './resolveAmdOandaAccountId.js';
import { AMD_VT_BROKER_ID } from './amdVtMirror.js';

const ENGINE_ID = 'engine_amd';

export interface AmdClosedDetails {
  exitPrice: number | null;
  pnlDollars: number | null;
}

export interface AmdVenueOps {
  brokerId: string;
  openIds: Set<string>;
  closeTrade(tradeId: string): Promise<void>;
  fetchClosedDetails(tradeId: string): Promise<AmdClosedDetails>;
}

async function buildOandaVenue(): Promise<AmdVenueOps> {
  const accountId = resolveAmdOandaAccountId();
  const openIds = new Set(
    (await oandaGetOpenTrades(accountId)).map((tradeRow) => tradeRow.id),
  );
  return {
    brokerId: AMD_BROKER_ID,
    openIds,
    async closeTrade(tradeId: string): Promise<void> {
      await oandaCloseTrade(tradeId, undefined, accountId);
    },
    async fetchClosedDetails(tradeId: string): Promise<AmdClosedDetails> {
      const fromTime = new Date(Date.now() - 12 * 60 * 60 * 1000).toISOString();
      const closed = await getClosedTradeDetails(tradeId, fromTime, accountId);
      return { exitPrice: closed.exitPrice, pnlDollars: closed.pnlDollars };
    },
  };
}

async function buildVtVenue(supabase: SupabaseClient): Promise<AmdVenueOps> {
  const broker = await resolveBrokerForLogRow(supabase, AMD_VT_BROKER_ID, ENGINE_ID);
  const openIds = new Set((await broker.getOpenTrades()).map((tradeRow) => tradeRow.id));
  return {
    brokerId: AMD_VT_BROKER_ID,
    openIds,
    async closeTrade(tradeId: string): Promise<void> {
      await broker.closeTrade(tradeId);
    },
    async fetchClosedDetails(tradeId: string): Promise<AmdClosedDetails> {
      const details = await broker.getTradeById(tradeId);
      return {
        exitPrice: details?.averageClosePrice ?? null,
        pnlDollars: details?.realizedPL ?? null,
      };
    },
  };
}

export function amdStateBrokerId(state: Record<string, unknown>): string {
  const brokerId = state.broker_id;
  return typeof brokerId === 'string' && brokerId.length > 0 ? brokerId : AMD_BROKER_ID;
}

/**
 * Build venue ops for exactly the brokers present among open states.
 * A venue that fails to snapshot is omitted from the map (rows skipped).
 */
export async function buildAmdVenueOps(
  supabase: SupabaseClient,
  openStates: Array<Record<string, unknown>>,
): Promise<Map<string, AmdVenueOps>> {
  const brokerIds = new Set(openStates.map(amdStateBrokerId));
  const venues = new Map<string, AmdVenueOps>();
  for (const brokerId of brokerIds) {
    try {
      if (brokerId === AMD_VT_BROKER_ID) {
        venues.set(brokerId, await buildVtVenue(supabase));
      } else {
        venues.set(brokerId, await buildOandaVenue());
      }
    } catch (err) {
      logError('[AmdTrail] venue snapshot failed — skipping its rows this cycle', {
        brokerId,
        err: String(err),
      });
    }
  }
  return venues;
}
