export interface LiveExecution {
  created_at: string;
  direction: string;
  status: string;
  block_reason: string | null;
  fill_price: number | null;
  exit_price: number | null;
  pnl_r: number | null;
  pnl_dollars: number | null;
  result: string | null;
  close_reason: string | null;
  signal_session: string | null;
  amd_tag: string | null;
  decision: string;
  entry_price: number | null;
}

export interface ShadowSignal {
  fired_at: string;
  direction: string;
  entry_price: number;
  sl_price: number;
  session: string;
  regime: string;
  mfe_r: number | null;
  mae_r: number | null;
}

export interface OmegaInverseStats {
  totalLiveSignals: number;
  totalExecuted: number;
  totalBlocked: number;
  totalShadow: number;
  longToShortCount: number;
  shortToLongCount: number;
}

export interface OmegaInverseData {
  liveExecutions: LiveExecution[];
  shadowSignals: ShadowSignal[];
  omegaDirection: 'long' | 'short' | null;
  validUntil: string | null;
  stats: OmegaInverseStats;
}
