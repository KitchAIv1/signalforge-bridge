import { NextResponse } from 'next/server';
import { oandaDashboardFetch, readOandaErrorBody } from '@/lib/oandaHttp';

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

  try {
    const res = await oandaDashboardFetch(
      `/v3/instruments/AUD_USD/candles?granularity=${granularity}&count=${count}&price=M`,
    );
    if (!res.ok) {
      const detail = await readOandaErrorBody(res);
      throw new Error(`OANDA candles failed — ${detail}`);
    }
    const json = (await res.json()) as {
      candles?: Array<{
        time: string;
        mid: { o: string; h: string; l: string; c: string };
        complete: boolean;
      }>;
    };
    const candles: OandaCandle[] = (json.candles ?? []).map((candle) => ({
      time: Math.floor(new Date(candle.time).getTime() / 1000),
      open: parseFloat(candle.mid.o),
      high: parseFloat(candle.mid.h),
      low: parseFloat(candle.mid.l),
      close: parseFloat(candle.mid.c),
    }));
    return NextResponse.json({ candles });
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
