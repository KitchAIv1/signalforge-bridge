/**
 * MT5 startup visibility — log resolved routes and optionally probe MetaApi (non-blocking).
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import { isMt5GloballyEnabled } from '../../connectors/broker/brokerFactory.js';
import type { BrokerClient } from '../../connectors/broker/types.js';
import { logInfo, logWarn } from '../../utils/logger.js';
import { loadExecutionRoutes } from './brokerLinkService.js';

const MT5_PROBE_ENGINES = ['omega', 'audusd_fade'] as const;
const METAAPI_PROBE_TIMEOUT_MS = 45_000;

type Mt5ProbeEngineId = (typeof MT5_PROBE_ENGINES)[number];

async function fetchActiveVtLinkIds(
  supabase: SupabaseClient,
  engineIds: Mt5ProbeEngineId[],
): Promise<Map<string, string[]>> {
  const { data, error } = await supabase
    .from('bridge_links')
    .select('engine_id, broker_id')
    .in('engine_id', engineIds)
    .eq('is_active', true)
    .like('broker_id', 'vtmarkets_%');
  if (error) throw new Error(`mt5 startup vt links: ${error.message}`);

  const vtLinksByEngine = new Map<string, string[]>();
  for (const row of data ?? []) {
    const engineId = String(row.engine_id);
    const prior = vtLinksByEngine.get(engineId) ?? [];
    prior.push(String(row.broker_id));
    vtLinksByEngine.set(engineId, prior);
  }
  return vtLinksByEngine;
}

function warnMissingVtRoutes(
  engineId: string,
  configuredVtBrokers: string[],
  resolvedBrokers: string[],
): void {
  const missing = configuredVtBrokers.filter((brokerId) => !resolvedBrokers.includes(brokerId));
  if (!missing.length) return;
  logWarn(`[MT5] ${engineId} VT links active but routes missing`, {
    missingBrokers: missing,
    hint: 'Check MT5_ENABLED=true, METAAPI_* account IDs, bridge_brokers.is_active',
  });
}

async function collectMt5BrokersForEngine(
  supabase: SupabaseClient,
  engineId: Mt5ProbeEngineId,
  configuredVtBrokers: string[],
  mt5BrokersById: Map<string, BrokerClient>,
): Promise<void> {
  const routes = await loadExecutionRoutes(supabase, engineId);
  const resolvedBrokers = routes.map((route) => route.brokerId);
  logInfo(`[MT5] ${engineId} execution routes`, { brokers: resolvedBrokers });
  warnMissingVtRoutes(engineId, configuredVtBrokers, resolvedBrokers);

  for (const route of routes) {
    if (route.broker.brokerType !== 'mt5') continue;
    if (!mt5BrokersById.has(route.brokerId)) {
      mt5BrokersById.set(route.brokerId, route.broker);
    }
  }
}

async function probeMt5BrokerEquity(brokerId: string, broker: BrokerClient): Promise<void> {
  try {
    const summary = await withTimeout(
      broker.getAccountSummary(),
      METAAPI_PROBE_TIMEOUT_MS,
      `MetaApi account summary (${brokerId})`,
    );
    const openTrades = await withTimeout(
      broker.getOpenTrades(),
      METAAPI_PROBE_TIMEOUT_MS,
      `MetaApi open positions (${brokerId})`,
    );
    logInfo(`[MT5] MetaApi connected — ${brokerId}`, {
      equity: summary.equity,
      balance: summary.balance,
      openTrades: openTrades.length,
    });
  } catch (err) {
    logWarn(`[MT5] MetaApi probe failed — ${brokerId}`, { error: String(err) });
  }
}

function probeMt5BrokersInBackground(mt5BrokersById: Map<string, BrokerClient>): void {
  void (async () => {
    for (const [brokerId, broker] of mt5BrokersById) {
      await probeMt5BrokerEquity(brokerId, broker);
    }
  })().catch((err) => logWarn('[MT5] Background MetaApi probe failed', { error: String(err) }));
}

function withTimeout<T>(promise: Promise<T>, timeoutMs: number, label: string): Promise<T> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(
      () => reject(new Error(`${label} timed out after ${timeoutMs}ms`)),
      timeoutMs,
    );
    promise.then(
      (value) => {
        clearTimeout(timer);
        resolve(value);
      },
      (err) => {
        clearTimeout(timer);
        reject(err);
      },
    );
  });
}

export async function runMt5StartupDiagnostics(
  supabase: SupabaseClient,
  activeEngineIds: string[],
): Promise<void> {
  const mt5Enabled = isMt5GloballyEnabled();
  logInfo('[MT5] Startup config', {
    enabled: mt5Enabled,
    envSymbolSuffixFallback: process.env.VT_SYMBOL_SUFFIX ?? '(unset → default -STD)',
    note: 'Per-broker bridge_brokers.symbol_suffix wins over VT_SYMBOL_SUFFIX',
    region: process.env.METAAPI_REGION ?? 'london',
    omegaAccountConfigured: Boolean(process.env.METAAPI_OMEGA_ACCOUNT_ID?.trim()),
    fadeAccountConfigured: Boolean(process.env.METAAPI_FADE_ACCOUNT_ID?.trim()),
  });

  const enginesToProbe = MT5_PROBE_ENGINES.filter((engineId) =>
    activeEngineIds.includes(engineId),
  );
  if (!enginesToProbe.length) {
    logInfo('[MT5] omega and audusd_fade inactive — skipping route summary');
    return;
  }

  if (!mt5Enabled) {
    logInfo('[MT5] Execution disabled — OANDA-only until MT5_ENABLED=true');
  }

  let vtLinksByEngine: Map<string, string[]>;
  try {
    vtLinksByEngine = await fetchActiveVtLinkIds(supabase, enginesToProbe);
  } catch (err) {
    logWarn('[MT5] Failed to read VT bridge_links', { error: String(err) });
    return;
  }

  const mt5BrokersById = new Map<string, BrokerClient>();
  for (const engineId of enginesToProbe) {
    try {
      await collectMt5BrokersForEngine(
        supabase,
        engineId,
        vtLinksByEngine.get(engineId) ?? [],
        mt5BrokersById,
      );
    } catch (err) {
      logWarn(`[MT5] Failed to load routes for ${engineId}`, { error: String(err) });
    }
  }

  if (mt5Enabled && !mt5BrokersById.size) {
    logWarn('[MT5] MT5_ENABLED but no MT5 broker clients resolved');
    return;
  }

  if (mt5BrokersById.size) {
    logInfo('[MT5] MetaApi probe starting (background)', {
      brokers: [...mt5BrokersById.keys()],
    });
    probeMt5BrokersInBackground(mt5BrokersById);
  }
}
