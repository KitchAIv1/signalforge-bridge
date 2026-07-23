/**
 * Discover tradable AUDUSD suffix from an open MetaApi RPC connection.
 */

import { inferMt5SymbolSuffixFromSymbols } from '@/lib/mt5/mt5SymbolSuffix';

export interface AudusdSuffixDiscovery {
  symbols: string[];
  inferredSuffix: string | null;
}

export async function discoverAudusdSuffixFromRpc(rpc: {
  getSymbols(): Promise<string[]>;
}): Promise<AudusdSuffixDiscovery> {
  const symbols = await rpc.getSymbols();
  const audusdSymbols = symbols.filter((symbol) => /AUDUSD/i.test(symbol));
  return {
    symbols: audusdSymbols,
    inferredSuffix: inferMt5SymbolSuffixFromSymbols(audusdSymbols),
  };
}
