import { NextResponse } from 'next/server';
import { scoreOneTicker, invalidateMacroCache } from '@/lib/scorer';
import { writeLatestScores } from '@/lib/history';
import { ALL_TICKERS } from '@/lib/stock-universe';
import type { WatchlistEntry } from '@/lib/types';

const BATCH = 5;

export async function POST() {
  const startMs = Date.now();
  try {
    invalidateMacroCache();

    const results: WatchlistEntry[] = [];
    const failures: { ticker: string; error: string }[] = [];

    for (let i = 0; i < ALL_TICKERS.length; i += BATCH) {
      const chunk = ALL_TICKERS.slice(i, i + BATCH);
      const settled = await Promise.allSettled(
        chunk.map(async ticker => {
          const r = await scoreOneTicker(ticker);
          return { ...r, refreshedAt: new Date().toISOString() } as WatchlistEntry;
        })
      );
      settled.forEach((result, j) => {
        if (result.status === 'fulfilled') {
          results.push(result.value);
        } else {
          const err = result.reason as { message?: string };
          failures.push({ ticker: chunk[j], error: err?.message ?? String(result.reason) });
          console.error(`[REFRESH] FAILED ${chunk[j]}: ${err?.message}`);
        }
      });
      if (i + BATCH < ALL_TICKERS.length) {
        await new Promise(r => setTimeout(r, 800));
      }
    }

    if (results.length > 0) writeLatestScores(results);

    const durationSec = ((Date.now() - startMs) / 1000).toFixed(1);
    return NextResponse.json({
      ok:          true,
      count:       results.length,
      failures,
      refreshedAt: new Date().toISOString(),
      durationSec,
    });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
