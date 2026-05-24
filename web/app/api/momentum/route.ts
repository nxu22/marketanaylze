import { NextResponse } from 'next/server';
import { readLatestMomentumScores, readMomentumHistory } from '@/lib/momentum-history';

export async function GET() {
  const data    = readLatestMomentumScores();
  const history = readMomentumHistory();
  if (!data) {
    return NextResponse.json({ scores: [], refreshedAt: null, history, empty: true });
  }
  return NextResponse.json({ ...data, history });
}
