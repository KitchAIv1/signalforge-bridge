import { NextResponse } from 'next/server';
import { closeTradeById, closeAllTrades, fetchOpenTrades } from '@/lib/oandaClient';

export async function POST(request: Request): Promise<NextResponse> {
  try {
    const body = await request.json() as { tradeId?: string; closeAll?: boolean };

    if (body.closeAll) {
      const trades = await fetchOpenTrades();
      await closeAllTrades(trades.map(t => t.id));
      return NextResponse.json({ closed: trades.map(t => t.id) });
    }

    if (body.tradeId) {
      await closeTradeById(body.tradeId);
      return NextResponse.json({ closed: body.tradeId });
    }

    return NextResponse.json(
      { error: 'Must provide tradeId or closeAll' },
      { status: 400 }
    );
  } catch (err) {
    return NextResponse.json(
      { error: String(err) },
      { status: 500 }
    );
  }
}
