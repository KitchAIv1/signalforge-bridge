export type JudasDirection = 'UP' | 'DOWN' | 'FLAT';

export type AmdTradePhase =
  | 'ASIAN_ACCUMULATION'
  | 'LONDON_MANIPULATION'
  | 'DISTRIBUTION'
  | 'NY_CONTINUATION'
  | 'OTHER';

export type SessionDirectionAlignment = 'ALIGNED' | 'COUNTER' | 'UNKNOWN';

export type AmdTag =
  | 'INSUFFICIENT_DATA'
  | 'AMD_TEXTBOOK' // Tight Asian + Judas spike + reversal confirmed
  | 'AMD_COMPRESSION_BREAKOUT' // Tight Asian + London breakout + continuation (no reversal)
  | 'AMD_FAILED' // Tight Asian + Judas present + no reversal + no continuation
  | 'AMD_PARTIAL' // Tight Asian + Judas too small + reversal null
  | 'AMD_DELAYED' // Tight Asian + flat London + NY-driven move
  | 'AMD_SHIFTED' // Moderate Asian range 35-50 pips — partial structure
  | 'AMD_NONE'; // Wide Asian > 50 pips — no AMD structure

export type DateFeatures = {
  asian_range_pips: number | null;
  asian_net_pips: number | null;
  asian_is_flat: boolean;
  judas_direction: JudasDirection | null;
  judas_pips: number | null;
  reversal_confirmed: boolean | null;
  compression_breakout: boolean;
  delayed_distribution: boolean;
  amd_tag: AmdTag;
};

export type TradeRowOut = {
  trade_id: string;
  created_at: string;
  direction: string;
  pnl_r: number;
  amd_tag: AmdTag;
  amd_trade_phase: AmdTradePhase;
  asian_range_pips: number | null;
  judas_direction: JudasDirection | null;
  judas_pips: number | null;
  reversal_confirmed: boolean | null;
  session_direction_alignment: SessionDirectionAlignment;
};
