import { getSupabaseClient } from '../../connectors/supabase.js';
import { computePdlSweepSignal } from './computeConditions.js';
import { fetchDetectorM5Candles } from './fetchLiveM5Window.js';
import { fetchPriorDayLow } from './priorDayLow.js';
import { parseChartOhlc } from './parseChartOhlc.js';
import {
  PDL_SWEEP_PAIR,
  PDL_SWEEP_TABLE,
} from './pdlSweepConstants.js';
import { sendPdlSweepFireAlert } from './pdlSweepTelegram.js';
import { runSchemaPreflight } from './schemaPreflight.js';
import { validateDetectorM5Candles } from './validateM5Candles.js';

let preflightDone = false;

function utcTradeDate(): string {
  return new Date().toISOString().slice(0, 10);
}

async function fetchTodayAmdContext(tradeDate: string) {
  const supabase = getSupabaseClient();
  const { data, error } = await supabase
    .from('amd_state')
    .select(
      'evaluated_at, chart_data, amd_outcome_tag, decision_auto_direction, auto_direction_confidence',
    )
    .eq('pair', PDL_SWEEP_PAIR)
    .eq('trade_date', tradeDate)
    .maybeSingle();

  if (error || !data) {
    console.warn(`[PdlSweep] amd_state missing for ${tradeDate}:`, error?.message);
    return null;
  }

  if (data.evaluated_at == null) {
    console.warn(`[PdlSweep] evaluated_at null for ${tradeDate} — 10:31 detection not run`);
    return { evaluated: false as const, data };
  }

  return { evaluated: true as const, data };
}

async function upsertPdlSweepRow(tradeDate: string, computed: ReturnType<typeof computePdlSweepSignal>) {
  const supabase = getSupabaseClient();
  const { error } = await supabase.from(PDL_SWEEP_TABLE).upsert(
    {
      trade_date: tradeDate,
      pair: PDL_SWEEP_PAIR,
      prior_day_low: computed.prior_day_low,
      price_at_1155: computed.price_at_1155,
      pdl_sweep_depth_pips: computed.pdl_sweep_depth_pips,
      london_net_pips: computed.london_net_pips,
      london_direction: computed.london_direction,
      h11_net_pips: computed.h11_net_pips,
      h11_direction: computed.h11_direction,
      signal_fired: computed.signal_fired,
      signal_direction: computed.signal_direction,
      conditions_met: computed.conditions_met,
      amd_outcome_tag: computed.amd_outcome_tag,
      decision_auto_direction: computed.decision_auto_direction,
      auto_direction_confidence: computed.auto_direction_confidence,
      evaluated_at: new Date().toISOString(),
    },
    { onConflict: 'trade_date,pair' },
  );
  if (error) throw new Error(`pdl_sweep_signals upsert failed: ${error.message}`);
}

export async function runPdlSweepDetection(): Promise<void> {
  const supabase = getSupabaseClient();
  if (!preflightDone) {
    const preflight = await runSchemaPreflight(supabase);
    if (!preflight.ok) {
      console.error('[PdlSweep] preflight failed:', preflight.reason);
      return;
    }
    preflightDone = true;
  }

  const tradeDate = utcTradeDate();
  console.log(`[PdlSweep] detection start ${tradeDate}`);

  try {
    const priorDayLow = await fetchPriorDayLow(supabase, tradeDate);
    const detectorCandles = await fetchDetectorM5Candles(tradeDate);
    const candleCheck = validateDetectorM5Candles(detectorCandles);
    if (!candleCheck.ok) {
      console.error('[PdlSweep] detector M5 validation failed:', candleCheck.reason);
      return;
    }

    const amdContext = await fetchTodayAmdContext(tradeDate);
    const h1Bars = amdContext?.evaluated
      ? parseChartOhlc((amdContext.data.chart_data ?? null) as Record<string, unknown> | null)
      : [];

    const amdRow = amdContext?.data;
    const computed = computePdlSweepSignal({
      priorDayLow,
      detectorCandles,
      h1Bars: amdContext?.evaluated ? h1Bars : [],
      amdOutcomeTag: (amdRow?.amd_outcome_tag as string | null) ?? null,
      decisionAutoDirection: (amdRow?.decision_auto_direction as string | null) ?? null,
      autoDirectionConfidence: (amdRow?.auto_direction_confidence as string | null) ?? null,
    });

    await upsertPdlSweepRow(tradeDate, computed);
    console.log(
      `[PdlSweep] row written signal_fired=${computed.signal_fired} ` +
      `depth=${computed.pdl_sweep_depth_pips} h11=${computed.h11_direction}`,
    );

    if (computed.signal_fired) {
      await sendPdlSweepFireAlert(tradeDate, computed);
    }
  } catch (err) {
    console.error('[PdlSweep] detection error:', err);
  }
}
