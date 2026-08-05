'use client';

import { useBridgeConfigBoolSwitch } from '@/hooks/useBridgeConfigBoolSwitch';
import { ALPHAOMEGA_AMD_DAY_GATE_CONFIG_KEY } from '@/lib/combinedStackConfig';
import { ConfigToggleRow } from './ConfigToggleRow';

const GATE_TOOLTIP =
  'Skips new AO entries on AMD_FAILED days, only for signals after the 10:31 UTC tag write. 45d counterfactual: -98.3p to +3.3p. Entry-only; exits and streak untouched.';

/** Config-only remote for alpha_omega_amd_day_gate_enabled. No gate math. */
export function AmdDayGateToggle() {
  const { enabled, toggleError, isSaving, handleToggle } = useBridgeConfigBoolSwitch(
    ALPHAOMEGA_AMD_DAY_GATE_CONFIG_KEY,
    'Config row missing — run migration 073_combined_stack.sql',
  );
  if (enabled == null) return null;

  return (
    <ConfigToggleRow
      label="AMD-day gate"
      tooltip={GATE_TOOLTIP}
      enabled={enabled}
      isSaving={isSaving}
      toggleError={toggleError}
      onToggle={() => void handleToggle()}
    />
  );
}
