if (!process.env._YF_HDR_PATCHED) {
  const { spawnSync } = require('child_process');
  const r = spawnSync(
    process.execPath,
    ['--max-http-header-size=131072', __filename],
    { stdio: 'inherit', env: { ...process.env, _YF_HDR_PATCHED: '1' } }
  );
  process.exit(r.status ?? 0);
}

require('dotenv').config();
const axios = require('axios');
const { getSession } = require('./yahoo');
const { BASE_HEADERS } = require('./config');

const SYMBOLS = ['ADBE', 'CEG', 'NVDA', 'MU', 'CRWD'];
const DISCREPANCY_THRESHOLD = 2.0; // percent

async function fetchYahoo(symbol, sess) {
  const headers = { ...BASE_HEADERS, Cookie: sess.cookies };
  const chartUrl = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(symbol)}?interval=1d&range=1d`;
  const chartRes = await axios.get(chartUrl, { headers });
  const meta = chartRes.data.chart.result[0].meta;

  const crumbParam = sess.crumb ? `&crumb=${encodeURIComponent(sess.crumb)}` : '';
  const summaryUrl =
    `https://query1.finance.yahoo.com/v10/finance/quoteSummary/${encodeURIComponent(symbol)}` +
    `?modules=summaryDetail,defaultKeyStatistics${crumbParam}`;
  const summaryRes = await axios.get(summaryUrl, { headers });
  const r  = summaryRes.data.quoteSummary.result[0];
  const sd = r.summaryDetail        ?? {};
  const ks = r.defaultKeyStatistics ?? {};

  return {
    price:  meta.regularMarketPrice,
    high52: meta.fiftyTwoWeekHigh,
    pe:     sd.trailingPE?.raw ?? ks.trailingEps?.raw ?? null,
  };
}

async function fetchFinnhub(symbol) {
  const key = process.env.FINNHUB_KEY;
  const url = `https://finnhub.io/api/v1/quote?symbol=${encodeURIComponent(symbol)}&token=${key}`;
  const res = await axios.get(url);
  return res.data.c; // current price
}

function ln(ch, n) { return ch.repeat(n); }
function fmt(n, dec = 2) { return n !== null ? n.toFixed(dec) : 'N/A'; }

async function main() {
  const W = 88;
  console.log('\n' + ln('=', W));
  console.log('  VALIDATE  —  Yahoo Finance vs Finnhub price cross-check');
  console.log(ln('=', W));

  console.log('\n  Fetching Yahoo Finance session...');
  const sess = await getSession();
  console.log('  Session ready. Fetching data...\n');

  const results = await Promise.all(SYMBOLS.map(async sym => {
    const [yahoo, fhPrice] = await Promise.all([
      fetchYahoo(sym, sess),
      fetchFinnhub(sym),
    ]);
    const drop = ((yahoo.price - yahoo.high52) / yahoo.high52) * 100;
    const discPct = Math.abs((yahoo.price - fhPrice) / yahoo.price * 100);
    const flagged = discPct > DISCREPANCY_THRESHOLD;
    const pass = !flagged;
    return { sym, yahoo, fhPrice, drop, discPct, flagged, pass };
  }));

  // ── Main table ─────────────────────────────────────────────────────────────
  console.log('  ' + ln('─', W - 2));
  console.log(
    `  ${'Symbol'.padEnd(7)} ${'Yahoo Price'.padStart(12)} ${'P/E'.padStart(8)} ${'52W High'.padStart(10)} ${'Drop'.padStart(8)} ` +
    `${'Finnhub'.padStart(11)} ${'Discrepancy'.padStart(13)} ${'Result'.padStart(7)}`
  );
  console.log('  ' + ln('─', W - 2));

  for (const r of results) {
    const dropStr = `-${Math.abs(r.drop).toFixed(1)}%`;
    const discStr = `${r.discPct.toFixed(2)}%`;
    const flag    = r.flagged ? ' ⚠' : '';
    const result  = r.pass ? 'PASS' : 'FAIL';
    console.log(
      `  ${r.sym.padEnd(7)} ${'$' + fmt(r.yahoo.price).padStart(11)} ${fmt(r.yahoo.pe, 1).padStart(8)} ` +
      `${'$' + fmt(r.yahoo.high52).padStart(9)} ${dropStr.padStart(8)} ` +
      `${'$' + fmt(r.fhPrice).padStart(10)} ${(discStr + flag).padStart(13)} ${result.padStart(7)}`
    );
  }
  console.log('  ' + ln('─', W - 2));

  // ── Detail rows for flagged stocks ─────────────────────────────────────────
  const flagged = results.filter(r => r.flagged);
  if (flagged.length > 0) {
    console.log('\n  DISCREPANCY DETAIL  (>' + DISCREPANCY_THRESHOLD + '% difference)');
    console.log('  ' + ln('─', W - 2));
    for (const r of flagged) {
      const diff = r.yahoo.price - r.fhPrice;
      const sign = diff >= 0 ? '+' : '';
      console.log(
        `  ${r.sym.padEnd(7)}  Yahoo $${fmt(r.yahoo.price)}  vs  Finnhub $${fmt(r.fhPrice)}` +
        `  →  diff ${sign}$${fmt(Math.abs(diff))} (${sign}${(diff / r.fhPrice * 100).toFixed(2)}%)`
      );
    }
    console.log('  ' + ln('─', W - 2));
  }

  // ── Summary ────────────────────────────────────────────────────────────────
  const passed = results.filter(r => r.pass).length;
  console.log(`\n  ${passed}/${results.length} passed  |  threshold: >${DISCREPANCY_THRESHOLD}% flags a discrepancy`);
  console.log(ln('=', W) + '\n');
}

main().catch(err => {
  console.error('Error:', err.response?.data || err.message);
  process.exit(1);
});
