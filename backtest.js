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
const { getSession } = require('./yahoo');
const { dropScore, vixScore, tnxScore, fngScore, peScore, shortScore, newsScore, signal } = require('./scoring');
const { BASE_HEADERS } = require('./config');

const ETFS = ['SOXX', 'CIBR', 'ITA', 'NLR'];

const TRAIN_START = new Date('2018-01-01');
const TRAIN_END   = new Date('2022-12-31');
const TEST_START  = new Date('2023-01-01');
const TEST_END    = new Date('2024-12-31');

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }
function toUnix(d) { return Math.floor(new Date(d).getTime() / 1000); }

async function fetchMonthlyPrices(symbol, sess) {
  await sleep(1000);
  // Start from 2017 to give 12 months of 52W-high lookback before 2018
  // End at 2025-06 to cover the 90-day outcome window for 2024-12 entries
  const period1  = toUnix('2017-01-01');
  const period2  = toUnix('2026-04-01'); // covers 365-day outcome for 2024-12 entries
  const crumb    = sess.crumb ? `&crumb=${encodeURIComponent(sess.crumb)}` : '';
  const url      = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(symbol)}?interval=1mo&period1=${period1}&period2=${period2}${crumb}`;
  const res      = await axios.get(url, { headers: { ...BASE_HEADERS, Cookie: sess.cookies } });
  const result   = res.data.chart.result[0];
  const closes   = result.indicators.quote[0].close;
  return result.timestamp
    .map((t, i) => ({ date: new Date(t * 1000), close: closes[i] }))
    .filter(d => d.close != null);
}

async function fetchFngMonthlyAvg() {
  const res  = await axios.get('https://api.alternative.me/fng/?limit=2000');
  const days  = res.data.data; // newest first
  const buckets = {}; // 'YYYY-MM' -> number[]
  for (const d of days) {
    const key = new Date(d.timestamp * 1000).toISOString().slice(0, 7);
    if (!buckets[key]) buckets[key] = [];
    buckets[key].push(Number(d.value));
  }
  const avg = {};
  for (const [k, vals] of Object.entries(buckets)) {
    avg[k] = +(vals.reduce((s, v) => s + v, 0) / vals.length).toFixed(1);
  }
  return avg; // { 'YYYY-MM': avgValue }
}

function rolling52WHigh(prices, idx) {
  // max close of the previous 12 monthly bars (not including current bar)
  return Math.max(...prices.slice(Math.max(0, idx - 12), idx).map(p => p.close));
}

function closestTo(prices, targetDate) {
  return prices.reduce((best, p) =>
    Math.abs(p.date - targetDate) < Math.abs(best.date - targetDate) ? p : best
  );
}

function scoreMonth(price, high52, vix, tnx, fng) {
  const ds = dropScore({ price, high52 });
  const vs = vixScore(vix);
  const ts = tnxScore(tnx);
  const fs = fngScore(fng);    // historical monthly average
  const ps = peScore(null);    // null → 3 pts (unavailable historically)
  const ss = shortScore(null); // null → 3 pts
  const ns = newsScore(3);     //         3 pts
  const total = +(ds.weighted + vs.weighted + ts.weighted + fs.weighted + ps.weighted + ss.weighted + ns.weighted).toFixed(2);
  return { total, drop: ds.drop, sig: signal(total) };
}

function pctAfter(futurePrices, baseClose, baseDate, days) {
  const target = new Date(baseDate.getTime() + days * 24 * 60 * 60 * 1000);
  const entry  = closestTo(futurePrices, target);
  if (!entry) return null;
  return +((entry.close - baseClose) / baseClose * 100).toFixed(2);
}

function isCorrect(sig, pctChange) {
  if (pctChange === null) return null;
  if (sig === 'BUY' || sig === 'WATCH') return pctChange > 10;
  if (sig === 'AVOID')                  return pctChange < -10;
  return null; // WAIT not evaluated
}

function accuracyStats(results, okField) {
  const buyWatch  = results.filter(r => r.sig === 'BUY' || r.sig === 'WATCH');
  const avoid     = results.filter(r => r.sig === 'AVOID');
  const wait      = results.filter(r => r.sig === 'WAIT');
  const counted   = [...buyWatch, ...avoid].filter(r => r[okField] !== null);
  const correct   = counted.filter(r => r[okField]);
  const bwCounted = buyWatch.filter(r => r[okField] !== null);
  const avCounted = avoid.filter(r => r[okField] !== null);
  const bwCorrect = bwCounted.filter(r => r[okField]);
  const avCorrect = avCounted.filter(r => r[okField]);
  const pct   = counted.length   ? +(correct.length   / counted.length   * 100).toFixed(1) : 0;
  const bwPct = bwCounted.length ? +(bwCorrect.length / bwCounted.length * 100).toFixed(1) : 0;
  const avPct = avCounted.length ? +(avCorrect.length / avCounted.length * 100).toFixed(1) : 0;
  return {
    total: results.length,
    buyWatch: buyWatch.length, bwCounted: bwCounted.length, bwCorrect: bwCorrect.length, bwPct,
    avoid: avoid.length,       avCounted: avCounted.length, avCorrect: avCorrect.length, avPct,
    wait: wait.length,
    counted: counted.length,   correct: correct.length,     pct,
  };
}

function fmtAcc(correct, counted, pct) {
  return `${String(correct).padStart(3)}/${String(counted).padEnd(3)}  ${(pct + '%').padStart(6)}`;
}

function printStats(label, results) {
  const s90  = accuracyStats(results, 'ok90');
  const s180 = accuracyStats(results, 'ok180');
  const s365 = accuracyStats(results, 'ok365');
  console.log(`\n  ${label}`);
  console.log('  ' + '─'.repeat(74));
  console.log(`  ${''.padEnd(27)} ${'90 days'.padEnd(16)} ${'180 days'.padEnd(16)} ${'365 days'}`);
  console.log('  ' + '─'.repeat(74));
  console.log(`  Total months scored  : ${s90.total}`);
  console.log(`  WAIT (not evaluated) : ${s90.wait}`);
  console.log(`  BUY/WATCH (${String(s90.buyWatch).padStart(3)} sig)  : ${fmtAcc(s90.bwCorrect, s90.bwCounted, s90.bwPct)}   ${fmtAcc(s180.bwCorrect, s180.bwCounted, s180.bwPct)}   ${fmtAcc(s365.bwCorrect, s365.bwCounted, s365.bwPct)}`);
  console.log(`  AVOID      (${String(s90.avoid).padStart(3)} sig)  : ${fmtAcc(s90.avCorrect, s90.avCounted, s90.avPct)}   ${fmtAcc(s180.avCorrect, s180.avCounted, s180.avPct)}   ${fmtAcc(s365.avCorrect, s365.avCounted, s365.avPct)}`);
  console.log(`  Overall              : ${fmtAcc(s90.correct, s90.counted, s90.pct)}   ${fmtAcc(s180.correct, s180.counted, s180.pct)}   ${fmtAcc(s365.correct, s365.counted, s365.pct)}`);
  console.log('  ' + '─'.repeat(74));
}

async function main() {
  console.log('\n' + '='.repeat(70));
  console.log('  BACKTEST  —  SOXX / CIBR / ITA / NLR');
  console.log('  Training 2018–2022   |   Test 2023–2024');
  console.log('  Scores use: drop (25%) + VIX (15%) + TNX (15%) + F&G (15%) + neutral defaults');
  console.log('='.repeat(70));

  console.log('\n  Fetching Yahoo Finance session...');
  const sess = await getSession();
  console.log('  Session ready. Fetching historical data (1s delay)...\n');

  const symbols = [...ETFS, '^VIX', '^TNX'];
  const series  = {};
  for (const sym of symbols) {
    process.stdout.write(`  ${sym.padEnd(8)} ...`);
    series[sym] = await fetchMonthlyPrices(sym, sess);
    console.log(` ${series[sym].length} months`);
  }

  process.stdout.write(`  F&G      ...`);
  const fngAvg = await fetchFngMonthlyAvg();
  console.log(` ${Object.keys(fngAvg).length} months`);

  // ── Score every qualifying month ───────────────────────────────────────────
  const allResults = [];

  for (const etf of ETFS) {
    const prices = series[etf];

    for (let i = 12; i < prices.length; i++) {
      const { date, close } = prices[i];
      const inTrain = date >= TRAIN_START && date <= TRAIN_END;
      const inTest  = date >= TEST_START  && date <= TEST_END;
      if (!inTrain && !inTest) continue;

      const high52 = rolling52WHigh(prices, i);
      if (high52 <= 0) continue;

      const vix     = closestTo(series['^VIX'], date).close;
      const tnx     = closestTo(series['^TNX'], date).close;
      const monthKey = date.toISOString().slice(0, 7);
      const fng     = fngAvg[monthKey] ?? 45; // fall back to neutral if missing

      const { total, drop, sig } = scoreMonth(close, high52, vix, tnx, fng);

      const futurePrices = prices.filter(p => p.date > date);
      if (futurePrices.length === 0) continue;

      const pct90  = pctAfter(futurePrices, close, date, 90);
      const pct180 = pctAfter(futurePrices, close, date, 180);
      const pct365 = pctAfter(futurePrices, close, date, 365);

      allResults.push({
        etf, date, sig, total,
        drop: +drop.toFixed(1),
        pct90,  ok90:  isCorrect(sig, pct90),
        pct180, ok180: isCorrect(sig, pct180),
        pct365, ok365: isCorrect(sig, pct365),
        set: inTrain ? 'train' : 'test',
      });
    }
  }

  const trainResults = allResults.filter(r => r.set === 'train');
  const testResults  = allResults.filter(r => r.set === 'test');

  // ── Accuracy summaries ─────────────────────────────────────────────────────
  console.log('\n\n' + '='.repeat(70));
  console.log('  RESULTS');
  console.log('='.repeat(70));

  printStats('TRAINING SET ACCURACY  (2018–2022)', trainResults);
  printStats('TEST SET ACCURACY  (2023–2024)',      testResults);

  // ── Per-ETF accuracy ───────────────────────────────────────────────────────
  console.log('\n  PER-ETF ACCURACY  (training + test combined)');
  console.log('  ' + '─'.repeat(74));
  console.log(`  ${'ETF'.padEnd(8)} ${'Signals'.padStart(9)}   ${'90d'.padEnd(16)} ${'180d'.padEnd(16)} ${'365d'}`);
  console.log('  ' + '─'.repeat(74));
  for (const etf of ETFS) {
    const subset = allResults.filter(r => r.etf === etf);
    const s90  = accuracyStats(subset, 'ok90');
    const s180 = accuracyStats(subset, 'ok180');
    const s365 = accuracyStats(subset, 'ok365');
    console.log(
      `  ${etf.padEnd(8)} ${String(s90.counted).padStart(9)}   ${fmtAcc(s90.correct, s90.counted, s90.pct)}   ${fmtAcc(s180.correct, s180.counted, s180.pct)}   ${fmtAcc(s365.correct, s365.counted, s365.pct)}`
    );
  }
  console.log('  ' + '─'.repeat(74));
  const s90all  = accuracyStats(allResults, 'ok90');
  const s180all = accuracyStats(allResults, 'ok180');
  const s365all = accuracyStats(allResults, 'ok365');
  console.log(
    `  ${'ALL'.padEnd(8)} ${String(s90all.counted).padStart(9)}   ${fmtAcc(s90all.correct, s90all.counted, s90all.pct)}   ${fmtAcc(s180all.correct, s180all.counted, s180all.pct)}   ${fmtAcc(s365all.correct, s365all.counted, s365all.pct)}`
  );
  console.log('  ' + '─'.repeat(74));

  // ── Strongest signals ──────────────────────────────────────────────────────
  const evaluated = allResults.filter(r => r.ok90 !== null);
  const strongest = [...evaluated].sort((a, b) => b.total - a.total).slice(0, 15);

  function retStr(v) { return v === null ? '  N/A' : (v >= 0 ? '+' : '') + v + '%'; }

  console.log('\n  STRONGEST SIGNALS  (top 15 by score)');
  console.log('  ' + '─'.repeat(82));
  console.log(
    `  ${'Date'.padEnd(9)} ${'ETF'.padEnd(6)} ${'Sig'.padEnd(7)} ${'Score'.padStart(6)} ${'Drop'.padStart(8)} ${'90d'.padStart(8)} ${'180d'.padStart(8)} ${'365d'.padStart(8)} ${'Set'.padStart(6)}`
  );
  console.log('  ' + '─'.repeat(82));
  for (const r of strongest) {
    const dateStr = r.date.toISOString().slice(0, 7);
    console.log(
      `  ${dateStr.padEnd(9)} ${r.etf.padEnd(6)} ${r.sig.padEnd(7)} ${String(r.total).padStart(6)} ${('-' + r.drop + '%').padStart(8)} ${retStr(r.pct90).padStart(8)} ${retStr(r.pct180).padStart(8)} ${retStr(r.pct365).padStart(8)} ${r.set.padStart(6)}`
    );
  }
  console.log('  ' + '─'.repeat(82));
  console.log('\n  Note: PE, short, and news scores use neutral defaults');
  console.log('  Active factors: drop + VIX + TNX + F&G (historical monthly avg).\n');
  console.log('='.repeat(70) + '\n');
}

main().catch(err => {
  console.error('Error:', err.response?.data || err.message);
  process.exit(1);
});
