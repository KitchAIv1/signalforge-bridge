/**
 * AmdDetectorService — daily H1 advisory snapshot for AUD_USD (logging only).
 * Does not gate, resize, or redirect execution.
 */

import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { fetchCompletedCandles } from '../connectors/oanda.js';
import { computeDateFeatures, type OhlcCandle } from './amdDetector/amdFeatures.js';
import { buildAmdChartDataPayload } from './amdDetector/amdChartPayload.js';
import { deriveJudasTiming } from './amdDetector/judasTimingDeriver.js';
import type {
  AmdAutoDirectionSnapshot,
  AmdDailyBiasSnapshot,
  AmdDateFeatures,
  AmdM5Signal,
  DailyBiasAlignment,
  JudasDirection,
  Layer4D1Bias,
} from './amdDetector/amdTypes.js';
import {
  applyAutoDirectionToBridgeConfig,
  computeAutoDirectionSnapshot,
  type AmdDirectionAlertContext,
} from './amdDetector/amdAutoDirection.js';
import {
  fetchExistingDecisionSnapshot,
  resolveDecisionSnapshotFields,
  type DecisionSnapshotFields,
} from './amdDetector/amdDecisionSnapshot.js';
import {
  buildInitialDetectionLockFields,
  shouldSkipAmdDetectionForLockedRow,
} from './amdDetector/amdDetectionLock.js';
import {
  sendAmdDetectionRerunBlockedAlert,
  sendAmdTelegramAlert,
} from './amdDetector/sendAmdTelegramAlert.js';
import { applyAsianCloseAdvisory } from './amdDetector/asianCloseAdvisory.js';
import { logInfo } from '../utils/logger.js';

const AUD_AMD_PAIR = 'AUD_USD';

// V5 fix: in-memory mutex to prevent concurrent detection runs
let amdDetectionInProgress = false;
let amdOutcomeInProgress = false;

function buildAmdSupabaseClient() {
  const supabaseUrl = process.env.SUPABASE_URL;
  const supabaseKey =
    process.env.SUPABASE_SERVICE_ROLE_KEY ?? process.env.SUPABASE_SERVICE_KEY;
  if (!supabaseUrl || !supabaseKey) {
    throw new Error('[AmdDetector] Missing SUPABASE_URL or service key env var');
  }
  return createClient(supabaseUrl, supabaseKey);
}

function utcTradeDateStamp(): string {
  return new Date().toISOString().slice(0, 10);
}

function amdH1FetchWindow(tradeDay: string): { fromISO: string; toISO: string } {
  return {
    fromISO: `${tradeDay}T00:00:00.000000000Z`,
    toISO: `${tradeDay}T10:30:00.000000000Z`,
  };
}

function isExecutedAsCliModule(): boolean {
  const entry = process.argv[1] ?? '';
  return (
    entry.includes('services/AmdDetectorService') ||
    entry.endsWith('/AmdDetectorService.ts') ||
    entry.endsWith('\\AmdDetectorService.ts')
  );
}

type InsertAmdOpts = {
  amdSupabase: SupabaseClient;
  tradeDate: string;
  evaluatedAtISO: string;
  candlesForChart: OhlcCandle[];
  features: AmdDateFeatures;
  dailyBias: AmdDailyBiasSnapshot;
  autoDir: AmdAutoDirectionSnapshot;
  m5Signal: AmdM5Signal;
};

type PersistAmdRowOpts = InsertAmdOpts & {
  decisionSnapshot: DecisionSnapshotFields;
};

function buildAmdStateUpsertRow(insertOpts: PersistAmdRowOpts) {
  const { tradeDate, evaluatedAtISO, candlesForChart, features, dailyBias, decisionSnapshot } =
    insertOpts;
  const chartPayload = buildAmdChartDataPayload(
    tradeDate,
    candlesForChart,
    features,
  );
  const { hour: judas_extreme_utc_hour, timing: judas_timing } = deriveJudasTiming(
    chartPayload,
    features.judas_direction,
    features.judas_extreme_price,
  );
  return {
    trade_date: tradeDate,
    evaluated_at: evaluatedAtISO,
    pair: AUD_AMD_PAIR,
    asian_range_pips: features.asian_range_pips,
    asian_net_pips: features.asian_net_pips,
    asian_is_flat: features.asian_is_flat,
    accumulation_quality_score: features.accumulation_quality_score ?? null,
    judas_direction: features.judas_direction,
    judas_pips: features.judas_pips,
    judas_extreme_price: features.judas_extreme_price,
    judas_extreme_utc_hour,
    judas_timing,
    reversal_confirmed: features.reversal_confirmed,
    compression_breakout: features.compression_breakout,
    delayed_distribution: features.delayed_distribution,
    amd_tag: features.amd_tag,
    layer4_d1_bias: dailyBias.layer4_d1_bias,
    layer4_bullish_count: dailyBias.layer4_bullish_count,
    layer4_bearish_count: dailyBias.layer4_bearish_count,
    layer4_bullish_count_7: dailyBias.layer4_bullish_count_7,
    layer4_bearish_count_7: dailyBias.layer4_bearish_count_7,
    layer4_d1_bias_7: dailyBias.layer4_d1_bias_7,
    daily_bias_alignment: dailyBias.daily_bias_alignment,
    chart_url: null,
    chart_generated_at: null,
    chart_data: chartPayload,
    auto_direction: insertOpts.autoDir.auto_direction,
    auto_direction_confidence: insertOpts.autoDir.auto_direction_confidence,
    auto_direction_reason: insertOpts.autoDir.auto_direction_reason,
    amd_size_multiplier: insertOpts.autoDir.amd_size_multiplier,
    m5_first_3_net_pips: insertOpts.m5Signal.m5_first_3_net_pips,
    m5_vs_judas_direction: insertOpts.m5Signal.m5_vs_judas_direction,
    m5_first_candle_direction:
      insertOpts.m5Signal.m5_first_candle_direction,
    m5_w2_net_pips: insertOpts.m5Signal?.m5_w2_net_pips ?? null,
    m5_momentum_type: insertOpts.m5Signal?.m5_momentum_type ?? null,
    m5_evaluated_at: insertOpts.m5Signal.m5_evaluated_at,
    judas_to_range_ratio: insertOpts.autoDir.judas_to_range_ratio ?? null,
    asian_drift_ratio: insertOpts.autoDir.asian_drift_ratio ?? null,
    asian_dominance_ratio: insertOpts.autoDir.asian_dominance_ratio ?? null,
    market_structure_type: insertOpts.autoDir.market_structure_type ?? null,
    asian_net_direction: insertOpts.autoDir.asian_net_direction ?? null,
    asian_close_position_pct: features.asian_close_position_pct ?? null,
    asian_close_bias_signal: features.asian_close_bias_signal ?? null,
    decision_auto_direction: decisionSnapshot.decision_auto_direction,
    decision_evaluated_at: decisionSnapshot.decision_evaluated_at,
    ...buildInitialDetectionLockFields(evaluatedAtISO),
  };
}

function logAmdPersistSummary(insertOpts: InsertAmdOpts): void {
  const { tradeDate, features, dailyBias, autoDir } = insertOpts;
  const flatDisp = `${features.asian_is_flat}`;
  console.log(
    `[AmdDetector] ${tradeDate} | ${features.amd_tag} | ` +
      `range=${features.asian_range_pips} flat=${flatDisp} | ` +
      `judas=${features.judas_direction ?? 'null'} ` +
      `${features.judas_pips ?? 'null'}pips | ` +
      `reversal=${features.reversal_confirmed ?? 'null'} | ` +
      `D1=${dailyBias.layer4_d1_bias ?? 'null'} ` +
      `(${dailyBias.layer4_bullish_count ?? '—'}↑/${dailyBias.layer4_bearish_count ?? '—'}↓) ` +
      `D7=${dailyBias.layer4_d1_bias_7 ?? 'null'} ` +
      `(${dailyBias.layer4_bullish_count_7 ?? '—'}↑/${dailyBias.layer4_bearish_count_7 ?? '—'}↓) | ` +
      `bias_align=${dailyBias.daily_bias_alignment ?? 'null'} | ` +
      `chart=none | ` +
      `auto=${autoDir.auto_direction} (${autoDir.auto_direction_confidence})` +
      ` | m5=${insertOpts.m5Signal.m5_vs_judas_direction ?? 'null'} ` +
      `(${insertOpts.m5Signal.m5_first_3_net_pips ?? '—'}pips)`,
  );
}

async function persistAmdInsightRow(insertOpts: InsertAmdOpts): Promise<boolean> {
  const { amdSupabase, tradeDate, autoDir, evaluatedAtISO } = insertOpts;
  const existingSnapshot = await fetchExistingDecisionSnapshot(amdSupabase, tradeDate);
  const decisionSnapshot = resolveDecisionSnapshotFields(
    existingSnapshot,
    autoDir,
    evaluatedAtISO,
  );
  const upsertRow = buildAmdStateUpsertRow({ ...insertOpts, decisionSnapshot });
  const { error } = await amdSupabase
    .from('amd_state')
    .upsert(upsertRow, { onConflict: 'trade_date,pair' });

  if (error) {
    console.error('[AmdDetector] Write to amd_state failed:', error.message);
    return false;
  }

  logAmdPersistSummary(insertOpts);
  return true;
}

function countTrendVotesFromD1Bars(
  bars: ReadonlyArray<{ mid: { o: string; c: string } }>,
): { bullishCount: number; bearishCount: number } {
  let bullishCount = 0;
  let bearishCount = 0;
  for (const candleEntry of bars) {
    const openPx = parseFloat(candleEntry.mid.o);
    const closePx = parseFloat(candleEntry.mid.c);
    if (!Number.isFinite(openPx) || !Number.isFinite(closePx)) continue;
    if (closePx > openPx) {
      bullishCount++;
    } else if (closePx < openPx) {
      bearishCount++;
    }
  }
  return { bullishCount, bearishCount };
}

function computeDailyBiasAlignment(
  judasDirection: JudasDirection | null,
  layer4D1Bias: Layer4D1Bias,
): DailyBiasAlignment {
  if (!judasDirection || judasDirection === 'FLAT') return null;
  if (!layer4D1Bias) return null;
  if (layer4D1Bias === 'RANGING') return 'RANGING';
  if (judasDirection === 'UP') {
    if (layer4D1Bias === 'TRENDING_DOWN') return 'ALIGNED';
    if (layer4D1Bias === 'TRENDING_UP') return 'CONFLICTED';
  }
  if (judasDirection === 'DOWN') {
    if (layer4D1Bias === 'TRENDING_UP') return 'ALIGNED';
    if (layer4D1Bias === 'TRENDING_DOWN') return 'CONFLICTED';
  }
  return null;
}

function emptyD1VoteCounts(): Pick<
  AmdDailyBiasSnapshot,
  | 'layer4_d1_bias'
  | 'layer4_bullish_count'
  | 'layer4_bearish_count'
  | 'layer4_bullish_count_7'
  | 'layer4_bearish_count_7'
  | 'layer4_d1_bias_7'
> {
  return {
    layer4_d1_bias: null,
    layer4_bullish_count: null,
    layer4_bearish_count: null,
    layer4_bullish_count_7: null,
    layer4_bearish_count_7: null,
    layer4_d1_bias_7: null,
  };
}

function d1BiasVotesFromBars(
  completedBars: ReadonlyArray<{ mid: { o: string; h: string; l: string; c: string } }>,
): Pick<
  AmdDailyBiasSnapshot,
  | 'layer4_d1_bias'
  | 'layer4_bullish_count'
  | 'layer4_bearish_count'
  | 'layer4_bullish_count_7'
  | 'layer4_bearish_count_7'
  | 'layer4_d1_bias_7'
> {
  if (completedBars.length === 0) {
    return emptyD1VoteCounts();
  }

  const last5 = completedBars.slice(-5);
  const { bullishCount: bull5, bearishCount: bear5 } =
    countTrendVotesFromD1Bars(last5);
  const layer4_d1_bias: Layer4D1Bias =
    bull5 >= 3 ? 'TRENDING_UP' : bear5 >= 3 ? 'TRENDING_DOWN' : 'RANGING';

  let bull7: number | null = null;
  let bear7: number | null = null;
  let bias7: Layer4D1Bias = null;

  if (completedBars.length >= 7) {
    const last7 = completedBars.slice(-7);
    const votes7 = countTrendVotesFromD1Bars(last7);
    bull7 = votes7.bullishCount;
    bear7 = votes7.bearishCount;
    bias7 =
      bull7 >= 4 ? 'TRENDING_UP' : bear7 >= 4 ? 'TRENDING_DOWN' : 'RANGING';
  }

  return {
    layer4_d1_bias,
    layer4_bullish_count: bull5,
    layer4_bearish_count: bear5,
    layer4_bullish_count_7: bull7,
    layer4_bearish_count_7: bear7,
    layer4_d1_bias_7: bias7,
  };
}

async function fetchD1BiasVotesForTradeDate(
  pair: string,
  tradeDate: string,
): Promise<
  Pick<
    AmdDailyBiasSnapshot,
    | 'layer4_d1_bias'
    | 'layer4_bullish_count'
    | 'layer4_bearish_count'
    | 'layer4_bullish_count_7'
    | 'layer4_bearish_count_7'
    | 'layer4_d1_bias_7'
  >
> {
  try {
    const tradeDateMs = Date.parse(`${tradeDate}T00:00:00.000Z`);
    const rangeStartUtc = new Date(tradeDateMs - 21 * 24 * 3600 * 1000);
    const fromISO =
      rangeStartUtc.toISOString().split('T')[0] + 'T00:00:00.000000000Z';
    const toISO = `${tradeDate}T00:00:00.000000000Z`;
    const d1Bars = await fetchCompletedCandles(pair, 'D', fromISO, toISO);
    return d1BiasVotesFromBars(d1Bars);
  } catch (biasErr: unknown) {
    console.warn(
      '[AmdDetector] D1 bias fetch failed — counts null:',
      biasErr instanceof Error ? biasErr.message : biasErr,
    );
    return emptyD1VoteCounts();
  }
}

async function buildDailyBiasSnapshot(
  pair: string,
  tradeDate: string,
  judasDirection: JudasDirection | null,
): Promise<AmdDailyBiasSnapshot> {
  const votesRow = await fetchD1BiasVotesForTradeDate(pair, tradeDate);
  return {
    ...votesRow,
    daily_bias_alignment: computeDailyBiasAlignment(
      judasDirection,
      votesRow.layer4_d1_bias,
    ),
  };
}

async function pullAudUsdH1ForAmd(dayStamp: string): Promise<OhlcCandle[] | null> {
  try {
    const fetchWindow = amdH1FetchWindow(dayStamp);
    return await fetchCompletedCandles(
      AUD_AMD_PAIR,
      'H1',
      fetchWindow.fromISO,
      fetchWindow.toISO
    );
  } catch (pullErr: unknown) {
    console.warn('[AmdDetector] H1 fetch failed — advisory skipped:', pullErr);
    return null;
  }
}

async function fetchAmdM5Signal(
  tradeDate: string,
  judasDirection: JudasDirection | null,
): Promise<AmdM5Signal> {
  const empty: AmdM5Signal = {
    m5_first_3_net_pips: null,
    m5_vs_judas_direction: null,
    m5_first_candle_direction: null,
    m5_w2_net_pips: null,
    m5_momentum_type: null,
    m5_evaluated_at: null,
  };

  if (!judasDirection || judasDirection === 'FLAT') {
    return empty;
  }

  try {
    const fromISO = `${tradeDate}T10:00:00.000000000Z`;
    const toISO = `${tradeDate}T10:30:00.000000000Z`;
    const raw = await fetchCompletedCandles(
      AUD_AMD_PAIR,
      'M5',
      fromISO,
      toISO,
    );

    if (!raw || raw.length === 0) return empty;

    const candles = raw
      .map((c) => ({
        o: parseFloat(c.mid.o),
        c: parseFloat(c.mid.c),
        time: c.time,
      }))
      .sort(
        (a, b) =>
          new Date(a.time).getTime() - new Date(b.time).getTime(),
      );

    if (candles.length === 0) return empty;

    const first = candles[0];
    const firstThree = candles.slice(0, 3);

    const netPips =
      firstThree.reduce((sum, candle) => sum + (candle.c - candle.o), 0) *
      10000;

    const firstBody = Math.abs(first.c - first.o);
    const firstDir: 'bullish' | 'bearish' | 'doji' =
      firstBody < 0.0002
        ? 'doji'
        : first.c > first.o
          ? 'bullish'
          : 'bearish';

    const netDir: 'bullish' | 'bearish' | 'neutral' =
      netPips > 1 ? 'bullish' : netPips < -1 ? 'bearish' : 'neutral';

    let m5VsJudas: 'WITH_JUDAS' | 'AGAINST_JUDAS' | 'NEUTRAL';
    if (netDir === 'neutral') {
      m5VsJudas = 'NEUTRAL';
    } else if (judasDirection === 'UP') {
      m5VsJudas = netDir === 'bearish' ? 'AGAINST_JUDAS' : 'WITH_JUDAS';
    } else {
      m5VsJudas = netDir === 'bullish' ? 'AGAINST_JUDAS' : 'WITH_JUDAS';
    }

    let m5_w2_net_pips: number | null = null;
    let m5_momentum_type: 'SUSTAINED' | 'REVERSED' | 'STALLED' | null = null;

    if (candles.length >= 6) {
      const secondThree = candles.slice(3, 6);
      const w2NetPips =
        secondThree.reduce((sum, candle) => sum + (candle.c - candle.o), 0) *
        10000;
      m5_w2_net_pips = parseFloat(w2NetPips.toFixed(4));

      const w1Dir = netPips > 1 ? 'UP' : netPips < -1 ? 'DOWN' : 'FLAT';
      const w2Dir = w2NetPips > 1 ? 'UP' : w2NetPips < -1 ? 'DOWN' : 'FLAT';

      if (w1Dir === 'FLAT' || w2Dir === 'FLAT') {
        m5_momentum_type = 'STALLED';
      } else if (w1Dir === w2Dir) {
        m5_momentum_type = 'SUSTAINED';
      } else {
        m5_momentum_type = 'REVERSED';
      }
    }

    return {
      m5_first_3_net_pips: parseFloat(netPips.toFixed(4)),
      m5_vs_judas_direction: m5VsJudas,
      m5_first_candle_direction: firstDir,
      m5_w2_net_pips,
      m5_momentum_type,
      m5_evaluated_at: new Date().toISOString(),
    };
  } catch {
    return empty;
  }
}

async function recordAmdInsightForEmptyH1(
  supabaseDb: SupabaseClient,
  tradeDate: string,
  evaluatedAtISO: string,
): Promise<void> {
  const emptyFeatures = computeDateFeatures(
    [],
    (badCandle, warnReason) => {
      console.warn(`[AmdDetector] Candle issue: ${warnReason}`, badCandle.time);
    },
  );
  const emptyDailyBias = await buildDailyBiasSnapshot(
    AUD_AMD_PAIR,
    tradeDate,
    emptyFeatures.judas_direction,
  );
  const emptyM5Signal: AmdM5Signal = {
    m5_first_3_net_pips: null,
    m5_vs_judas_direction: null,
    m5_first_candle_direction: null,
    m5_w2_net_pips: null,
    m5_momentum_type: null,
    m5_evaluated_at: null,
  };
  let autoDir = computeAutoDirectionSnapshot(
    emptyFeatures.amd_tag,
    emptyFeatures.judas_direction,
    emptyDailyBias.layer4_d1_bias,
    emptyDailyBias.layer4_bullish_count,
    emptyDailyBias.layer4_bearish_count,
    emptyDailyBias.layer4_bullish_count_7,
    emptyDailyBias.layer4_bearish_count_7,
    emptyDailyBias.daily_bias_alignment,
    emptyFeatures.reversal_confirmed,
    emptyFeatures.judas_pips,
    null,
    emptyFeatures.asian_range_pips,
    emptyFeatures.asian_net_pips,
  );
  autoDir = applyAsianCloseAdvisory(
    autoDir,
    emptyFeatures.asian_close_bias_signal ?? null,
    emptyFeatures.asian_close_position_pct ?? null,
  );
  const persisted = await persistAmdInsightRow({
    amdSupabase: supabaseDb,
    tradeDate,
    evaluatedAtISO,
    candlesForChart: [],
    features: emptyFeatures,
    dailyBias: emptyDailyBias,
    autoDir,
    m5Signal: emptyM5Signal,
  });
  if (persisted) {
    const alertCtx: AmdDirectionAlertContext = {
      confidence: autoDir.auto_direction_confidence,
      multiplier: autoDir.amd_size_multiplier,
      amdTag: emptyFeatures.amd_tag,
    };
    await applyAutoDirectionToBridgeConfig(
      supabaseDb,
      autoDir.auto_direction,
      autoDir.auto_direction_reason,
      alertCtx,
    );
  }
  try {
    const { hour: judas_extreme_utc_hour, timing: judas_timing } = deriveJudasTiming(
      buildAmdChartDataPayload(tradeDate, [], emptyFeatures),
      emptyFeatures.judas_direction,
      emptyFeatures.judas_extreme_price,
    );
    await sendAmdTelegramAlert(tradeDate, {
      ...emptyFeatures,
      judas_timing,
      judas_extreme_utc_hour,
    });
  } catch (tgErr: unknown) {
    console.warn('[AmdDetector] Telegram alert failed:', tgErr);
  }
}

async function recordAmdInsightForH1Window(
  supabaseDb: SupabaseClient,
  tradeDate: string,
  evaluatedAtISO: string,
  h1Pull: OhlcCandle[],
): Promise<void> {
  const features = computeDateFeatures(h1Pull, (badHourCandle, candleReason) => {
    console.warn(`[AmdDetector] Candle issue: ${candleReason}`, badHourCandle.time);
  });

  const filledDailyBias = await buildDailyBiasSnapshot(
    AUD_AMD_PAIR,
    tradeDate,
    features.judas_direction,
  );

  const m5Signal = await fetchAmdM5Signal(
    tradeDate,
    features.judas_direction,
  );

  let autoDir = computeAutoDirectionSnapshot(
    features.amd_tag,
    features.judas_direction,
    filledDailyBias.layer4_d1_bias,
    filledDailyBias.layer4_bullish_count,
    filledDailyBias.layer4_bearish_count,
    filledDailyBias.layer4_bullish_count_7,
    filledDailyBias.layer4_bearish_count_7,
    filledDailyBias.daily_bias_alignment,
    features.reversal_confirmed,
    features.judas_pips,
    m5Signal.m5_vs_judas_direction,
    features.asian_range_pips,
    features.asian_net_pips,
  );
  autoDir = applyAsianCloseAdvisory(
    autoDir,
    features.asian_close_bias_signal ?? null,
    features.asian_close_position_pct ?? null,
  );

  const persisted = await persistAmdInsightRow({
    amdSupabase: supabaseDb,
    tradeDate,
    evaluatedAtISO,
    candlesForChart: h1Pull,
    features,
    dailyBias: filledDailyBias,
    autoDir,
    m5Signal,
  });

  if (persisted) {
    const alertCtx: AmdDirectionAlertContext = {
      confidence: autoDir.auto_direction_confidence,
      multiplier: autoDir.amd_size_multiplier,
      amdTag: features.amd_tag,
    };
    await applyAutoDirectionToBridgeConfig(
      supabaseDb,
      autoDir.auto_direction,
      autoDir.auto_direction_reason,
      alertCtx,
    );
  }

  try {
    const { hour: judas_extreme_utc_hour, timing: judas_timing } = deriveJudasTiming(
      buildAmdChartDataPayload(tradeDate, h1Pull, features),
      features.judas_direction,
      features.judas_extreme_price,
    );
    await sendAmdTelegramAlert(tradeDate, {
      ...features,
      judas_timing,
      judas_extreme_utc_hour,
    });
  } catch (tgErr: unknown) {
    console.warn('[AmdDetector] Telegram alert failed:', tgErr);
  }
}

export async function runAmdDetection(): Promise<void> {
  if (amdDetectionInProgress) {
    console.log('[AmdDetector] Detection already in progress — skipping concurrent run');
    return;
  }
  amdDetectionInProgress = true;

  try {
    const evaluatedAtISO = new Date().toISOString();
    const tradeDate = utcTradeDateStamp();

    console.log(`[AmdDetector] Running for ${AUD_AMD_PAIR} UTC date ${tradeDate}`);

    const supabaseDb = buildAmdSupabaseClient();

    const { data: existingRow } = await supabaseDb
      .from('amd_state')
      .select('detection_locked, detection_locked_at, detection_locked_reason')
      .eq('trade_date', tradeDate)
      .eq('pair', AUD_AMD_PAIR)
      .maybeSingle();

    if (shouldSkipAmdDetectionForLockedRow(existingRow)) {
      logInfo(
        `[AmdDetector] detection_locked=true for ${tradeDate} ` +
          `(locked at ${existingRow!.detection_locked_at}, ` +
          `reason: ${existingRow!.detection_locked_reason}) — skipping direction overwrite`,
      );
      try {
        await sendAmdDetectionRerunBlockedAlert(
          tradeDate,
          existingRow!.detection_locked_at,
          existingRow!.detection_locked_reason,
        );
      } catch (tgErr: unknown) {
        console.warn('[AmdDetector] Rerun-blocked Telegram alert failed:', tgErr);
      }
      return;
    }

    const h1Pull = await pullAudUsdH1ForAmd(tradeDate);
    if (h1Pull === null) return;

    if (h1Pull.length === 0) {
      await recordAmdInsightForEmptyH1(supabaseDb, tradeDate, evaluatedAtISO);
      return;
    }

    await recordAmdInsightForH1Window(supabaseDb, tradeDate, evaluatedAtISO, h1Pull);
  } finally {
    amdDetectionInProgress = false;
  }
}

export async function runAmdOutcomeDetection(): Promise<void> {
  if (amdOutcomeInProgress) {
    console.log('[AmdOutcome] Outcome detection already in progress — skipping');
    return;
  }
  amdOutcomeInProgress = true;

  try {
    const evaluatedAtISO = new Date().toISOString();
    const tradeDate = utcTradeDateStamp();

    console.log(
      `[AmdOutcome] Running for ${AUD_AMD_PAIR} UTC date ${tradeDate}`,
    );

    const supabaseDb = buildAmdSupabaseClient();

    const { data: existing, error: fetchErr } = await supabaseDb
      .from('amd_state')
      .select('id, amd_tag, judas_direction')
      .eq('pair', AUD_AMD_PAIR)
      .eq('trade_date', tradeDate)
      .maybeSingle();

    if (fetchErr || !existing) {
      console.log(
        `[AmdOutcome] No amd_state row for ${tradeDate} — skipping`,
      );
      return;
    }

    const outcomeEligible = [
      'AMD_FAILED',
      'AMD_TEXTBOOK',
      'AMD_COMPRESSION_BREAKOUT',
    ];
    if (!outcomeEligible.includes(existing.amd_tag as string)) {
      console.log(
        `[AmdOutcome] Tag ${existing.amd_tag as string} ` +
          `not outcome-eligible — skipping`,
      );
      return;
    }

    try {
      const fromISO = `${tradeDate}T00:00:00.000000000Z`;
      const toISO = `${tradeDate}T16:30:00.000000000Z`;
      const h1Full = await fetchCompletedCandles(
        AUD_AMD_PAIR,
        'H1',
        fromISO,
        toISO,
      );

      if (!h1Full || h1Full.length === 0) {
        console.log(
          `[AmdOutcome] No H1 data for ${tradeDate} — skipping`,
        );
        return;
      }

      const outcomeFeatures = computeDateFeatures(h1Full, (badCandle, reason) => {
        console.warn(`[AmdOutcome] Bad candle: ${reason}`, badCandle.time);
      });

      const { error: updateErr } = await supabaseDb
        .from('amd_state')
        .update({
          amd_outcome_tag: outcomeFeatures.amd_tag,
          reversal_confirmed_outcome: outcomeFeatures.reversal_confirmed,
          compression_breakout_outcome: outcomeFeatures.compression_breakout,
          outcome_evaluated_at: evaluatedAtISO,
          detection_locked: false,
          detection_locked_at: null,
          detection_locked_reason: null,
        })
        .eq('pair', AUD_AMD_PAIR)
        .eq('trade_date', tradeDate);

      if (updateErr) {
        console.error('[AmdOutcome] Update failed:', updateErr.message);
        return;
      }

      console.log(
        `[AmdOutcome] ${tradeDate} | ` +
          `live=${existing.amd_tag as string} | ` +
          `outcome=${outcomeFeatures.amd_tag} | ` +
          `reversal=${outcomeFeatures.reversal_confirmed ?? 'null'} | ` +
          `compression=${outcomeFeatures.compression_breakout}`,
      );
    } catch (err: unknown) {
      console.error(
        '[AmdOutcome] Error:',
        err instanceof Error ? err.message : err,
      );
    }
  } finally {
    amdOutcomeInProgress = false;
  }
}

if (isExecutedAsCliModule()) {
  void runAmdDetection()
    .then(() => process.exit(0))
    .catch((runErr: unknown) => {
      console.error(runErr);
      process.exit(1);
    });
}
