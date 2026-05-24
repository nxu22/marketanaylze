import type { ScoreResult } from './types';
import {
  getSession, fetchStock, fetchVIX, fetchTNX, fetchFearAndGreed,
  fetchNewsSentiment, scoreWithBreakdown,
} from './bridge';

interface MacroCache {
  sess: unknown;
  vix: number;
  tnx: number;
  fng: { value: number; label: string };
}

let _macroCache: MacroCache | null = null;
let _macroCacheTime = 0;
const MACRO_TTL_MS = 5 * 60 * 1000;

function logApiError(api: string, ticker: string | null, err: unknown) {
  const e = err as { message?: string; code?: string; response?: { status?: number } };
  console.error(
    `[API ERROR] source=${api} ticker=${ticker ?? 'n/a'} ` +
    `code=${e.code ?? 'none'} status=${e.response?.status ?? 'none'} ` +
    `msg="${e.message ?? String(err)}"`
  );
}

async function getMacro(): Promise<MacroCache> {
  const now = Date.now();
  if (_macroCache && now - _macroCacheTime < MACRO_TTL_MS) return _macroCache;

  let sess: unknown;
  try {
    sess = await getSession();
  } catch (err) {
    logApiError('yahoo/getSession', null, err);
    throw err;
  }

  let vix: number, tnx: number, fng: { value: number; label: string };
  try { vix = await fetchVIX(sess); } catch (err) { logApiError('yahoo/fetchVIX', '^VIX', err); throw err; }
  try { tnx = await fetchTNX(sess); } catch (err) { logApiError('yahoo/fetchTNX', '^TNX', err); throw err; }
  try { fng = await fetchFearAndGreed(); } catch (err) { logApiError('fearandgreed', null, err); throw err; }

  _macroCache = { sess, vix: vix!, tnx: tnx!, fng: fng! };
  _macroCacheTime = now;
  return _macroCache;
}

export async function scoreOneTicker(ticker: string): Promise<ScoreResult> {
  const { sess, vix, tnx, fng } = await getMacro();

  let stock: unknown;
  try { stock = await fetchStock(ticker, sess); } catch (err) { logApiError('yahoo/fetchStock', ticker, err); throw err; }

  let news: unknown;
  try { news = await fetchNewsSentiment(ticker); } catch (err) { logApiError('claude/news', ticker, err); throw err; }

  return scoreWithBreakdown(stock, vix, tnx, fng, news) as ScoreResult;
}

export function invalidateMacroCache() {
  _macroCache = null;
}
