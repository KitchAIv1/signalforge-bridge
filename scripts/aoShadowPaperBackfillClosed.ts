/**
 * One-shot: reconstruct + backfill stuck ao_shadow_paper opens.
 * Fire tape = canonical matched omega fires + AO_SHADOW_OVER_OBSERVED only.
 * Writes ONLY broker_id=ao_shadow_paper AND status=open. No live AO rows.
 *
 * Dry-run:  node --import tsx scripts/aoShadowPaperBackfillClosed.ts
 * Apply:    node --import tsx scripts/aoShadowPaperBackfillClosed.ts --apply
 */
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import {
  ALPHAOMEGA_CLOSE_BACKSTOP_CRACK,
  ALPHAOMEGA_CLOSE_OPPOSING_COUNT,
  ALPHAOMEGA_CLOSE_OPPOSING_SHARE,
  ALPHAOMEGA_SHADOW_OVER_OBSERVED_REASON,
  OMEGA_AO_SHADOW_BROKER_ID,
  OPPOSING_FIRE_COUNT_THRESHOLD,
  OPPOSING_SHARE_MIN_FIRES,
  OPPOSING_SHARE_THRESHOLD,
} from '../src/core/alphaOmega/alphaOmegaConstants.ts';
import {
  emptyStreakState,
  processFireForStreak,
  type AlphaOmegaDirection,
  type StreakState,
} from '../src/core/alphaOmega/alphaOmegaStreakTracker.ts';
import { loadCanonicalStreakFires } from './aoRefuseTapeCf/loadCanonicalStreakFires.ts';

const PIP = 0.0001;
const APPLY = process.argv.includes('--apply');

function loadEnv() {
  for (const p of ['.env', 'dashboard/.env.local']) {
    try {
      for (const line of readFileSync(p, 'utf8').split('\n')) {
        const m = line.match(/^([A-Z0-9_]+)=(.*)$/);
        if (!m || process.env[m[1]!]) continue;
        let v = m[2]!.trim();
        if (
          (v.startsWith('"') && v.endsWith('"')) ||
          (v.startsWith("'") && v.endsWith("'"))
        ) {
          v = v.slice(1, -1);
        }
        process.env[m[1]!] = v;
      }
    } catch {
      /* optional */
    }
  }
}

function toDir(raw: string | null | undefined): AlphaOmegaDirection | null {
  const u = (raw ?? '').toUpperCase();
  if (u === 'LONG' || u === 'BUY') return 'LONG';
  if (u === 'SHORT' || u === 'SELL') return 'SHORT';
  return null;
}

function signedPips(dir: AlphaOmegaDirection, entry: number, exit: number): number {
  const raw = dir === 'LONG' ? (exit - entry) / PIP : (entry - exit) / PIP;
  return Math.round(raw * 10) / 10;
}

interface Fire {
  signalId: string;
  direction: AlphaOmegaDirection;
  firedAt: string;
  mark: number | null;
  source: 'matched' | 'over_threshold';
}

interface StuckTrade {
  id: string;
  ticket: string;
  signalId: string;
  direction: AlphaOmegaDirection;
  entryAt: string;
  entryPrice: number;
}

async function loadOverFires(sb: SupabaseClient, sinceIso: string): Promise<Fire[]> {
  const out: Fire[] = [];
  for (let offset = 0; ; offset += 1000) {
    const { data, error } = await sb
      .from('bridge_trade_log')
      .select(
        'signal_id,direction,signal_received_at,created_at,entry_price,fill_price',
      )
      .eq('engine_id', 'omega')
      .eq('decision', 'SKIPPED')
      .eq('block_reason', ALPHAOMEGA_SHADOW_OVER_OBSERVED_REASON)
      .gte('created_at', sinceIso)
      .order('created_at', { ascending: true })
      .range(offset, offset + 999);
    if (error) throw new Error(error.message);
    if (!data?.length) break;
    for (const row of data) {
      const signalId = row.signal_id != null ? String(row.signal_id) : '';
      const direction = toDir(row.direction != null ? String(row.direction) : null);
      if (!signalId || !direction) continue;
      const mark =
        row.fill_price != null
          ? Number(row.fill_price)
          : row.entry_price != null
            ? Number(row.entry_price)
            : null;
      out.push({
        signalId,
        direction,
        firedAt: String(row.signal_received_at ?? row.created_at),
        mark: mark != null && Number.isFinite(mark) ? mark : null,
        source: 'over_threshold',
      });
    }
    if (data.length < 1000) break;
  }
  return out;
}

async function buildObserveQualityFires(
  sb: SupabaseClient,
  sinceIso: string,
): Promise<Fire[]> {
  const { fires: canonical } = await loadCanonicalStreakFires(sinceIso);
  const bySignal = new Map<string, Fire>();
  for (const f of canonical) {
    bySignal.set(f.signalId, {
      signalId: f.signalId,
      direction: f.direction,
      firedAt: f.firedAt,
      mark: f.entryPrice,
      source: 'matched',
    });
  }
  for (const f of await loadOverFires(sb, sinceIso)) {
    if (!bySignal.has(f.signalId)) bySignal.set(f.signalId, f);
  }
  return [...bySignal.values()].sort(
    (a, b) => Date.parse(a.firedAt) - Date.parse(b.firedAt),
  );
}

async function loadStuckTrades(sb: SupabaseClient): Promise<StuckTrade[]> {
  const { data, error } = await sb
    .from('bridge_trade_log')
    .select(
      'id,signal_id,oanda_trade_id,direction,entry_price,fill_price,signal_received_at,created_at,status,broker_id',
    )
    .eq('broker_id', OMEGA_AO_SHADOW_BROKER_ID)
    .eq('status', 'open')
    .order('created_at', { ascending: true });
  if (error) throw new Error(error.message);
  const out: StuckTrade[] = [];
  for (const row of data ?? []) {
    if (row.broker_id !== OMEGA_AO_SHADOW_BROKER_ID) continue;
    const direction = toDir(String(row.direction));
    const entryPrice = Number(row.fill_price ?? row.entry_price);
    if (!direction || !Number.isFinite(entryPrice)) continue;
    out.push({
      id: String(row.id),
      ticket: String(row.oanda_trade_id ?? ''),
      signalId: String(row.signal_id ?? ''),
      direction,
      entryAt: String(row.signal_received_at ?? row.created_at),
      entryPrice,
    });
  }
  return out;
}

function reconstructExit(trade: StuckTrade, fires: readonly Fire[]) {
  const entryMs = Date.parse(trade.entryAt);
  let opposing = 0;
  let total = 0;
  let streak: StreakState = emptyStreakState();

  for (const fire of fires) {
    if (Date.parse(fire.firedAt) >= entryMs) break;
    if (fire.signalId === trade.signalId) continue;
    const { nextState } = processFireForStreak(streak, {
      direction: fire.direction,
      firedAt: fire.firedAt,
      signalId: fire.signalId,
    });
    streak = nextState;
  }

  for (const fire of fires) {
    if (Date.parse(fire.firedAt) <= entryMs) continue;
    if (fire.signalId === trade.signalId) continue;

    const { nextState, crack } = processFireForStreak(streak, {
      direction: fire.direction,
      firedAt: fire.firedAt,
      signalId: fire.signalId,
    });
    streak = nextState;

    opposing += fire.direction !== trade.direction ? 1 : 0;
    total += 1;
    const exitPrice = fire.mark ?? trade.entryPrice;

    let trigger: string | null = null;
    if (crack && crack.brokenDirection === trade.direction) {
      trigger = ALPHAOMEGA_CLOSE_BACKSTOP_CRACK;
    } else if (opposing >= OPPOSING_FIRE_COUNT_THRESHOLD) {
      trigger = ALPHAOMEGA_CLOSE_OPPOSING_COUNT;
    } else if (
      total >= OPPOSING_SHARE_MIN_FIRES &&
      opposing / total >= OPPOSING_SHARE_THRESHOLD
    ) {
      trigger = ALPHAOMEGA_CLOSE_OPPOSING_SHARE;
    }
    if (!trigger) continue;

    return {
      stillOpen: false as const,
      closeReason: trigger,
      exitAt: fire.firedAt,
      exitPrice,
      pnlPips: signedPips(trade.direction, trade.entryPrice, exitPrice),
      holdMinutes: Math.round((Date.parse(fire.firedAt) - entryMs) / 60_000),
    };
  }

  return { stillOpen: true as const };
}

async function main() {
  loadEnv();
  const sb = createClient(
    process.env.SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_KEY!,
    { auth: { persistSession: false } },
  );

  const beforeLiveOpen = await sb
    .from('bridge_trade_log')
    .select('id', { count: 'exact', head: true })
    .in('broker_id', ['oanda_phase2_demo', 'vtmarkets_ao_live'])
    .eq('decision', 'EXECUTED')
    .eq('status', 'open');

  const stuck = await loadStuckTrades(sb);
  if (stuck.length === 0) {
    console.log(JSON.stringify({ apply: APPLY, stuck: 0, message: 'nothing to backfill' }));
    return;
  }

  const since = stuck[0]!.entryAt;
  const fires = await buildObserveQualityFires(sb, since);
  const plans = stuck.map((trade) => {
    const recon = reconstructExit(trade, fires);
    return { trade, recon };
  });

  const closable = plans.filter((p) => !p.recon.stillOpen);
  const unclosed = plans.filter((p) => p.recon.stillOpen);

  const report = {
    apply: APPLY,
    fireTape: {
      since,
      count: fires.length,
      matched: fires.filter((f) => f.source === 'matched').length,
      over: fires.filter((f) => f.source === 'over_threshold').length,
    },
    beforeLiveOpenCount: beforeLiveOpen.count,
    plans: plans.map((p) => ({
      id: p.trade.id,
      ticket: p.trade.ticket,
      entryAt: p.trade.entryAt,
      dir: p.trade.direction,
      recon: p.recon,
    })),
    closable: closable.length,
    unclosed: unclosed.length,
    applied: [] as Array<Record<string, unknown>>,
  };

  if (APPLY) {
    for (const plan of closable) {
      const recon = plan.recon;
      if (recon.stillOpen) continue;
      const { data, error } = await sb
        .from('bridge_trade_log')
        .update({
          status: 'closed',
          closed_at: recon.exitAt,
          close_reason: recon.closeReason,
          exit_price: recon.exitPrice,
          pnl_pips: recon.pnlPips,
        })
        .eq('id', plan.trade.id)
        .eq('broker_id', OMEGA_AO_SHADOW_BROKER_ID)
        .eq('status', 'open')
        .select('id,status,pnl_pips,close_reason,exit_price,closed_at');
      report.applied.push({
        id: plan.trade.id,
        error: error?.message ?? null,
        rows: data,
      });
    }
    // Clear any orphan shadow positions (should already be empty).
    await sb
      .from('alpha_omega_shadow_position_state')
      .delete()
      .eq('broker_id', OMEGA_AO_SHADOW_BROKER_ID);
  }

  const afterShadow = await sb
    .from('bridge_trade_log')
    .select('id,status,pnl_pips,close_reason')
    .eq('broker_id', OMEGA_AO_SHADOW_BROKER_ID)
    .order('created_at', { ascending: true });
  const afterLiveOpen = await sb
    .from('bridge_trade_log')
    .select('id', { count: 'exact', head: true })
    .in('broker_id', ['oanda_phase2_demo', 'vtmarkets_ao_live'])
    .eq('decision', 'EXECUTED')
    .eq('status', 'open');

  const finalReport = {
    ...report,
    afterShadow: afterShadow.data,
    afterLiveOpenCount: afterLiveOpen.count,
    liveOpenUnchanged: beforeLiveOpen.count === afterLiveOpen.count,
  };

  mkdirSync('scripts/output', { recursive: true });
  writeFileSync(
    'scripts/output/ao_shadow_paper_backfill.json',
    JSON.stringify(finalReport, null, 2),
  );
  console.log(JSON.stringify(finalReport, null, 2));
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
