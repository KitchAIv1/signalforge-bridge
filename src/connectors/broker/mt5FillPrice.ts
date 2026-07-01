/**
 * Real fill-price recovery for MT5 orders.
 *
 * MetaApi's trade() RPC response (MetatraderTradeResponse) only returns
 * numericCode/stringCode/message/orderId/positionId — it never includes a
 * fill price. Without this, bridge_trade_log.fill_price stays null, which
 * corrupts all downstream R-multiple math (trail stop, SL-hit detection).
 * The real fill price lives on the live Position object (openPrice), so we
 * query it right after the trade confirms, with a short retry for the brief
 * window before the new position is visible via RPC.
 */

type RpcConnection = {
  getPosition(positionId: string): Promise<Record<string, unknown>>;
};

function parseOpenPrice(pos: Record<string, unknown> | null | undefined): number | null {
  const price = pos?.openPrice;
  if (price == null) return null;
  const num = Number(price);
  return Number.isFinite(num) && num > 0 ? num : null;
}

export async function fetchMt5OpenPriceWithRetry(
  rpc: RpcConnection,
  positionId: string,
  attempts = 3,
  delayMs = 350,
): Promise<number | null> {
  for (let attempt = 0; attempt < attempts; attempt += 1) {
    try {
      const pos = await rpc.getPosition(positionId);
      const price = parseOpenPrice(pos);
      if (price != null) return price;
    } catch {
      // Position not yet visible via RPC — retry below.
    }
    if (attempt < attempts - 1) {
      await new Promise((resolve) => setTimeout(resolve, delayMs));
    }
  }
  return null;
}
