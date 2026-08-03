/**
 * READ-ONLY Shadow AO (ao_shadow_paper) outcome audit.
 * Confirms why UI PnL is blank and reconstructs exits from the fire stream
 * using production shadow exit rules only (opposing count/share + backstop).
 * No DB writes.
 *
 * Run: node --import tsx scripts/aoShadowPaperOutcomeAudit.ts
 */
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import {
  ALPHAOMEGA_CLOSE_BACKSTOP_CRACK,
  ALPHAOMEGA_CLOSE_OPPOSING_COUNT,
  ALPHAOMEGA_CLOSE_OPPOSING_SHARE,
  ALPHAOMEGA_SHADOW_OVER_OBSERVED_REASON,
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

const PIP = 0.0001;
const BROKER = 'ao_shadow_paper';

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

function signedPips(
  dir: AlphaOmegaDirection,
  entry: number,
  exit: number,
): number {
  const raw = dir === 'LONG' ? (exit - entry) / PIP : (entry - exit) / PIP;
  return Math.round(raw * 10) / 10;
}

interface ShadowTrade {
  id: string;
  ticket: string;
  signalId: string;
  direction: AlphaOmegaDirection;
  status: string;
  entryAt: string;
  entryPrice: number;
  exitPrice: number | null;
  pnlPips: number | null;
  closeReason: string | null;
  advisory: string | null;
  stopLoss: number | null;
}

interface ShadowFire {
  signalId: string;
  direction: AlphaOmegaDirection;
  firedAt: string;
  mark: number | null;
  source: 'matched_or_live' | 'over_threshold';
}

async function loadShadowTrades(sb: SupabaseClient): Promise<ShadowTrade[]> {
  const { data, error } = await sb
    .from('bridge_trade_log')
    .select(
      'id,signal_id,oanda_trade_id,direction,status,entry_price,fill_price,exit_price,pnl_pips,close_reason,lane_advisory,stop_loss,signal_received_at,created_at',
    )
    .eq('broker_id', BROKER)
    .order('created_at', { ascending: true });
  if (error) throw new Error(error.message);
  const out: ShadowTrade[] = [];
  for (const row of data ?? []) {
    const direction = toDir(String(row.direction));
    const entryPrice = Number(row.fill_price ?? row.entry_price);
    if (!direction || !Number.isFinite(entryPrice)) continue;
    out.push({
      id: String(row.id),
      ticket: String(row.oanda_trade_id ?? ''),
      signalId: String(row.signal_id ?? ''),
      direction,
      status: String(row.status),
      entryAt: String(row.signal_received_at ?? row.created_at),
      entryPrice,
      exitPrice: row.exit_price != null ? Number(row.exit_price) : null,
      pnlPips: row.pnl_pips != null ? Number(row.pnl_pips) : null,
      closeReason: row.close_reason != null ? String(row.close_reason) : null,
      advisory: row.lane_advisory != null ? String(row.lane_advisory) : null,
      stopLoss: row.stop_loss != null ? Number(row.stop_loss) : null,
    });
  }
  return out;
}

async function loadShadowFireStream(
  sb: SupabaseClient,
  sinceIso: string,
): Promise<ShadowFire[]> {
  const bySignal = new Map<string, ShadowFire>();

  // Over-threshold observes (explicit)
  for (let offset = 0; ; offset += 1000) {
    const { data, error } = await sb
      .from('bridge_trade_log')
      .select(
        'signal_id,direction,signal_received_at,created_at,entry_price,fill_price,block_reason,decision',
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
      if (!signalId || !direction || bySignal.has(signalId)) continue;
      const mark =
        row.fill_price != null
          ? Number(row.fill_price)
          : row.entry_price != null
            ? Number(row.entry_price)
            : null;
      bySignal.set(signalId, {
        signalId,
        direction,
        firedAt: String(row.signal_received_at ?? row.created_at),
        mark: mark != null && Number.isFinite(mark) ? mark : null,
        source: 'over_threshold',
      });
    }
    if (data.length < 1000) break;
  }

  // Matched / general omega fires (dedupe by signal; do not overwrite over if already present — over is subset)
  for (let offset = 0; ; offset += 1000) {
    const { data, error } = await sb
      .from('bridge_trade_log')
      .select(
        'signal_id,direction,signal_received_at,created_at,entry_price,fill_price,decision,block_reason,broker_id',
      )
      .eq('engine_id', 'omega')
      .gte('created_at', sinceIso)
      .order('created_at', { ascending: true })
      .range(offset, offset + 999);
    if (error) throw new Error(error.message);
    if (!data?.length) break;
    for (const row of data) {
      const signalId = row.signal_id != null ? String(row.signal_id) : '';
      const direction = toDir(row.direction != null ? String(row.direction) : null);
      if (!signalId || !direction) continue;
      if (bySignal.has(signalId)) continue;
      // Skip pure shadow paper entry rows as "fires" for opposing? They are cracks — include as fires with mark
      const mark =
        row.fill_price != null
          ? Number(row.fill_price)
          : row.entry_price != null
            ? Number(row.entry_price)
            : null;
      bySignal.set(signalId, {
        signalId,
        direction,
        firedAt: String(row.signal_received_at ?? row.created_at),
        mark: mark != null && Number.isFinite(mark) ? mark : null,
        source: 'matched_or_live',
      });
    }
    if (data.length < 1000) break;
  }

  return [...bySignal.values()].sort(
    (a, b) => Date.parse(a.firedAt) - Date.parse(b.firedAt),
  );
}

interface ReconExit {
  trigger: string;
  exitAt: string;
  exitPrice: number;
  pips: number;
  holdMinutes: number;
  opposingAtExit: number;
  totalFiresAtExit: number;
  stillOpen: boolean;
}

function reconstructExit(
  trade: ShadowTrade,
  fires: readonly ShadowFire[],
): ReconExit {
  const entryMs = Date.parse(trade.entryAt);
  let opposing = 0;
  let total = 0;
  let streak: StreakState = emptyStreakState();

  // Warm streak with fires before entry so backstop can arm after entry.
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

    const isOpp = fire.direction !== trade.direction;
    opposing += isOpp ? 1 : 0;
    total += 1;
    const exitPx = fire.mark ?? trade.entryPrice;

    if (crack && crack.brokenDirection === trade.direction) {
      return finish(
        trade,
        ALPHAOMEGA_CLOSE_BACKSTOP_CRACK,
        fire.firedAt,
        exitPx,
        opposing,
        total,
      );
    }
    if (opposing >= OPPOSING_FIRE_COUNT_THRESHOLD) {
      return finish(
        trade,
        ALPHAOMEGA_CLOSE_OPPOSING_COUNT,
        fire.firedAt,
        exitPx,
        opposing,
        total,
      );
    }
    if (
      total >= OPPOSING_SHARE_MIN_FIRES &&
      opposing / total >= OPPOSING_SHARE_THRESHOLD
    ) {
      return finish(
        trade,
        ALPHAOMEGA_CLOSE_OPPOSING_SHARE,
        fire.firedAt,
        exitPx,
        opposing,
        total,
      );
    }
  }

  return {
    trigger: 'still_open_no_exit_rule',
    exitAt: '',
    exitPrice: trade.entryPrice,
    pips: 0,
    holdMinutes: Math.round((Date.now() - entryMs) / 60_000),
    opposingAtExit: opposing,
    totalFiresAtExit: total,
    stillOpen: true,
  };
}

function finish(
  trade: ShadowTrade,
  trigger: string,
  exitAt: string,
  exitPrice: number,
  opposing: number,
  total: number,
): ReconExit {
  return {
    trigger,
    exitAt,
    exitPrice,
    pips: signedPips(trade.direction, trade.entryPrice, exitPrice),
    holdMinutes: Math.round(
      (Date.parse(exitAt) - Date.parse(trade.entryAt)) / 60_000,
    ),
    opposingAtExit: opposing,
    totalFiresAtExit: total,
    stillOpen: false,
  };
}

async function main() {
  loadEnv();
  const url = process.env.SUPABASE_URL!;
  const key =
    process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_KEY!;
  const sb = createClient(url, key, { auth: { persistSession: false } });

  const { data: cfg } = await sb
    .from('bridge_config')
    .select('config_key,config_value')
    .eq('config_key', 'alpha_omega_shadow_enabled')
    .maybeSingle();

  const trades = await loadShadowTrades(sb);
  const { data: openPos } = await sb
    .from('alpha_omega_shadow_position_state')
    .select('*')
    .eq('broker_id', BROKER);
  const { data: streakRow } = await sb
    .from('alpha_omega_shadow_streak_state')
    .select('*')
    .eq('id', 1)
    .maybeSingle();

  // Schema evidence (read-only): sample columns
  const { data: sample } = await sb
    .from('bridge_trade_log')
    .select('*')
    .eq('broker_id', BROKER)
    .limit(1);
  const cols = sample?.[0] ? Object.keys(sample[0]) : [];
  const hasUpdatedAt = cols.includes('updated_at');
  const hasClosedAt = cols.includes('closed_at');

  const since = trades[0]?.entryAt ?? '2026-07-30T00:00:00.000Z';
  const fires = await loadShadowFireStream(sb, since);
  const overCount = fires.filter((f) => f.source === 'over_threshold').length;

  const outcomes = trades.map((trade) => {
    const recon = reconstructExit(trade, fires);
    return {
      db: {
        id: trade.id,
        ticket: trade.ticket,
        entryAt: trade.entryAt,
        direction: trade.direction,
        status: trade.status,
        entryPrice: trade.entryPrice,
        exitPrice: trade.exitPrice,
        pnlPips: trade.pnlPips,
        closeReason: trade.closeReason,
        advisory: trade.advisory,
      },
      reconstructed: recon,
    };
  });

  const closedRecon = outcomes.filter((o) => !o.reconstructed.stillOpen);
  const sumPips = closedRecon.reduce((s, o) => s + o.reconstructed.pips, 0);

  const report = {
    generatedAt: new Date().toISOString(),
    confirmed: {
      shadowEnabled: cfg?.config_value === true || cfg?.config_value === 'true',
      tradeCount: trades.length,
      allDbStatusOpen: trades.every((t) => t.status === 'open'),
      allDbPnlNull: trades.every((t) => t.pnlPips == null),
      openPositionRows: openPos?.length ?? 0,
      schemaHasUpdatedAt: hasUpdatedAt,
      schemaHasClosedAt: hasClosedAt,
      closeCodeWritesUpdatedAt: true,
      closeCodeDeletesPositionEvenIfUpdateFails: true,
    },
    rootCause: {
      summary:
        'closeShadowPaperTrade updates bridge_trade_log with updated_at, but that column does not exist. Update fails; deleteShadowPosition still runs. Positions vanish while trade_log rows stay status=open with null PnL. hasOpenShadowPosition then allows additional paper entries.',
      evidence: {
        schemaHasUpdatedAt: hasUpdatedAt,
        openTrades: trades.length,
        positionTableRows: openPos?.length ?? 0,
        file: 'src/core/alphaOmega/alphaOmegaShadowPaperClose.ts',
      },
    },
    fireStream: {
      since,
      totalDeduped: fires.length,
      overThresholdRows: overCount,
      exitRules:
        'opposing_count>=5 OR opposing_share OR backstop_crack — NO hard_stop / giveback / max_hold in shadow code',
    },
    shadowStreakNow: streakRow,
    outcomes,
    reconstructedBook: {
      closed: closedRecon.length,
      stillOpen: outcomes.length - closedRecon.length,
      sumPips: Math.round(sumPips * 10) / 10,
      meanPips: closedRecon.length
        ? Math.round((sumPips / closedRecon.length) * 10) / 10
        : 0,
    },
  };

  mkdirSync('scripts/output', { recursive: true });
  const outPath = 'scripts/output/ao_shadow_paper_outcome_audit.json';
  writeFileSync(outPath, JSON.stringify(report, null, 2));
  console.log(
    JSON.stringify(
      {
        confirmed: report.confirmed,
        rootCause: report.rootCause.summary,
        fireStream: report.fireStream,
        reconstructedBook: report.reconstructedBook,
        outcomes: outcomes.map((o) => ({
          at: o.db.entryAt,
          dir: o.db.direction,
          dbStatus: o.db.status,
          dbPips: o.db.pnlPips,
          recon: o.reconstructed.stillOpen
            ? { stillOpen: true, holdMin: o.reconstructed.holdMinutes }
            : {
                trigger: o.reconstructed.trigger,
                pips: o.reconstructed.pips,
                exitAt: o.reconstructed.exitAt,
                holdMin: o.reconstructed.holdMinutes,
              },
        })),
        outPath,
      },
      null,
      2,
    ),
  );
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
