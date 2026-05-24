import { NextResponse } from 'next/server';
import { readLatestScores, readHistory } from '@/lib/history';

export async function GET() {
  const data    = readLatestScores();
  const history = readHistory();
  if (!data) {
    return NextResponse.json({ scores: [], refreshedAt: null, history, empty: true });
  }
  return NextResponse.json({ ...data, history });
}
