/** Optimal entry windows per AMD tag — from 272-day micro backtest */
export const OPTIMAL_WINDOWS: Record<string, { entry: number; exit: number }> = {
  AMD_COMPRESSION_BREAKOUT: { entry: 10, exit: 13 },
  AMD_TEXTBOOK: { entry: 12, exit: 13 },
  AMD_SHIFTED: { entry: 12, exit: 13 },
  AMD_FAILED: { entry: 11, exit: 12 },
  AMD_NONE: { entry: 10, exit: 13 },
};
