/**
 * AmdDetectorService — daily H1 advisory snapshot for AUD_USD (logging only).
 * Does not gate, resize, or redirect execution.
 */

import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { fetchCompletedCandles } from '../connectors/oanda.js';
import { computeDateFeatures, type OhlcCandle } from './amdDetector/amdFeatures.js';
import { buildAmdChartDataPayload } from './amdDetector/amdChartPayload.js';
import type {
  AmdAutoDirectionSnapshot,
  AmdDailyBiasSnapshot,
  AmdDateFeatures,
  DailyBiasAlignment,
  JudasDirection,
  Layer4D1Bias,
} from './amdDetector/amdTypes.js';
import {
  applyAutoDirectionToBridgeConfig,
  computeAutoDirectionSnapshot,
  type AmdDirectionAlertContext,
} from './amdDetector/amdAutoDirection.js';
import { sendAmdTelegramAlert } from './amdDetector/sendAmdTelegramAlert.js';

const AUD_AMD_PAIR = 'AUD_USD';

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
};

function buildAmdStateUpsertRow(insertOpts: InsertAmdOpts) {
  const { tradeDate, evaluatedAtISO, candlesForChart, features, dailyBias } =
    insertOpts;
  const chartPayload = buildAmdChartDataPayload(
    tradeDate,
    candlesForChart,
    features,
  );
  return {
    trade_date: tradeDate,
    evaluated_at: evaluatedAtISO,
    pair: AUD_AMD_PAIR,
    asian_range_pips: features.asian_range_pips,
    asian_net_pips: features.asian_net_pips,
    asian_is_flat: features.asian_is_flat,
    judas_direction: features.judas_direction,
    judas_pips: features.judas_pips,
    judas_extreme_price: features.judas_extreme_price,
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
      `auto=${autoDir.auto_direction} (${autoDir.auto_direction_confidence})`,
  );
}

async function persistAmdInsightRow(insertOpts: InsertAmdOpts): Promise<boolean> {
  const { amdSupabase } = insertOpts;
  const upsertRow = buildAmdStateUpsertRow(insertOpts);
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
  const autoDir = computeAutoDirectionSnapshot(
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
  );
  const persisted = await persistAmdInsightRow({
    amdSupabase: supabaseDb,
    tradeDate,
    evaluatedAtISO,
    candlesForChart: [],
    features: emptyFeatures,
    dailyBias: emptyDailyBias,
    autoDir,
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
    await sendAmdTelegramAlert(tradeDate, emptyFeatures);
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

  const autoDir = computeAutoDirectionSnapshot(
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
  );

  const persisted = await persistAmdInsightRow({
    amdSupabase: supabaseDb,
    tradeDate,
    evaluatedAtISO,
    candlesForChart: h1Pull,
    features,
    dailyBias: filledDailyBias,
    autoDir,
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
    await sendAmdTelegramAlert(tradeDate, features);
  } catch (tgErr: unknown) {
    console.warn('[AmdDetector] Telegram alert failed:', tgErr);
  }
}

export async function runAmdDetection(): Promise<void> {
  const evaluatedAtISO = new Date().toISOString();
  const tradeDate = utcTradeDateStamp();

  console.log(`[AmdDetector] Running for ${AUD_AMD_PAIR} UTC date ${tradeDate}`);

  const supabaseDb = buildAmdSupabaseClient();
  const h1Pull = await pullAudUsdH1ForAmd(tradeDate);
  if (h1Pull === null) return;

  if (h1Pull.length === 0) {
    await recordAmdInsightForEmptyH1(supabaseDb, tradeDate, evaluatedAtISO);
    return;
  }

  await recordAmdInsightForH1Window(supabaseDb, tradeDate, evaluatedAtISO, h1Pull);
}

if (isExecutedAsCliModule()) {
  void runAmdDetection()
    .then(() => process.exit(0))
    .catch((runErr: unknown) => {
      console.error(runErr);
      process.exit(1);
    });
}
