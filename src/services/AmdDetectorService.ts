/**
 * AmdDetectorService — daily H1 advisory snapshot for AUD_USD (logging only).
 * Does not gate, resize, or redirect execution.
 */

import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { fetchCompletedCandles } from '../connectors/oanda.js';
import { computeDateFeatures, type OhlcCandle } from './amdDetector/amdFeatures.js';
import { buildAmdChartDataPayload } from './amdDetector/amdChartPayload.js';
import type { AmdDateFeatures } from './amdDetector/amdTypes.js';
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
};

async function persistAmdInsightRow(insertOpts: InsertAmdOpts): Promise<void> {
  const {
    amdSupabase,
    tradeDate,
    evaluatedAtISO,
    candlesForChart,
    features,
  } = insertOpts;
  const chartPayload = buildAmdChartDataPayload(
    tradeDate,
    candlesForChart,
    features
  );

  const { error } = await amdSupabase.from('amd_state').upsert(
    {
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
      chart_url: null,
      chart_generated_at: null,
      chart_data: chartPayload,
    },
    { onConflict: 'trade_date,pair' }
  );

  if (error) {
    console.error('[AmdDetector] Write to amd_state failed:', error.message);
    return;
  }

  const flatDisp = `${features.asian_is_flat}`;
  console.log(
    `[AmdDetector] ${tradeDate} | ${features.amd_tag} | ` +
      `range=${features.asian_range_pips} flat=${flatDisp} | ` +
      `judas=${features.judas_direction ?? 'null'} ` +
      `${features.judas_pips ?? 'null'}pips | ` +
      `reversal=${features.reversal_confirmed ?? 'null'} | ` +
      `chart=none`
  );
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

export async function runAmdDetection(): Promise<void> {
  const evaluatedAtISO = new Date().toISOString();
  const tradeDate = utcTradeDateStamp();

  console.log(`[AmdDetector] Running for ${AUD_AMD_PAIR} UTC date ${tradeDate}`);

  const supabaseDb = buildAmdSupabaseClient();
  const h1Pull = await pullAudUsdH1ForAmd(tradeDate);
  if (h1Pull === null) return;

  if (h1Pull.length === 0) {
    const emptyFeatures = computeDateFeatures(
      [],
      (badCandle, warnReason) => {
        console.warn(`[AmdDetector] Candle issue: ${warnReason}`, badCandle.time);
      }
    );
    await persistAmdInsightRow({
      amdSupabase: supabaseDb,
      tradeDate,
      evaluatedAtISO,
      candlesForChart: [],
      features: emptyFeatures,
    });
    try {
      await sendAmdTelegramAlert(tradeDate, emptyFeatures);
    } catch (tgErr: unknown) {
      console.warn('[AmdDetector] Telegram alert failed:', tgErr);
    }
    return;
  }

  const features = computeDateFeatures(h1Pull, (badHourCandle, candleReason) => {
    console.warn(`[AmdDetector] Candle issue: ${candleReason}`, badHourCandle.time);
  });

  await persistAmdInsightRow({
    amdSupabase: supabaseDb,
    tradeDate,
    evaluatedAtISO,
    candlesForChart: h1Pull,
    features,
  });

  try {
    await sendAmdTelegramAlert(tradeDate, features);
  } catch (tgErr: unknown) {
    console.warn('[AmdDetector] Telegram alert failed:', tgErr);
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
