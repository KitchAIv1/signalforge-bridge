import { NextResponse } from 'next/server';
import { fetchOpenTrades } from '@/lib/oandaClient';

export async function GET(): Promise<NextResponse> {
  try {
    const trades = await fetchOpenTrades();
    return NextResponse.json({ trades });
  } catch (err) {
    return NextResponse.json(
      { error: String(err) },
      { status: 500 }
    );
  }
}
