import { getSupabaseClient } from '../../connectors/supabase.js';
import { PDL_WINDOW_PAIR, PDL_WINDOW_TABLE } from './pdlWindowConstants.js';
import type {
  PdlWindowTrade,
  PdlWindowTradeInsert,
  PdlWindowTradeResult,
} from './pdlWindowTypes.js';

function db() {
  return getSupabaseClient();
}

export async function loadOpenPdlTrades(
  tradeDate: string,
  pair = PDL_WINDOW_PAIR,
  brokerId?: string,
): Promise<PdlWindowTrade[]> {
  let query = db()
    .from(PDL_WINDOW_TABLE)
    .select('*')
    .eq('trade_date', tradeDate)
    .eq('pair', pair)
    .is('result', null);
  if (brokerId) query = query.eq('broker_id', brokerId);
  const { data, error } = await query;
  if (error) throw new Error(`loadOpenPdlTrades: ${error.message}`);
  return (data ?? []) as PdlWindowTrade[];
}

export async function loadAllOpenPdlTrades(
  pair = PDL_WINDOW_PAIR,
): Promise<PdlWindowTrade[]> {
  const { data, error } = await db()
    .from(PDL_WINDOW_TABLE)
    .select('*')
    .eq('pair', pair)
    .is('result', null);
  if (error) throw new Error(`loadAllOpenPdlTrades: ${error.message}`);
  return (data ?? []) as PdlWindowTrade[];
}

export async function countPdlTradesToday(
  tradeDate: string,
  pair = PDL_WINDOW_PAIR,
  brokerId?: string,
): Promise<number> {
  let query = db()
    .from(PDL_WINDOW_TABLE)
    .select('id', { count: 'exact', head: true })
    .eq('trade_date', tradeDate)
    .eq('pair', pair)
    .not('oanda_trade_id', 'is', null);
  if (brokerId) query = query.eq('broker_id', brokerId);
  const { count, error } = await query;
  if (error) throw new Error(`countPdlTradesToday: ${error.message}`);
  return count ?? 0;
}

export async function insertPdlTrade(
  fields: PdlWindowTradeInsert,
): Promise<PdlWindowTrade> {
  const { data, error } = await db()
    .from(PDL_WINDOW_TABLE)
    .insert({ pair: PDL_WINDOW_PAIR, ...fields })
    .select()
    .single();
  if (error) throw new Error(`insertPdlTrade: ${error.message}`);
  return data as PdlWindowTrade;
}

export type PdlWindowTradeUpdate = {
  exit_price?: number | null;
  pnl_pips?: number | null;
  pnl_dollars?: number | null;
  pnl_r?: number | null;
  result?: PdlWindowTradeResult;
  closed_at?: string;
  close_reason?: string;
};

export async function updatePdlTrade(
  id: number,
  fields: PdlWindowTradeUpdate,
): Promise<void> {
  const { error } = await db().from(PDL_WINDOW_TABLE).update(fields).eq('id', id);
  if (error) throw new Error(`updatePdlTrade: ${error.message}`);
}
