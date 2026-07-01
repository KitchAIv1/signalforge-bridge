import { createMt5Broker } from '../../src/connectors/broker/mt5Broker.js';
import { bridgeInstrumentToMt5 } from '../../src/connectors/broker/symbolMapping.js';
import { getMt5Session } from '../../src/connectors/broker/mt5RpcPool.js';

export interface Mt5ProbeResult {
  label: string;
  accountId: string;
  ok: boolean;
  equity: number | null;
  balance: number | null;
  openTrades: number | null;
  audusdSymbol: string;
  latestM5Close: number | null;
  candleWarning: string | null;
  audusdSymbolHints: string[];
  error: string | null;
}

async function findAudusdSymbolHints(accountId: string): Promise<string[]> {
  try {
    const { rpc } = await getMt5Session(accountId);
    const symbols = await rpc.getSymbols();
    return symbols.filter((symbol) => symbol.toUpperCase().includes('AUDUSD')).slice(0, 12);
  } catch (err) {
    console.warn('[probe] getSymbols failed:', String(err));
    return [];
  }
}

async function fetchAudusdM5Close(
  broker: ReturnType<typeof createMt5Broker>,
): Promise<{ close: number | null; warning: string | null }> {
  try {
    const candle = await broker.fetchLatestM5Candle('AUD_USD');
    return { close: candle?.close ?? null, warning: null };
  } catch (err) {
    return { close: null, warning: String(err) };
  }
}

export async function probeMt5Account(params: {
  label: string;
  accountId: string;
  symbolSuffix: string;
  magicNumber: number;
}): Promise<Mt5ProbeResult> {
  const audusdSymbol = bridgeInstrumentToMt5('AUD_USD', params.symbolSuffix);
  const base: Mt5ProbeResult = {
    label: params.label,
    accountId: params.accountId,
    ok: false,
    equity: null,
    balance: null,
    openTrades: null,
    audusdSymbol,
    latestM5Close: null,
    candleWarning: null,
    audusdSymbolHints: [],
    error: null,
  };

  try {
    const broker = createMt5Broker({
      brokerId: params.label,
      brokerType: 'mt5',
      accountId: params.accountId,
      symbolSuffix: params.symbolSuffix,
      magicNumber: params.magicNumber,
    });
    const summary = await broker.getAccountSummary();
    const openTrades = await broker.getOpenTrades();
    const candleProbe = await fetchAudusdM5Close(broker);
    const audusdSymbolHints = candleProbe.warning
      ? await findAudusdSymbolHints(params.accountId)
      : [];

    return {
      ...base,
      ok: true,
      equity: summary.equity,
      balance: summary.balance,
      openTrades: openTrades.length,
      latestM5Close: candleProbe.close,
      candleWarning: candleProbe.warning,
      audusdSymbolHints,
    };
  } catch (err) {
    return { ...base, error: String(err) };
  }
}
