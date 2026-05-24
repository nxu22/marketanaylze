/**
 * Bridge to parent-directory CommonJS modules.
 * Server-side only.
 *
 * Uses __non_webpack_require__ so webpack doesn't try to bundle the parent
 * project files, and lazy-loads them so the module can be imported at build
 * time without causing "Cannot find module" errors.
 */
import path from 'path';

declare const __non_webpack_require__: NodeRequire;
// Use native require so webpack leaves these calls alone at runtime
const _req: NodeRequire =
  typeof __non_webpack_require__ !== 'undefined' ? __non_webpack_require__ : require;

const ROOT = path.join(process.cwd(), '..');

// ── Typed module shapes ───────────────────────────────────────────────────

type YahooMod = {
  getSession: () => Promise<unknown>;
  fetchStock: (ticker: string, sess: unknown) => Promise<unknown>;
  fetchVIX: (sess: unknown) => Promise<number>;
  fetchTNX: (sess: unknown) => Promise<number>;
  fetchFearAndGreed: () => Promise<{ value: number; label: string }>;
};
type NewsMod = {
  fetchNewsSentiment: (ticker: string) => Promise<{
    raw: number; sentiment: string; summary: string;
    headlines: number; multiYear: boolean;
  }>;
};
type ScoringMod = {
  scoreWithBreakdown: (
    stock: unknown, vix: number, tnx: number, fng: unknown, news: unknown
  ) => unknown;
};
type MomentumFetchMod = {
  fetchPriceHistory: (ticker: string, sess: unknown, days?: number) => Promise<{
    ticker: string; closes: number[]; volumes: number[]; dates: string[];
  }>;
};
type MomentumScoringMod = {
  momentumScoreWithBreakdown: (ticker: string, priceHistory: unknown) => unknown;
};

// ── Lazy loader ──────────────────────────────────────────────────────────

let _yahoo:          YahooMod         | null = null;
let _news:           NewsMod          | null = null;
let _score:          ScoringMod       | null = null;
let _momentumFetch:  MomentumFetchMod | null = null;
let _momentumScore:  MomentumScoringMod | null = null;
let _envLoaded = false;

function load() {
  if (_envLoaded) return;
  _req('dotenv').config({ path: path.join(ROOT, '.env') });
  _yahoo         = _req(path.join(ROOT, 'yahoo.js'))           as YahooMod;
  _news          = _req(path.join(ROOT, 'news.js'))            as NewsMod;
  _score         = _req(path.join(ROOT, 'scoring.js'))         as ScoringMod;
  _momentumFetch = _req(path.join(ROOT, 'momentum-fetch.js'))  as MomentumFetchMod;
  _momentumScore = _req(path.join(ROOT, 'momentum.js'))        as MomentumScoringMod;
  _envLoaded = true;
}

// ── Exported wrappers (loads on first call) ──────────────────────────────

export function getSession()                      { load(); return _yahoo!.getSession(); }
export function fetchStock(t: string, s: unknown) { load(); return _yahoo!.fetchStock(t, s); }
export function fetchVIX(s: unknown)              { load(); return _yahoo!.fetchVIX(s); }
export function fetchTNX(s: unknown)              { load(); return _yahoo!.fetchTNX(s); }
export function fetchFearAndGreed()               { load(); return _yahoo!.fetchFearAndGreed(); }
export function fetchNewsSentiment(t: string)     { load(); return _news!.fetchNewsSentiment(t); }
export function scoreWithBreakdown(
  stock: unknown, vix: number, tnx: number, fng: unknown, news: unknown
) {
  load();
  return _score!.scoreWithBreakdown(stock, vix, tnx, fng, news);
}
export function fetchPriceHistory(ticker: string, sess: unknown, days?: number) {
  load();
  return _momentumFetch!.fetchPriceHistory(ticker, sess, days);
}
export function momentumScoreWithBreakdown(ticker: string, priceHistory: unknown) {
  load();
  return _momentumScore!.momentumScoreWithBreakdown(ticker, priceHistory);
}
