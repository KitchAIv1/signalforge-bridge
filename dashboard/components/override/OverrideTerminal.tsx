'use client';

import { useCallback, useState } from 'react';
import { OverrideChart } from '@/components/override/OverrideChart';
import { OverrideLanePanel } from '@/components/override/OverrideLanePanel';
import {
  ALPHAOMEGA_BANNER_LABEL,
  OMEGA_LANE_B_BROKER_ID,
} from '@/lib/omegaLaneBConstants';
import { OMEGA_LANE_A_BROKER_ID } from '@/lib/overrideBrokerScope';
import type { EnrichedLiveTrade } from '@/lib/overrideTradeLogEnrichment';

function buildTradeLines(
  trades: EnrichedLiveTrade[],
): Array<{ price: number; label: string; color: string }> {
  const lines: Array<{ price: number; label: string; color: string }> = [];
  for (const trade of trades) {
    const dir = parseFloat(trade.units) > 0 ? 'L' : 'S';
    if (trade.price) {
      lines.push({
        price: parseFloat(trade.price),
        label: `Entry ${dir}`,
        color: '#94a3b8',
      });
    }
    if (trade.stopLossPrice) {
      lines.push({
        price: parseFloat(trade.stopLossPrice),
        label: 'SL',
        color: '#ef4444',
      });
    }
    if (trade.takeProfitPrice) {
      lines.push({
        price: parseFloat(trade.takeProfitPrice),
        label: 'TP',
        color: '#10b981',
      });
    }
  }
  return lines;
}

export function OverrideTerminal() {
  const [laneATrades, setLaneATrades] = useState<EnrichedLiveTrade[]>([]);
  const [laneBTrades, setLaneBTrades] = useState<EnrichedLiveTrade[]>([]);
  const onLaneATrades = useCallback((trades: EnrichedLiveTrade[]) => {
    setLaneATrades(trades);
  }, []);
  const onLaneBTrades = useCallback((trades: EnrichedLiveTrade[]) => {
    setLaneBTrades(trades);
  }, []);

  return (
    <div className="flex flex-col gap-4">
      <OverrideChart tradeLines={buildTradeLines([...laneATrades, ...laneBTrades])} />

      <OverrideLanePanel
        brokerId={OMEGA_LANE_A_BROKER_ID}
        title="Omega (Lane A)"
        subtitle="oanda_practice — trail / max-hold exits"
        groupBySignal
        onTradesChange={onLaneATrades}
      />

      <OverrideLanePanel
        brokerId={OMEGA_LANE_B_BROKER_ID}
        title={ALPHAOMEGA_BANNER_LABEL}
        subtitle="oanda_phase2_demo (AUD_NEWWWW) — own balance & PnL"
        groupBySignal={false}
        manualCloseNote="Manual close bypasses ALPHAOMEGA opposing-fire / hard-stop / backstop exits."
        onTradesChange={onLaneBTrades}
      />
    </div>
  );
}
