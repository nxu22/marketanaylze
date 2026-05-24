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

const { getSession, fetchStock, fetchVIX, fetchTNX, fetchFearAndGreed } = require('./yahoo');
const { fetchNewsSentiment } = require('./news');
const { scoreWithBreakdown } = require('./scoring');

// ── Print helpers ──────────────────────────────────────────────────────────
function bar(points, max) {
  const filled = max > 0 ? Math.round((points / max) * 12) : 0;
  return '█'.repeat(Math.min(12, filled)) + '░'.repeat(12 - Math.min(12, filled));
}

const SIGNAL_COLOR = { BUY: '🟢', WATCH: '🟡', WAIT: '⬜', AVOID: '🔴' };

function printResult(result) {
  const W = 78;
  const { ticker, score, signal, timestamp, breakdown } = result;

  console.log('='.repeat(W));
  console.log(`  ${ticker}  |  ${score}分  |  ${signal} ${SIGNAL_COLOR[signal] ?? ''}  |  ${timestamp.slice(0, 19)}`);
  console.log('='.repeat(W));

  console.log('\n  因子明细:');
  for (const f of breakdown) {
    const pct  = f.maxPoints > 0 ? Math.round((f.points / f.maxPoints) * 100) : 0;
    const icon = f.sentiment === 'positive' ? '↑' : f.sentiment === 'negative' ? '↓' : '→';
    console.log(`  ${icon} ${f.factor.padEnd(15)} ${f.displayValue.padEnd(20)} ${f.points}/${f.maxPoints}  [${bar(f.points, f.maxPoints)}] ${pct}%`);
    console.log(`    ${f.explanation}`);
  }

  console.log('\n  完整 JSON:');
  console.log(JSON.stringify(result, null, 2));
  console.log('='.repeat(W) + '\n');
}

// ── Main ───────────────────────────────────────────────────────────────────
const TICKERS = ['SPY', 'QQQ', 'NVDA'];

async function main() {
  console.log('\nFetching Yahoo Finance session...');
  const sess = await getSession();
  console.log('Session ready.\n');

  const [vix, tnx, fng] = await Promise.all([
    fetchVIX(sess), fetchTNX(sess), fetchFearAndGreed(),
  ]);
  console.log(`Macro: VIX ${vix.toFixed(2)}  |  TNX ${tnx.toFixed(2)}%  |  F&G ${fng.value} (${fng.label})\n`);

  for (const ticker of TICKERS) {
    process.stdout.write(`Fetching ${ticker} stock data...`);
    const stock = await fetchStock(ticker, sess);
    console.log(' done.');

    process.stdout.write(`Fetching ${ticker} news (Claude)...`);
    const news = await fetchNewsSentiment(ticker);
    console.log(' done.\n');

    const result = scoreWithBreakdown(stock, vix, tnx, fng, news);
    printResult(result);
  }
}

main().catch(err => {
  console.error('Error:', err.response?.data || err.message);
  process.exit(1);
});
