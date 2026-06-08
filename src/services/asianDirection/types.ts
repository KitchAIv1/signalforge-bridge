export interface ParsedCandle {
  open: number;
  high: number;
  low: number;
  close: number;
}

export type AsianDirectionAction =
  | 'SET_LONG'
  | 'SET_SHORT'
  | 'SKIPPED_NOT_SHIFTED'
  | 'SKIPPED_NO_D1'
  | 'SKIPPED_NO_AMD'
  | 'NO_CHANGE'
  | 'ASIAN_CLOSE'
  | 'AMD_SHIFTED_FLAG_SET'
  | 'AMD_NOT_SHIFTED_FLAG_SET';

export type AsianDirectionTriggerType = 'DIRECTION_SET' | 'ASIAN_CLOSE';

export interface AsianDirectionLogRow {
  trade_date: string;
  triggered_at: string;
  trigger_type: AsianDirectionTriggerType;
  amd_tag: string | null;
  prior_d1_direction: string | null;
  prior_d1_body_pips: number | null;
  prior_d1_close: number | null;
  direction_set: string | null;
  previous_direction: string | null;
  direction_changed: boolean | null;
  action: AsianDirectionAction;
  reason: string;
  positions_closed: number | null;
  asian_session_result: string | null;
}
