import { NextResponse } from 'next/server';
import { fetchAccountSnapshot } from '@/lib/oandaClient';
import { resolveOverrideBrokerId } from '@/lib/overrideBrokerScope';

export async function GET(request: Request): Promise<NextResponse> {
  try {
    const { searchParams } = new URL(request.url);
    const brokerId = resolveOverrideBrokerId(searchParams.get('brokerId'));
    const snapshot = await fetchAccountSnapshot(brokerId);
    return NextResponse.json({ snapshot, brokerId });
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
