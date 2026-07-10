import { NextResponse } from 'next/server';
import { closeTradeById, closeAllTrades, fetchOpenTrades } from '@/lib/oandaClient';
import { resolveOverrideBrokerId } from '@/lib/overrideBrokerScope';

export async function POST(request: Request): Promise<NextResponse> {
  try {
    const body = (await request.json()) as {
      tradeId?: string;
      closeAll?: boolean;
      brokerId?: string;
    };
    const brokerId = resolveOverrideBrokerId(body.brokerId);

    if (body.closeAll) {
      const trades = await fetchOpenTrades(brokerId);
      await closeAllTrades(
        trades.map((trade) => trade.id),
        brokerId,
      );
      return NextResponse.json({ closed: trades.map((trade) => trade.id), brokerId });
    }

    if (body.tradeId) {
      await closeTradeById(body.tradeId, brokerId);
      return NextResponse.json({ closed: body.tradeId, brokerId });
    }

    return NextResponse.json(
      { error: 'Must provide tradeId or closeAll' },
      { status: 400 },
    );
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
