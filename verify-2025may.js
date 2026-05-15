// Yahoo Finance headers exceed Node's 8 KB default; relaunch once with a higher limit.
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
const { getSession, fetchStock } = require('./yahoo');
const { dropScore, vixScore, fngScore, tnxScore, peScore, shortScore, newsScore, signal, filterResult } = require('./scoring');
const { BASE_HEADERS, STOCKS, AI_TAGS } = require('./config');

const TARGET      = new Date('2025-05-01');
const TARGET_END  = new Date('2025-05-03'); // small buffer to capture May 1 close

function toUnix(d) { return Math.floor(new Date(d).getTime() / 1000); }

function closestTo(prices, date) {
  return prices.reduce((best, p) =>
    Math.abs(p.date - date) < Math.abs(best.date - date) ? p : best
  );
}

async function fetchDailyRange(symbol, from, to, sess) {
  const crumb = sess.crumb ? `&crumb=${encodeURIComponent(sess.crumb)}` : '';
  const url   = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(symbol)}` +
                `?interval=1d&period1=${toUnix(from)}&period2=${toUnix(to)}${crumb}`;
  const res   = await axios.get(url, { headers: { ...BASE_HEADERS, Cookie: sess.cookies } });
  const r     = res.data.chart.result[0];
  const closes = r.indicators.quote[0].close;
  return r.timestamp
    .map((t, i) => ({ date: new Date(t * 1000), close: closes[i] }))
    .filter(d => d.close != null);
}

async function fetchFngOn(targetDate) {
  const res  = await axios.get('https://api.alternative.me/fng/?limit=2000');
  const days = res.data.data;
  const best = days.reduce((a, b) =>
    Math.abs(b.timestamp * 1000 - targetDate) < Math.abs(a.timestamp * 1000 - targetDate) ? b : a
  );
  return Number(best.value);
}

async function main() {
  const W = 92;
  console.log('\n' + '='.repeat(W));
  console.log('  VERIFY 2025-05-01');
  console.log('  Scores computed with 2025-05-01 snapshot. Correct = actual return matches signal.');
  console.log('  PE / short ratio use current values (historical unavailable).');
  console.log('='.repeat(W));

  console.log('\n  Fetching Yahoo Finance session...');
  const sess = await getSession();
  console.log('  Session ready.\n');

  // ── Macro snapshot for 2025-05-01 ────────────────────────────────────────
  process.stdout.write('  ^VIX  on 2025-05-01 ...');
  const vixPrices = await fetchDailyRange('^VIX', '2024-05-01', TARGET_END, sess);
  const vix2025   = closestTo(vixPrices, TARGET).close;
  console.log(` ${vix2025.toFixed(2)}`);

  process.stdout.write('  ^TNX  on 2025-05-01 ...');
  const tnxPrices = await fetchDailyRange('^TNX', '2024-05-01', TARGET_END, sess);
  const tnx2025   = closestTo(tnxPrices, TARGET).close;
  console.log(` ${tnx2025.toFixed(2)}%`);

  process.stdout.write('  F&G   on 2025-05-01 ...');
  const fng2025 = await fetchFngOn(TARGET);
  console.log(` ${fng2025}`);

  // ── Historical prices for all stocks (2024-05-01 → 2025-05-03) ───────────
  console.log(`\n  Fetching 52W historical prices for ${STOCKS.length} stocks...`);
  const histMap = {};
  await Promise.all(STOCKS.map(async sym => {
    try {
      histMap[sym] = await fetchDailyRange(sym, '2024-05-01', TARGET_END, sess);
    } catch { histMap[sym] = []; }
  }));

  // ── Current fundamentals for all stocks ───────────────────────────────────
  console.log(`  Fetching current fundamentals for ${STOCKS.length} stocks...`);
  const currentMap = {};
  await Promise.all(STOCKS.map(async sym => {
    try {
      currentMap[sym] = await fetchStock(sym, sess);
    } catch { currentMap[sym] = null; }
  }));

  // ── Score each stock ───────────────────────────────────────────────────────
  const rows = [];
  for (const sym of STOCKS) {
    const hist    = histMap[sym];
    const current = currentMap[sym];
    if (!hist.length || !current) continue;

    const pricesUpToTarget = hist.filter(p => p.date <= new Date('2025-05-02'));
    if (!pricesUpToTarget.length) continue;

    const price2025 = closestTo(pricesUpToTarget, TARGET).close;
    const high52    = Math.max(...pricesUpToTarget.map(p => p.close));
    const low52     = Math.min(...pricesUpToTarget.map(p => p.close));
    const priceNow  = current.price;

    // Filter using current fundamentals (only historical data we can approximate)
    const stockObj = { ...current, price: price2025, high52, low52 };
    const fRes     = filterResult(stockObj);
    if (!fRes.startsWith('PASS')) continue;

    const ds    = dropScore(stockObj);
    const vs    = vixScore(vix2025);
    const ts    = tnxScore(tnx2025);
    const fs    = fngScore(fng2025);
    const ps    = peScore(current.pe);
    const ss    = shortScore(current.shortRatio);
    const ns    = newsScore(3); // news unavailable for past date
    const total = +(ds.weighted + vs.weighted + ts.weighted + fs.weighted +
                    ps.weighted + ss.weighted + ns.weighted).toFixed(2);
    const sig   = signal(total);
    const retPct = +((priceNow - price2025) / price2025 * 100).toFixed(2);

    let correct = null;
    if (sig === 'BUY' || sig === 'WATCH') correct = retPct > 10;
    if (sig === 'AVOID')                  correct = retPct < -10;

    rows.push({ sym, sig, total, price2025, priceNow, retPct, correct, drop: ds.drop });
  }

  rows.sort((a, b) => b.total - a.total);

  // ── Print table ────────────────────────────────────────────────────────────
  console.log('\n' + '='.repeat(W));
  console.log('  SIGNAL VERIFICATION  (2025-05-01 → today)');
  console.log('='.repeat(W));
  console.log(
    `  ${'Symbol'.padEnd(8)} ${'Sig'.padEnd(7)} ${'Score'.padStart(6)} ${'Drop'.padStart(8)}` +
    ` ${'May-01'.padStart(10)} ${'Now'.padStart(10)} ${'Return'.padStart(8)} ${'OK?'.padStart(6)} ${'Tag'.padStart(14)}`
  );
  console.log('  ' + '─'.repeat(W - 2));
  for (const r of rows) {
    const retStr = (r.retPct >= 0 ? '+' : '') + r.retPct + '%';
    const okStr  = r.correct === null ? 'WAIT' : r.correct ? 'YES' : 'NO';
    const tag    = AI_TAGS[r.sym] ?? '';
    console.log(
      `  ${r.sym.padEnd(8)} ${r.sig.padEnd(7)} ${String(r.total).padStart(6)} ${('-' + r.drop.toFixed(1) + '%').padStart(8)}` +
      ` ${'$' + r.price2025.toFixed(2).padStart(9)} ${'$' + r.priceNow.toFixed(2).padStart(9)} ${retStr.padStart(8)} ${okStr.padStart(6)} ${tag.padStart(14)}`
    );
  }
  console.log('  ' + '─'.repeat(W - 2));

  // ── Accuracy ───────────────────────────────────────────────────────────────
  const bw      = rows.filter(r => r.sig === 'BUY' || r.sig === 'WATCH');
  const av      = rows.filter(r => r.sig === 'AVOID');
  const wt      = rows.filter(r => r.sig === 'WAIT');
  const counted = rows.filter(r => r.correct !== null);
  const correct = counted.filter(r => r.correct);
  const pct     = counted.length ? (correct.length / counted.length * 100).toFixed(1) : 0;
  const bwPct   = bw.length ? (bw.filter(r => r.correct).length / bw.length * 100).toFixed(1) : 0;
  const avPct   = av.length ? (av.filter(r => r.correct).length / av.length * 100).toFixed(1) : 0;

  console.log('\n  ACCURACY SUMMARY');
  console.log('  ' + '─'.repeat(50));
  console.log(`  BUY/WATCH : ${bw.filter(r => r.correct).length}/${bw.length} correct  (${bwPct}%)`);
  console.log(`  AVOID     : ${av.filter(r => r.correct).length}/${av.length} correct  (${avPct}%)`);
  console.log(`  WAIT      : ${wt.length} signals  (not counted)`);
  console.log(`  Overall   : ${correct.length}/${counted.length}  (${pct}%)`);
  console.log('  ' + '─'.repeat(50));
  console.log(`\n  Macro on 2025-05-01:  VIX ${vix2025.toFixed(2)}  |  TNX ${tnx2025.toFixed(2)}%  |  F&G ${fng2025}`);
  console.log('='.repeat(W) + '\n');
}

main().catch(err => {
  console.error('Error:', err.response?.data || err.message);
  process.exit(1);
});
