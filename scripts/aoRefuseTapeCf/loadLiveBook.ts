/** Load Lane B AO executed trades + omega fire stream (live truth). */

import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { readFileSync } from 'node:fs';
import { parseAlphaOmegaAdvisory } from './parseAdvisory.js';
import type { LiveAoTradeRow, LiveFireRow } from './types.js';

function loadEnvFile(): void {
  try {
    for (const line of readFileSync('.env', 'utf8').split('\n')) {
      const match = line.match(/^([A-Z0-9_]+)=(.*)$/);
      if (!match || process.env[match[1]]) continue;
      let value = match[2].trim();
      if (
        (value.startsWith('"') && value.endsWith('"')) ||
        (value.startsWith("'") && value.endsWith("'"))
      ) {
        value = value.slice(1, -1);
      }
      process.env[match[1]] = value;
    }
  } catch {
    /* optional */
  }
}

export function createBridgeSupabase(): SupabaseClient {
  loadEnvFile();
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_KEY;
  if (!url || !key) throw new Error('Missing SUPABASE_URL / service key');
  return createClient(url, key, { auth: { persistSession: false } });
}

export async function loadLiveAoExecutedBook(
  supabase: SupabaseClient,
): Promise<LiveAoTradeRow[]> {
  const { data, error } = await supabase
    .from('bridge_trade_log')
    .select(
      'id,created_at,signal_received_at,closed_at,direction,lane_advisory,confluence_score,fill_price,stop_loss,units,pnl_pips,pnl_dollars,close_reason',
    )
    .eq('engine_id', 'omega')
    .eq('broker_id', 'oanda_phase2_demo')
    .eq('decision', 'EXECUTED')
    .like('lane_advisory', 'ALPHAOMEGA_ENTRY%')
    .order('created_at', { ascending: true });
  if (error) throw new Error(error.message);

  const rows: LiveAoTradeRow[] = [];
  for (const row of data ?? []) {
    if (row.closed_at == null || row.fill_price == null) continue;
    if (row.pnl_pips == null || row.pnl_dollars == null) continue;
    const geometry = parseAlphaOmegaAdvisory(row.lane_advisory as string);
    rows.push({
      id: String(row.id),
      createdAt: String(row.created_at),
      entryAt: String(row.signal_received_at ?? row.created_at),
      closedAt: String(row.closed_at),
      direction: String(row.direction),
      laneAdvisory: String(row.lane_advisory ?? ''),
      confluence: row.confluence_score != null ? Number(row.confluence_score) : null,
      fillPrice: Number(row.fill_price),
      stopLoss: row.stop_loss != null ? Number(row.stop_loss) : null,
      units: Number(row.units ?? 0),
      pnlPips: Number(row.pnl_pips),
      pnlDollars: Number(row.pnl_dollars),
      closeReason: row.close_reason != null ? String(row.close_reason) : null,
      foundingLength: geometry.foundingLength,
      foundingSpeedMin: geometry.foundingSpeedMin,
      pureSizing: geometry.pureSizing,
    });
  }
  return rows;
}

export async function loadOmegaLaneBFireStream(
  supabase: SupabaseClient,
  fromIso: string,
  toIso: string,
): Promise<LiveFireRow[]> {
  const rows: LiveFireRow[] = [];
  for (let offset = 0; ; offset += 1000) {
    const { data, error } = await supabase
      .from('bridge_trade_log')
      .select(
        'created_at,signal_received_at,direction,decision,block_reason,confluence_score,signal_id',
      )
      .eq('engine_id', 'omega')
      .eq('broker_id', 'oanda_phase2_demo')
      .gte('created_at', fromIso)
      .lte('created_at', toIso)
      .order('created_at', { ascending: true })
      .range(offset, offset + 999);
    if (error) throw new Error(error.message);
    if (!data?.length) break;
    for (const row of data) {
      rows.push({
        createdAt: String(row.created_at),
        signalReceivedAt: String(row.signal_received_at ?? row.created_at),
        direction: String(row.direction ?? ''),
        decision: String(row.decision ?? ''),
        blockReason: row.block_reason != null ? String(row.block_reason) : null,
        confluence: row.confluence_score != null ? Number(row.confluence_score) : null,
        signalId: String(row.signal_id ?? ''),
      });
    }
    if (data.length < 1000) break;
  }
  return rows;
}
