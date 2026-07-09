'use client';

import { useCallback, useEffect, useState } from 'react';
import { getSupabase } from '@/lib/supabase';
import { ALPHAOMEGA_BANNER_LABEL, OMEGA_LANE_B_BROKER_ID } from '@/lib/omegaLaneBConstants';

interface AlphaOmegaConfigSnapshot {
  enabled: boolean;
}

function parseBool(raw: unknown): boolean {
  return raw === true || raw === 'true';
}

export function Phase2FlagSummary() {
  const [config, setConfig] = useState<AlphaOmegaConfigSnapshot | null>(null);

  const loadConfig = useCallback(async () => {
    const supabase = getSupabase();
    const { data } = await supabase
      .from('bridge_config')
      .select('config_value')
      .eq('config_key', 'alpha_omega_enabled')
      .maybeSingle();
    setConfig({ enabled: data ? parseBool(data.config_value) : true });
  }, []);

  useEffect(() => {
    void loadConfig();
  }, [loadConfig]);

  if (!config) return null;

  const modeLabel = config.enabled ? 'ENFORCE (streak + opposing-pressure + hard-stop)' : 'DISABLED — legacy fallback';

  return (
    <div className="rounded-lg border border-amber-500/40 bg-amber-500/5 p-4 text-sm">
      <p className="font-medium text-amber-200">{ALPHAOMEGA_BANNER_LABEL} — {modeLabel}</p>
      <p className="mt-1 text-slate-400">
        Broker: <span className="text-slate-200">{OMEGA_LANE_B_BROKER_ID}</span> (AUD_NEWWWW)
      </p>
      <ul className="mt-2 list-inside list-disc text-slate-400">
        <li>Entry: 7-in-a-row founding streak (&lt;=45min) crack, with a 30min minimum formation-speed floor</li>
        <li>Exit: 5 opposing fires, OR 10-pip hard stop (live M5 bar-walk), OR backstop reconfirm-crack</li>
      </ul>
      <p className="mt-2 text-xs text-slate-500">
        Lane A Activity unchanged. Speed-floor-only blocks are logged with a shadow advisory for ongoing comparison.
      </p>
    </div>
  );
}
