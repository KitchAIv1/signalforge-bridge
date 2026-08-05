'use client';

import { useBridgeConfigBoolSwitch } from '@/hooks/useBridgeConfigBoolSwitch';
import {
  AMD_DEAD_TRADE_ABORT_CONFIG_KEY,
  AMD_TRAIL_SPLIT_CONFIG_KEY,
} from '@/lib/combinedStackConfig';
import { ConfigToggleRow } from './ConfigToggleRow';

const DEAD_TRADE_TOOLTIP =
  'AMD engine: closes any trade 60m+ old that never reached 4p favorable. Live evidence: 15/15 such trades lost. Exit-only.';

const TRAIL_SPLIT_TOOLTIP =
  'AMD engine: trail arms at 6p peak and exits 4p behind peak (replay +26.5p vs coupled 5/5). OFF = legacy single-distance trail.';

const MISSING_ROW_HINT = 'Config row missing — run migration 072_amd_exit_stack.sql';

/** Config-only remotes for the 072 AMD exit levers. No exit math. */
export function AmdExitLeverToggles() {
  const deadTradeAbort = useBridgeConfigBoolSwitch(
    AMD_DEAD_TRADE_ABORT_CONFIG_KEY,
    MISSING_ROW_HINT,
  );
  const trailSplit = useBridgeConfigBoolSwitch(
    AMD_TRAIL_SPLIT_CONFIG_KEY,
    MISSING_ROW_HINT,
  );
  if (deadTradeAbort.enabled == null || trailSplit.enabled == null) return null;

  return (
    <>
      <ConfigToggleRow
        label="AMD dead-trade abort"
        tooltip={DEAD_TRADE_TOOLTIP}
        enabled={deadTradeAbort.enabled}
        isSaving={deadTradeAbort.isSaving}
        toggleError={deadTradeAbort.toggleError}
        onToggle={() => void deadTradeAbort.handleToggle()}
      />
      <ConfigToggleRow
        label="AMD trail split 6/4"
        tooltip={TRAIL_SPLIT_TOOLTIP}
        enabled={trailSplit.enabled}
        isSaving={trailSplit.isSaving}
        toggleError={trailSplit.toggleError}
        onToggle={() => void trailSplit.handleToggle()}
      />
    </>
  );
}
