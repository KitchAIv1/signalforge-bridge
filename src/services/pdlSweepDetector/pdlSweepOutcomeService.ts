import { getSupabaseClient } from '../../connectors/supabase.js';
import { fetchOutcomeM5Candles } from './fetchLiveM5Window.js';
import { netToDirection, sumBodyPips } from './m5PipUtils.js';
import {
  PDL_SWEEP_PAIR,
  PDL_SWEEP_TABLE,
} from './pdlSweepConstants.js';
import { sendPdlSweepOutcomeAlert } from './pdlSweepTelegram.js';
import { validateOutcomeM5Candles } from './validateM5Candles.js';

function utcTradeDate(): string {
  return new Date().toISOString().slice(0, 10);
}

export async function runPdlSweepOutcome(): Promise<void> {
  const tradeDate = utcTradeDate();
  const supabase = getSupabaseClient();

  const { data: row, error } = await supabase
    .from(PDL_SWEEP_TABLE)
    .select('signal_fired, signal_direction')
    .eq('pair', PDL_SWEEP_PAIR)
    .eq('trade_date', tradeDate)
    .maybeSingle();

  if (error || !row?.signal_fired) return;

  try {
    const outcomeCandles = await fetchOutcomeM5Candles(tradeDate);
    const candleCheck = validateOutcomeM5Candles(outcomeCandles);
    if (!candleCheck.ok) {
      console.error('[PdlSweep] outcome M5 validation failed:', candleCheck.reason);
      return;
    }

    const h12Net = sumBodyPips(outcomeCandles, 0, 11);
    const h12Direction = netToDirection(h12Net);
    const evaluatedAt = new Date().toISOString();

    const { error: updateErr } = await supabase
      .from(PDL_SWEEP_TABLE)
      .update({
        outcome_h12_net_pips: h12Net,
        outcome_h12_direction: h12Direction,
        outcome_evaluated_at: evaluatedAt,
      })
      .eq('pair', PDL_SWEEP_PAIR)
      .eq('trade_date', tradeDate);

    if (updateErr) {
      console.error('[PdlSweep] outcome update failed:', updateErr.message);
      return;
    }

    const correct = row.signal_direction === 'long' && h12Direction === 'UP';
    await sendPdlSweepOutcomeAlert(tradeDate, h12Direction, h12Net, correct);
    console.log(`[PdlSweep] outcome ${tradeDate} h12=${h12Direction} ${h12Net}p correct=${correct}`);
  } catch (err) {
    console.error('[PdlSweep] outcome error:', err);
  }
}
