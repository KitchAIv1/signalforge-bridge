'use client';

import { useCallback, useEffect, useState } from 'react';
import { getSupabase } from '@/lib/supabase';
import { OMEGA_LANE_B_BROKER_ID } from '@/lib/omegaLaneBConstants';

interface LaneBConfigSnapshot {
  r1Enforce: boolean;
  phase2Shadow: boolean;
  phase2Enforce: boolean;
}

function parseBool(raw: unknown): boolean {
  return raw === true || raw === 'true';
}

export function Phase2FlagSummary() {
  const [laneConfig, setLaneConfig] = useState<LaneBConfigSnapshot | null>(null);

  const loadConfig = useCallback(async () => {
    const supabase = getSupabase();
    const keys = [
      'omega_lane_b_r1_enforce',
      'omega_lane_b_phase2_shadow',
      'omega_lane_b_phase2_enforce',
    ];
    const { data } = await supabase.from('bridge_config').select('config_key, config_value').in('config_key', keys);
    const map = new Map((data ?? []).map((row) => [String(row.config_key), row.config_value]));
    setLaneConfig({
      r1Enforce: parseBool(map.get('omega_lane_b_r1_enforce')),
      phase2Shadow: parseBool(map.get('omega_lane_b_phase2_shadow')),
      phase2Enforce: parseBool(map.get('omega_lane_b_phase2_enforce')),
    });
  }, []);

  useEffect(() => {
    void loadConfig();
  }, [loadConfig]);

  if (!laneConfig) return null;

  const modeLabel = laneConfig.phase2Enforce
    ? 'Phase2 ENFORCE'
    : laneConfig.phase2Shadow
      ? 'W0 SHADOW'
      : 'LOG OFF';

  return (
    <div className="rounded-lg border border-amber-500/40 bg-amber-500/5 p-4 text-sm">
      <p className="font-medium text-amber-200">Omega Lane B — {modeLabel}</p>
      <p className="mt-1 text-slate-400">
        Broker: <span className="text-slate-200">{OMEGA_LANE_B_BROKER_ID}</span> (AUD_NEWWWW)
      </p>
      <ul className="mt-2 list-inside list-disc text-slate-400">
        <li>R1 flip block: {laneConfig.r1Enforce ? 'LIVE' : 'shadow / off'}</li>
        <li>Phase2 dist skip: {laneConfig.phase2Enforce ? 'LIVE' : laneConfig.phase2Shadow ? 'shadow' : 'off'}</li>
      </ul>
      <p className="mt-2 text-xs text-slate-500">
        Lane A Activity unchanged. Shadow advisories appear in the Gate signal column on this page.
      </p>
    </div>
  );
}
