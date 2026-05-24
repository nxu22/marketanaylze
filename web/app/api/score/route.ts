import { NextRequest, NextResponse } from 'next/server';
import { scoreOneTicker } from '@/lib/scorer';

export async function GET(req: NextRequest) {
  const ticker = req.nextUrl.searchParams.get('ticker');
  if (!ticker) {
    return NextResponse.json({ error: 'ticker param required' }, { status: 400 });
  }
  try {
    const result = await scoreOneTicker(ticker.toUpperCase());
    return NextResponse.json(result);
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
