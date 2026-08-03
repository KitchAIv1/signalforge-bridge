/** Shared types for AlphaOmega 2y live-parity backtest. */

export interface AoPricedFire {
  direction: 'long' | 'short';
  firedAt: string;
  entryPrice: number;
  dtwDistance?: number;
  hour20Override?: boolean;
}

export interface AoCandle {
  time: string;
  o: number;
  h: number;
  l: number;
  c: number;
}

export interface AoTrade {
  direction: 'long' | 'short';
  entryFiredAt: string;
  entryPrice: number;
  exitFiredAt: string;
  exitPrice: number;
  exitTrigger: string;
  holdMinutes: number;
  net: number;
}

export interface AoBookScore {
  n: number;
  wr: number;
  net: number;
  avgWin: number;
  avgLoss: number;
  payoff: number;
}

export interface DiscoveredFireArtifact {
  contractVersion: string;
  generatedAt: string;
  candleSource: string;
  candleFirstIso: string;
  candleLastIso: string;
  thresholdUsed: number;
  hour20ForceShort: boolean;
  fireCount: number;
  fires: AoPricedFire[];
}
