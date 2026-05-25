import { getSupabase } from '@/lib/supabase';

export type OmegaWindowType = 'ASIAN' | 'AMD' | 'EXPIRED' | 'UNKNOWN';

export interface OmegaWindowStatus {
  isActive: boolean;
  direction: string | null;
  validUntil: string | null;
  windowType: OmegaWindowType;
  minutesRemaining: number | null;
}

function parseValidUntilIso(raw: unknown): string | null {
  if (typeof raw !== 'string') return null;
  return raw.replace(/^"|"$/g, '') || null;
}

function resolveWindowType(isActive: boolean, validUntilStr: string | null): OmegaWindowType {
  if (!isActive || !validUntilStr) return 'EXPIRED';
  const expiryHour = new Date(validUntilStr).getUTCHours();
  if (expiryHour === 8) return 'ASIAN';
  if (expiryHour === 14) return 'AMD';
  return 'UNKNOWN';
}

const EXPIRED_STATUS: OmegaWindowStatus = {
  isActive: false,
  direction: null,
  validUntil: null,
  windowType: 'EXPIRED',
  minutesRemaining: null,
};

export async function fetchOmegaWindowStatus(): Promise<OmegaWindowStatus> {
  try {
    const supabase = getSupabase();
    const { data, error } = await supabase
      .from('bridge_config')
      .select('config_key, config_value')
      .in('config_key', ['omega_direction', 'omega_direction_valid_until']);

    if (error || !data) return EXPIRED_STATUS;

    const directionRow = data.find((r) => r.config_key === 'omega_direction');
    const validUntilRow = data.find((r) => r.config_key === 'omega_direction_valid_until');

    const direction =
      typeof directionRow?.config_value === 'string' ? directionRow.config_value : null;

    const validUntilStr = parseValidUntilIso(validUntilRow?.config_value);
    const validUntilMs = validUntilStr ? Date.parse(validUntilStr) : null;
    const nowMs = Date.now();
    const isActive = validUntilMs != null && Number.isFinite(validUntilMs) && validUntilMs > nowMs;
    const minutesRemaining =
      isActive && validUntilMs != null ? Math.round((validUntilMs - nowMs) / 60000) : null;

    return {
      isActive,
      direction,
      validUntil: validUntilStr,
      windowType: resolveWindowType(isActive, validUntilStr),
      minutesRemaining,
    };
  } catch {
    return EXPIRED_STATUS;
  }
}
