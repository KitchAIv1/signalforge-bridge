import { firstHourEightBar } from './parseChartOhlc.js';
import { LONDON_DIR_THRESHOLD_PIPS } from './pdlSweepConstants.js';
import { netToDirection, sessionDirection, sumBodyPips } from './m5PipUtils.js';
import type { ChartOhlcBar, PdlSweepComputed, StoredM5Candle } from './pdlSweepTypes.js';

type ComputeInput = {
  priorDayLow: number | null;
  detectorCandles: StoredM5Candle[];
  h1Bars: ChartOhlcBar[];
  amdOutcomeTag: string | null;
  decisionAutoDirection: string | null;
  autoDirectionConfidence: string | null;
};

export function computePdlSweepSignal(input: ComputeInput): PdlSweepComputed {
  const priceAt1155 = parseFloat(input.detectorCandles[23].c);
  const depthPips = input.priorDayLow != null
    ? Math.round((input.priorDayLow - priceAt1155) * 10000 * 10) / 10
    : null;

  const hourEight = firstHourEightBar(input.h1Bars);
  const londonOpen = hourEight ? parseFloat(hourEight.o) : null;
  const londonClose = parseFloat(input.detectorCandles[23].c);
  const londonNet = londonOpen != null
    ? Math.round((londonClose - londonOpen) * 10000 * 10) / 10
    : null;
  const londonDirection = londonNet == null
    ? null
    : sessionDirection(londonNet, LONDON_DIR_THRESHOLD_PIPS);

  const h11Net = sumBodyPips(input.detectorCandles, 12, 23);
  const h11Direction = netToDirection(h11Net);

  const pdlBreach = input.priorDayLow != null && priceAt1155 < input.priorDayLow;
  const londonDown = londonDirection === 'DOWN';
  const h11Up = h11Direction === 'UP';
  const signalFired = pdlBreach && londonDown && h11Up;

  return {
    prior_day_low: input.priorDayLow,
    price_at_1155: priceAt1155,
    pdl_sweep_depth_pips: depthPips,
    london_net_pips: londonNet,
    london_direction: londonDirection,
    h11_net_pips: h11Net,
    h11_direction: h11Direction,
    signal_fired: signalFired,
    signal_direction: signalFired ? 'long' : null,
    conditions_met: { pdl_breach: pdlBreach, london_down: londonDown, h11_up: h11Up },
    amd_outcome_tag: input.amdOutcomeTag,
    decision_auto_direction: input.decisionAutoDirection,
    auto_direction_confidence: input.autoDirectionConfidence,
  };
}
