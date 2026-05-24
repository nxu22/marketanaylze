import type { MomentumEntry } from './types';
import { getSession, fetchPriceHistory, momentumScoreWithBreakdown } from './bridge';

let _sessCache: unknown = null;
let _sessCacheTime = 0;
const SESS_TTL_MS = 5 * 60 * 1000;

async function getOrCreateSession(): Promise<unknown> {
  const now = Date.now();
  if (_sessCache && now - _sessCacheTime < SESS_TTL_MS) return _sessCache;
  _sessCache = await getSession();
  _sessCacheTime = now;
  return _sessCache;
}

function logError(ticker: string, err: unknown) {
  const e = err as { message?: string; code?: string; response?: { status?: number } };
  console.error(
    `[MOMENTUM ERROR] ticker=${ticker} code=${e.code ?? 'none'} ` +
    `status=${e.response?.status ?? 'none'} msg="${e.message ?? String(err)}"`
  );
}

export async function momentumScoreOneTicker(ticker: string): Promise<MomentumEntry> {
  const sess = await getOrCreateSession();

  let history: unknown;
  try {
    history = await fetchPriceHistory(ticker, sess);
  } catch (err) {
    logError(ticker, err);
    throw err;
  }

  return {
    ...(momentumScoreWithBreakdown(ticker, history) as Omit<MomentumEntry, 'refreshedAt'>),
    refreshedAt: new Date().toISOString(),
  };
}

export function invalidateMomentumSessionCache() {
  _sessCache = null;
}
