/**
 * READ-ONLY investigation: why did today's AUDUSD fade get an external close?
 * Pulls fade trade(s), all AUD_USD bridge_trade_log activity today, and the OANDA
 * transactions around the fade window to identify which order netted it out.
 * NO writes, NO order placement. Safe to run.
 */
import 'dotenv/config';
import { getSupabaseClient } from '../src/connectors/supabase.js';
import { getTradeById } from '../src/connectors/oanda.js';

const TOKEN = process.env.OANDA_API_TOKEN;
const ACCT = process.env.OANDA_ACCOUNT_ID;
const ENV = process.env.OANDA_ENVIRONMENT ?? 'practice';
const BASE = ENV === 'live' ? 'https://api-fxtrade.oanda.com' : 'https://api-fxpractice.oanda.com';

function todayUtc(): string {
  return new Date().toISOString().slice(0, 10);
}

async function oanda(path: string): Promise<any> {
  const res = await fetch(`${BASE}${path}`, { headers: { Authorization: `Bearer ${TOKEN}` } });
  if (!res.ok) return { _error: `${res.status} ${await res.text()}`.slice(0, 300) };
  return res.json();
}

async function fadeTrades(): Promise<any[]> {
  const db = getSupabaseClient();
  const { data, error } = await db
    .from('audusd_fade_trades')
    .select('*')
    .gte('trade_date', todayUtc())
    .order('created_at', { ascending: true });
  if (error) throw new Error(`fadeTrades: ${error.message}`);
  return data ?? [];
}

async function audusdActivityToday(): Promise<any[]> {
  const db = getSupabaseClient();
  const start = `${todayUtc()}T00:00:00Z`;
  const { data, error } = await db
    .from('bridge_trade_log')
    .select('engine_id,pair,direction,decision,status,result,fill_price,exit_price,units,oanda_trade_id,close_reason,created_at,closed_at')
    .eq('pair', 'AUD_USD')
    .gte('created_at', start)
    .order('created_at', { ascending: true });
  if (error) throw new Error(`audusdActivity: ${error.message}`);
  return data ?? [];
}

function fmt(o: unknown): string {
  return JSON.stringify(o, null, 2);
}

/** Find the OANDA transaction(s) that closed the fade tradeID (which order netted it). */
async function closingTxFor(fadeTradeId: string, fromIso: string): Promise<any[]> {
  const list = await oanda(`/v3/accounts/${ACCT}/transactions?from=${encodeURIComponent(fromIso)}&to=${encodeURIComponent(new Date().toISOString())}&pageSize=500`);
  if (list?._error) return [{ _error: list._error }];
  const pages: string[] = list.pages ?? [];
  const hits: any[] = [];
  for (const pageUrl of pages) {
    const u = new URL(pageUrl);
    const page = await oanda(`${u.pathname}${u.search}`);
    for (const tx of page.transactions ?? []) {
      const closes = [tx.tradeClosed?.tradeID, ...(tx.tradesClosed ?? []).map((c: any) => c.tradeID)].filter(Boolean);
      const isReducer = closes.includes(fadeTradeId);
      if (isReducer || tx.type === 'ORDER_FILL') {
        hits.push({
          time: tx.time, type: tx.type, instrument: tx.instrument, units: tx.units,
          reason: tx.reason, price: tx.price, tradeOpened: tx.tradeOpened?.tradeID,
          tradesClosed: (tx.tradesClosed ?? []).map((c: any) => c.tradeID), tradeClosed: tx.tradeClosed?.tradeID,
          closesFade: isReducer,
        });
      }
    }
  }
  return hits;
}

async function main(): Promise<void> {
  console.log(`=== AUDUSD FADE EXTERNAL-CLOSE INVESTIGATION (UTC ${todayUtc()}) ===\n`);
  console.log(`OANDA env=${ENV} account=${ACCT}\n`);

  const trades = await fadeTrades();
  console.log(`--- audusd_fade_trades today (${trades.length}) ---`);
  console.log(fmt(trades));

  console.log(`\n--- bridge_trade_log AUD_USD activity today (all engines) ---`);
  const activity = await audusdActivityToday();
  for (const a of activity) {
    console.log(`${a.created_at} | ${String(a.engine_id).padEnd(14)} | ${String(a.direction).padEnd(5)} | ${a.decision}/${a.status}/${a.result ?? '-'} | fill=${a.fill_price} exit=${a.exit_price ?? '-'} units=${a.units ?? '-'} | oandaId=${a.oanda_trade_id ?? '-'} | close=${a.close_reason ?? '-'} | closedAt=${a.closed_at ?? '-'}`);
  }

  for (const t of trades) {
    if (!t.oanda_trade_id) continue;
    console.log(`\n--- OANDA trade detail for fade oandaId=${t.oanda_trade_id} ---`);
    console.log(fmt(await getTradeById(t.oanda_trade_id)));
    const fromIso = t.opened_at ?? t.created_at;
    console.log(`\n--- OANDA transactions since ${fromIso} touching fade tradeID ---`);
    const hits = await closingTxFor(t.oanda_trade_id, fromIso);
    for (const h of hits) {
      const flag = h.closesFade ? '  <<< CLOSED THE FADE' : '';
      console.log(`${h.time} | ${h.type} | ${h.instrument ?? '-'} units=${h.units ?? '-'} reason=${h.reason ?? '-'} price=${h.price ?? '-'} opened=${h.tradeOpened ?? '-'} closed=${JSON.stringify(h.tradesClosed)}${flag}`);
    }
  }

  console.log('\n=== END ===');
}

main().catch((e) => { console.error(e); process.exit(1); });
