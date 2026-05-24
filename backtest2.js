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
const fs    = require('fs');
const axios = require('axios');
const { getSession } = require('./yahoo');
const { dropScore, vixScore, tnxScore, fngScore, peScore, shortScore, newsScore, signal } = require('./scoring');
const { BASE_HEADERS } = require('./config');

// ── Config ─────────────────────────────────────────────────────────────────
const ETFS        = ['SOXX', 'CIBR', 'ITA', 'NLR', 'QQQ', 'XLK', 'ARKK', 'SMH'];
const TRAIN_START = new Date('2018-01-01');
const TRAIN_END   = new Date('2021-12-31');
const TEST_START  = new Date('2022-01-01');
const TEST_END    = new Date('2024-12-31');

function sleep(ms)  { return new Promise(r => setTimeout(r, ms)); }
function toUnix(d)  { return Math.floor(new Date(d).getTime() / 1000); }
function yymm(d)    { return d.toISOString().slice(0, 7); }

// ── Data fetching ──────────────────────────────────────────────────────────
async function fetchMonthlyPrices(symbol, sess) {
  await sleep(1000);
  const crumb = sess.crumb ? `&crumb=${encodeURIComponent(sess.crumb)}` : '';
  const url   = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(symbol)}` +
                `?interval=1mo&period1=${toUnix('2017-01-01')}&period2=${toUnix('2026-06-01')}${crumb}`;
  const res   = await axios.get(url, { headers: { ...BASE_HEADERS, Cookie: sess.cookies } });
  const r     = res.data.chart.result[0];
  const closes = r.indicators.quote[0].close;
  return r.timestamp
    .map((t, i) => ({ date: new Date(t * 1000), close: closes[i] }))
    .filter(d => d.close != null);
}

async function fetchFngMonthlyAvg() {
  const res  = await axios.get('https://api.alternative.me/fng/?limit=2000');
  const days = res.data.data;
  const buckets = {};
  for (const d of days) {
    const key = new Date(d.timestamp * 1000).toISOString().slice(0, 7);
    (buckets[key] = buckets[key] || []).push(Number(d.value));
  }
  const avg = {};
  for (const [k, vals] of Object.entries(buckets)) {
    avg[k] = +(vals.reduce((s, v) => s + v, 0) / vals.length).toFixed(1);
  }
  return avg;
}

// ── Data-point helpers ─────────────────────────────────────────────────────
function rolling52WHigh(prices, idx) {
  // max close of the 12 months BEFORE idx — strictly no future data
  const window = prices.slice(Math.max(0, idx - 12), idx);
  return window.length ? Math.max(...window.map(p => p.close)) : null;
}

function closestTo(prices, targetDate) {
  return prices.reduce((best, p) =>
    Math.abs(p.date - targetDate) < Math.abs(best.date - targetDate) ? p : best
  );
}

function pctAfter(futurePrices, baseClose, baseDate, days) {
  if (!futurePrices.length) return null;
  const target   = new Date(baseDate.getTime() + days * 24 * 60 * 60 * 1000);
  const closest  = closestTo(futurePrices, target);
  const diffDays = Math.abs(closest.date - target) / 86400000;
  if (diffDays > 45) return null; // no data close enough to target date
  return +((closest.close - baseClose) / baseClose * 100).toFixed(2);
}

function isCorrect(sig, pct) {
  if (pct === null) return null;
  if (sig === 'BUY'   || sig === 'WATCH') return pct > 10;
  if (sig === 'AVOID')                    return pct < -10;
  return null;
}

// ── Scoring ────────────────────────────────────────────────────────────────
function scoreMonth(price, high52, vix, tnx, fng) {
  const ds = dropScore({ price, high52 });
  const vs = vixScore(vix);
  const ts = tnxScore(tnx);
  const fs = fngScore(fng);
  const ps = peScore(null);    // unavailable historically → neutral 3 pts
  const ss = shortScore(null); // unavailable historically → neutral 3 pts
  const ns = newsScore(3);     // unavailable historically → neutral 3 pts
  const total = +(ds.weighted + vs.weighted + ts.weighted + fs.weighted +
                  ps.weighted + ss.weighted + ns.weighted).toFixed(2);
  return { total, drop: +ds.drop.toFixed(1), sig: signal(total) };
}

// ── Stats helpers ──────────────────────────────────────────────────────────
function sigAcc(rows, sig, field) {
  const sub     = sig === 'BUY+WATCH'
    ? rows.filter(r => r.sig === 'BUY' || r.sig === 'WATCH')
    : rows.filter(r => r.sig === sig);
  const counted = sub.filter(r => r[field] !== null);
  const correct = counted.filter(r => r[field] === true);
  const pct     = counted.length ? +(correct.length / counted.length * 100).toFixed(1) : null;
  return { n: sub.length, counted: counted.length, correct: correct.length, pct };
}

function fmtAcc(a) {
  if (!a.counted) return '   —  /—   (   — )';
  return `${String(a.correct).padStart(4)}/${String(a.counted).padEnd(4)} (${(a.pct + '%').padStart(6)})`;
}

function printBlock(label, rows) {
  const W = 84;
  console.log(`\n  ${label}  [${rows.length} signals]`);
  console.log('  ' + '─'.repeat(W));
  console.log(`  ${'Signal'.padEnd(17)}  ${'n'.padStart(4)}  ${'90d'.padEnd(20)}  ${'180d'.padEnd(20)}  ${'365d'}`);
  console.log('  ' + '─'.repeat(W));
  for (const sig of ['BUY', 'WATCH', 'BUY+WATCH', 'AVOID']) {
    const a90  = sigAcc(rows, sig, 'ok90');
    const a180 = sigAcc(rows, sig, 'ok180');
    const a365 = sigAcc(rows, sig, 'ok365');
    const note = sig === 'BUY+WATCH' ? '  ← combined' : '';
    console.log(`  ${sig.padEnd(17)} ${String(a90.n).padStart(5)}  ${fmtAcc(a90)}  ${fmtAcc(a180)}  ${fmtAcc(a365)}${note}`);
  }
  const wait = rows.filter(r => r.sig === 'WAIT').length;
  console.log(`  ${'WAIT'.padEnd(17)} ${String(wait).padStart(5)}  (not evaluated)`);
  console.log('  ' + '─'.repeat(W));
}

function printYearBreakdown(rows) {
  const W = 84;
  console.log('\n  PER-YEAR ACCURACY  (BUY+WATCH+AVOID combined, 180d window)');
  console.log('  ' + '─'.repeat(W));
  console.log(`  ${'Year'.padEnd(6)}  ${'Signals'.padStart(8)}  ${'BUY+WATCH'.padEnd(22)}  ${'AVOID'.padEnd(22)}  ${'Overall'}`);
  console.log('  ' + '─'.repeat(W));
  for (let yr = 2018; yr <= 2024; yr++) {
    const subset = rows.filter(r => r.date.getFullYear() === yr);
    const bw  = sigAcc(subset, 'BUY+WATCH', 'ok180');
    const av  = sigAcc(subset, 'AVOID',     'ok180');
    const all = sigAcc(subset, 'BUY+WATCH', 'ok180');
    const allRows = [...subset.filter(r => r.sig !== 'WAIT')];
    const counted = allRows.filter(r => r.ok180 !== null);
    const correct = counted.filter(r => r.ok180 === true);
    const pct     = counted.length ? +(correct.length / counted.length * 100).toFixed(1) : null;
    const overallStr = pct !== null ? `${correct.length}/${counted.length} (${pct}%)` : '—';
    const marker = yr <= 2021 ? ' [train]' : ' [test] ';
    console.log(
      `  ${String(yr).padEnd(6)}${marker}  ${String(subset.length).padStart(5)}  ` +
      `${fmtAcc(bw)}  ${fmtAcc(av)}  ${overallStr}`
    );
  }
  console.log('  ' + '─'.repeat(W));
}

function printEtfBreakdown(rows) {
  const W = 84;
  console.log('\n  PER-ETF ACCURACY  (180d window, full 2018–2024)');
  console.log('  ' + '─'.repeat(W));
  console.log(`  ${'ETF'.padEnd(6)}  ${'Signals'.padStart(8)}  ${'BUY+WATCH'.padEnd(22)}  ${'AVOID'.padEnd(22)}  ${'Overall'}`);
  console.log('  ' + '─'.repeat(W));
  for (const etf of ETFS) {
    const subset  = rows.filter(r => r.etf === etf);
    const bw      = sigAcc(subset, 'BUY+WATCH', 'ok180');
    const av      = sigAcc(subset, 'AVOID',     'ok180');
    const counted = subset.filter(r => r.sig !== 'WAIT' && r.ok180 !== null);
    const correct = counted.filter(r => r.ok180 === true);
    const pct     = counted.length ? +(correct.length / counted.length * 100).toFixed(1) : null;
    const overallStr = pct !== null ? `${correct.length}/${counted.length} (${pct}%)` : '—';
    console.log(
      `  ${etf.padEnd(6)}           ${String(subset.length).padStart(5)}  ` +
      `${fmtAcc(bw)}  ${fmtAcc(av)}  ${overallStr}`
    );
  }
  console.log('  ' + '─'.repeat(W));
}

function printTopSignals(rows) {
  const W = 84;
  const evaluated = rows.filter(r => r.ok90 !== null);
  const top = [...evaluated].sort((a, b) => b.total - a.total).slice(0, 20);
  function retStr(v) { return v === null ? '  —  ' : (v >= 0 ? '+' : '') + v + '%'; }
  console.log('\n  TOP 20 SIGNALS BY SCORE  (evaluated only)');
  console.log('  ' + '─'.repeat(W));
  console.log(`  ${'Date'.padEnd(8)} ${'ETF'.padEnd(6)} ${'Sig'.padEnd(7)} ${'Score'.padStart(6)} ${'Drop'.padStart(7)} ${'90d'.padStart(8)} ${'180d'.padStart(8)} ${'365d'.padStart(8)} ${'Set'.padStart(6)}`);
  console.log('  ' + '─'.repeat(W));
  for (const r of top) {
    console.log(
      `  ${yymm(r.date).padEnd(8)} ${r.etf.padEnd(6)} ${r.sig.padEnd(7)} ${String(r.total).padStart(6)} ` +
      `${('-' + r.drop + '%').padStart(7)} ${retStr(r.pct90).padStart(8)} ${retStr(r.pct180).padStart(8)} ${retStr(r.pct365).padStart(8)} ${r.set.padStart(6)}`
    );
  }
  console.log('  ' + '─'.repeat(W));
}

// ── Main ───────────────────────────────────────────────────────────────────
async function main() {
  const W = 84;
  console.log('\n' + '='.repeat(W));
  console.log('  BACKTEST 2  —  Strict no-look-ahead, 8 ETFs, 2018–2024');
  console.log('  Training: 2018–2021   |   Test: 2022–2024');
  console.log('  Active factors: drop(25%) + VIX(15%) + TNX(15%) + F&G(15%) + neutral defaults');
  console.log('  ⚠  WARNING: PE uses current values, not historical — slight forward bias');
  console.log('='.repeat(W));

  console.log('\n  Fetching Yahoo Finance session...');
  const sess = await getSession();
  console.log(`  Session ready. Fetching data for ${ETFS.length} ETFs + ^VIX + ^TNX (1s delay each)...\n`);

  // Fetch all series
  const series = {};
  const allSymbols = [...ETFS, '^VIX', '^TNX'];
  for (const sym of allSymbols) {
    process.stdout.write(`  Fetching ${sym.padEnd(6)} ...`);
    try {
      series[sym] = await fetchMonthlyPrices(sym, sess);
      console.log(` ${series[sym].length} months`);
    } catch (err) {
      console.log(` ERROR: ${err.message}`);
      series[sym] = [];
    }
  }

  process.stdout.write('\n  Fetching F&G historical ...');
  const fngAvg = await fetchFngMonthlyAvg();
  console.log(` ${Object.keys(fngAvg).length} months\n`);

  // ── Score every month in range ─────────────────────────────────────────
  const allResults = [];
  let totalMonths = 0;

  for (const etf of ETFS) {
    const prices = series[etf];
    if (!prices.length) { console.log(`  SKIP ${etf} — no data`); continue; }

    let etfCount = 0;
    process.stdout.write(`  Scoring ${etf.padEnd(6)} `);

    for (let i = 0; i < prices.length; i++) {
      const { date, close } = prices[i];
      const inTrain = date >= TRAIN_START && date <= TRAIN_END;
      const inTest  = date >= TEST_START  && date <= TEST_END;
      if (!inTrain && !inTest) continue;

      // Principle 2: only data available at this point in time
      const high52 = rolling52WHigh(prices, i);
      if (!high52 || high52 <= 0) continue; // need full 12-month lookback

      const vixEntry = closestTo(series['^VIX'], date);
      const tnxEntry = closestTo(series['^TNX'], date);
      if (!vixEntry || !tnxEntry) continue;
      const vix = vixEntry.close;
      const tnx = tnxEntry.close;

      const monthKey = yymm(date);
      const fng = fngAvg[monthKey] ?? 45; // neutral fallback

      const { total, drop, sig } = scoreMonth(close, high52, vix, tnx, fng);

      // Outcome: only use prices AFTER this date
      const futurePrices = prices.filter(p => p.date > date);
      const pct90  = pctAfter(futurePrices, close, date, 90);
      const pct180 = pctAfter(futurePrices, close, date, 180);
      const pct365 = pctAfter(futurePrices, close, date, 365);

      allResults.push({
        etf, date, sig, total, drop,
        vix: +vix.toFixed(2), tnx: +tnx.toFixed(2), fng,
        pct90,  ok90:  isCorrect(sig, pct90),
        pct180, ok180: isCorrect(sig, pct180),
        pct365, ok365: isCorrect(sig, pct365),
        set: inTrain ? 'train' : 'test',
      });
      etfCount++;
      process.stdout.write('.');
    }
    console.log(` ${etfCount} months scored`);
    totalMonths += etfCount;
  }

  const trainResults = allResults.filter(r => r.set === 'train');
  const testResults  = allResults.filter(r => r.set === 'test');

  // ── Print results ──────────────────────────────────────────────────────
  console.log('\n\n' + '='.repeat(W));
  console.log('  RESULTS');
  console.log(`  Total signals: ${allResults.length}  (train: ${trainResults.length}  test: ${testResults.length})`);
  console.log('='.repeat(W));

  printBlock('TRAINING SET  2018–2021', trainResults);
  printBlock('TEST SET  2022–2024',     testResults);
  printBlock('COMBINED  2018–2024',     allResults);

  printYearBreakdown(allResults);
  printEtfBreakdown(allResults);
  printTopSignals(allResults);

  // ── Signal distribution ────────────────────────────────────────────────
  console.log('\n  SIGNAL DISTRIBUTION');
  console.log('  ' + '─'.repeat(50));
  for (const sig of ['BUY', 'WATCH', 'WAIT', 'AVOID']) {
    const train = trainResults.filter(r => r.sig === sig).length;
    const test  = testResults.filter(r => r.sig === sig).length;
    const total = allResults.filter(r => r.sig === sig).length;
    console.log(`  ${sig.padEnd(7)}  train: ${String(train).padStart(4)}  test: ${String(test).padStart(4)}  total: ${String(total).padStart(4)}`);
  }
  console.log('  ' + '─'.repeat(50));
  console.log(`\n  Note: PE, short interest, and news use neutral defaults (historical unavailable).`);
  console.log(`  Active scoring factors: price drop + VIX + TNX + F&G (monthly averages).\n`);
  console.log('='.repeat(W) + '\n');

  // ── Persist snapshots ────────────────────────────────────────────────────
  const snapshots = allResults.map(r => {
    // Re-derive macroScore from stored factor values (4 active factors only)
    const ds2  = dropScore({ price: 100 - r.drop, high52: 100 });
    const vs2  = vixScore(r.vix);
    const ts2  = tnxScore(r.tnx);
    const fgS2 = fngScore(r.fng);
    const macroScore = +(ds2.weighted + vs2.weighted + ts2.weighted + fgS2.weighted).toFixed(2);
    return {
      ticker:     r.etf,
      date:       r.date.toISOString().slice(0, 10),
      signal:     r.sig,
      factors:    { drop: +r.drop.toFixed(2), vix: r.vix, tnx: r.tnx, fng: r.fng },
      macroScore,
      score:      r.total,
      return90d:  r.pct90  !== null ? +(r.pct90  / 100).toFixed(4) : null,
      return180d: r.pct180 !== null ? +(r.pct180 / 100).toFixed(4) : null,
      return365d: r.pct365 !== null ? +(r.pct365 / 100).toFixed(4) : null,
      ok90:       r.ok90  ?? null,
      ok180:      r.ok180 ?? null,
      ok365:      r.ok365 ?? null,
      isTestSet:  r.set === 'test',
    };
  });
  fs.writeFileSync('./backtest-snapshots.json', JSON.stringify(snapshots, null, 2));
  console.log(`  ✓ Snapshots saved: ${snapshots.length} records → backtest-snapshots.json\n`);
}

main().catch(err => {
  console.error('Error:', err.response?.data || err.message);
  process.exit(1);
});
