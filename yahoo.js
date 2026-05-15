const axios = require('axios');
const { BASE_HEADERS } = require('./config');

// Yahoo Finance v10 requires a crumb + session cookie.
// The relaunch in fetch.js ensures --max-http-header-size=131072 so headers parse OK.
let _session = null;
async function getSession() {
  if (_session) return _session;
  const seedRes = await axios.get('https://finance.yahoo.com', {
    headers: { ...BASE_HEADERS, Accept: 'text/html' },
    maxRedirects: 5,
  });
  const cookies = (seedRes.headers['set-cookie'] || []).map(c => c.split(';')[0]).join('; ');
  let crumb = null;
  for (const host of ['query2', 'query1']) {
    try {
      const r = await axios.get(`https://${host}.finance.yahoo.com/v1/test/getcrumb`, {
        headers: { 'User-Agent': BASE_HEADERS['User-Agent'], Cookie: cookies },
      });
      if (typeof r.data === 'string' && !r.data.includes('<')) { crumb = r.data; break; }
    } catch { /* try next */ }
  }
  _session = { crumb, cookies };
  return _session;
}

async function fetchStock(symbol, sess) {
  const headers = { ...BASE_HEADERS, Cookie: sess.cookies };

  // Chart v8 — price + 52W range
  const chartUrl = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(symbol)}?interval=1d&range=1d`;
  const chartRes = await axios.get(chartUrl, { headers });
  const meta = chartRes.data.chart.result[0].meta;

  // quoteSummary v10 — fundamentals
  const modules = 'defaultKeyStatistics,financialData,summaryDetail';
  const crumbParam = sess.crumb ? `&crumb=${encodeURIComponent(sess.crumb)}` : '';
  const summaryUrl =
    `https://query1.finance.yahoo.com/v10/finance/quoteSummary/${encodeURIComponent(symbol)}` +
    `?modules=${modules}${crumbParam}`;
  const summaryRes = await axios.get(summaryUrl, { headers });
  const r = summaryRes.data.quoteSummary.result[0];
  const sd = r.summaryDetail        ?? {};
  const fd = r.financialData        ?? {};
  const ks = r.defaultKeyStatistics ?? {};

  return {
    symbol,
    price:             meta.regularMarketPrice,
    high52:            meta.fiftyTwoWeekHigh,
    low52:             meta.fiftyTwoWeekLow,
    pe:                sd.trailingPE?.raw          ?? ks.trailingEps?.raw ?? null,
    marketCap:         sd.marketCap?.raw           ?? null,
    debtToEquity:      fd.debtToEquity?.raw        ?? null,
    operatingCashflow: fd.operatingCashflow?.raw   ?? null,
    shortRatio:        ks.shortRatio?.raw          ?? null,
  };
}

async function fetchVIX(sess) {
  const url = `https://query1.finance.yahoo.com/v8/finance/chart/%5EVIX?interval=1d&range=1d`;
  const res = await axios.get(url, { headers: { ...BASE_HEADERS, Cookie: sess.cookies } });
  return res.data.chart.result[0].meta.regularMarketPrice;
}

async function fetchTNX(sess) {
  const url = `https://query1.finance.yahoo.com/v8/finance/chart/%5ETNX?interval=1d&range=1d`;
  const res = await axios.get(url, { headers: { ...BASE_HEADERS, Cookie: sess.cookies } });
  return res.data.chart.result[0].meta.regularMarketPrice;
}

async function fetchFearAndGreed() {
  const res = await axios.get('https://api.alternative.me/fng/');
  const d = res.data.data[0];
  return { value: d.value, label: d.value_classification };
}

async function fetchMarketCycle(sess) {
  const period1 = Math.floor(Date.now() / 1000) - 300 * 24 * 60 * 60;
  const period2 = Math.floor(Date.now() / 1000);
  const crumb   = sess.crumb ? `&crumb=${encodeURIComponent(sess.crumb)}` : '';
  const url     = `https://query1.finance.yahoo.com/v8/finance/chart/%5EGSPC` +
                  `?interval=1d&period1=${period1}&period2=${period2}${crumb}`;
  const res    = await axios.get(url, { headers: { ...BASE_HEADERS, Cookie: sess.cookies } });
  const result = res.data.chart.result[0];
  const closes = result.indicators.quote[0].close.filter(c => c != null);
  const price  = closes[closes.length - 1];
  const ma200  = closes.slice(-200).reduce((s, v) => s + v, 0) / Math.min(closes.length, 200);
  const pctAbove = (price - ma200) / ma200 * 100;

  let mode, label;
  if      (pctAbove >  5) { mode = 'BULL';       label = 'Strong Bull  (>5% above 200MA)'; }
  else if (pctAbove >  0) { mode = 'BULL';       label = 'Bull  (0–5% above 200MA)'; }
  else if (pctAbove > -5) { mode = 'BEAR';       label = 'Bear  (0–5% below 200MA)'; }
  else                    { mode = 'BEAR';       label = 'Strong Bear  (>5% below 200MA)'; }

  return { price, ma200, pctAbove, mode, label };
}

module.exports = { getSession, fetchStock, fetchVIX, fetchTNX, fetchFearAndGreed, fetchMarketCycle };
