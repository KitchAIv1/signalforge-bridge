import { NextResponse } from 'next/server';

const OANDA_ENV = process.env.OANDA_ENVIRONMENT ?? 'practice';
const BASE_URL = OANDA_ENV === 'live'
  ? 'https://api-fxtrade.oanda.com'
  : 'https://api-fxpractice.oanda.com';
const ACCOUNT_ID = process.env.OANDA_ACCOUNT_ID ?? '';
const API_TOKEN = process.env.OANDA_API_TOKEN ?? '';

const GRANULARITY_MAP: Record<string, string> = {
  M5: 'M5',
  M15: 'M15',
  H1: 'H1',
};

export interface OandaCandle {
  time: number;
  open: number;
  high: number;
  low: number;
  close: number;
}

export async function GET(request: Request): Promise<NextResponse> {
  const { searchParams } = new URL(request.url);
  const granularity = GRANULARITY_MAP[searchParams.get('granularity') ?? 'M5'] ?? 'M5';
  const count = granularity === 'H1' ? 50 : 60;

  const url = `${BASE_URL}/v3/instruments/AUD_USD/candles?granularity=${granularity}&count=${count}&price=M`;

  try {
    const res = await fetch(url, {
      headers: {
        Authorization: `Bearer ${API_TOKEN}`,
        'Content-Type': 'application/json',
      },
      cache: 'no-store',
    });
    if (!res.ok) throw new Error(`OANDA candles failed: ${res.status}`);
    const json = await res.json() as {
      candles?: Array<{
        time: string;
        mid: { o: string; h: string; l: string; c: string };
        complete: boolean;
      }>
    };
    const candles: OandaCandle[] = (json.candles ?? [])
      .filter(c => c.complete || true)
      .map(c => ({
        time: Math.floor(new Date(c.time).getTime() / 1000),
        open: parseFloat(c.mid.o),
        high: parseFloat(c.mid.h),
        low: parseFloat(c.mid.l),
        close: parseFloat(c.mid.c),
      }));
    return NextResponse.json({ candles });
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
