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
