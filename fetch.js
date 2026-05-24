// Yahoo Finance's response headers exceed Node's 8 KB default; relaunch once with a higher limit.
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

const { STOCKS }                                          = require('./config');
const { getSession, fetchStock, fetchVIX, fetchTNX, fetchFearAndGreed, fetchMarketCycle } = require('./yahoo');
const { fetchNewsSentiment }                              = require('./news');
const { filterResult, vixScore, fngScore, tnxScore }     = require('./scoring');
const {
  printHeader, printMarketCycle,
  printPriceTable, printFundamentalsTable, printFilterDetail,
  printDropScoreTable, printVixScore, printFngScore, printTnxScore,
  printPeScoreTable, printShortScoreTable, printNewsScoreTable,
  printFinalSummary, printMacro,
} = require('./display');

function checkDataIntegrity(stocks) {
  const failures = [];
  for (const s of stocks) {
    const issues = [];
    if (!s.price || s.price <= 0)
      issues.push('null/zero price');
    if (s.price && s.high52 && s.high52 < s.price * 0.98)
      issues.push(`52W high $${s.high52.toFixed(2)} < price $${s.price.toFixed(2)}`);
    if (s.pe !== null && (s.pe > 10000 || s.pe < -1000))
      issues.push(`PE anomaly: ${s.pe.toFixed(1)}`);
    if (issues.length) failures.push({ symbol: s.symbol, issues });
  }

  const total = stocks.length;
  const passed = total - failures.length;

  if (failures.length === 0) {
    console.log(`  ✅ Data check passed: ${passed}/${total} stocks\n`);
    return true;
  }

  console.log(`  ⚠️  Data check: ${passed}/${total} passed — ${failures.length} failure(s):`);
  for (const f of failures) {
    console.log(`     ${f.symbol.padEnd(6)} — ${f.issues.join(', ')}`);
  }
  console.log('');

  if (failures.length > 3) {
    console.log('  DATA ERROR: check API connection\n');
    return false;
  }
  return true;
}

async function main() {
  printHeader();

  console.log('\n  Fetching session...');
  const sess = await getSession();
  console.log('  Session ready. Fetching data...\n');

  const [stocks, vix, tnx, fng, cycle] = await Promise.all([
    Promise.all(STOCKS.map(s => fetchStock(s, sess))),
    fetchVIX(sess),
    fetchTNX(sess),
    fetchFearAndGreed(),
    fetchMarketCycle(sess),
  ]);

  if (!checkDataIntegrity(stocks)) process.exit(1);

  const passing = stocks.filter(s => filterResult(s).startsWith('PASS'));
  const newsMap = {};
  const BATCH = 5;
  for (let i = 0; i < passing.length; i += BATCH) {
    const chunk = passing.slice(i, i + BATCH);
    await Promise.all(chunk.map(async s => {
      newsMap[s.symbol] = await fetchNewsSentiment(s.symbol);
    }));
    if (i + BATCH < passing.length) await new Promise(r => setTimeout(r, 500));
  }

  printMarketCycle(cycle);
  printPriceTable(stocks);
  printFundamentalsTable(stocks);
  printFilterDetail(stocks);
  printDropScoreTable(passing);

  const vs = vixScore(vix);
  printVixScore(vix, vs);

  const fs = fngScore(fng.value);
  printFngScore(fng, fs);

  const ts = tnxScore(tnx);
  printTnxScore(tnx, ts);

  printPeScoreTable(passing);
  printShortScoreTable(passing);
  printNewsScoreTable(passing, newsMap);
  printFinalSummary(passing, newsMap, vs, ts, fs, vix, fng);
  printMacro(vix, tnx, fng);
}

main().catch(err => {
  console.error('Error:', err.response?.data || err.message);
  process.exit(1);
});
