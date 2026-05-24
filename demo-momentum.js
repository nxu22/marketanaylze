// Quick smoke test for momentum scoring.
// Tests: NVDA (full history), CRWV (new IPO, partial history), RGTI (volatile small-cap)
// Run: node demo-momentum.js

const { getSession }           = require('./yahoo');
const { fetchPriceHistory }    = require('./momentum-fetch');
const { momentumScoreWithBreakdown } = require('./momentum');

const TICKERS = ['NVDA', 'CRWV', 'RGTI'];

function bar(points, maxPoints) {
  if (maxPoints === 0) return '[skipped]';
  const filled = Math.round((points / maxPoints) * 10);
  return '[' + '█'.repeat(filled) + '░'.repeat(10 - filled) + `]  ${points.toFixed(1)}/${maxPoints.toFixed(1)}`;
}

function printResult(r) {
  const signalColors = { BUY: '\x1b[32m', WATCH: '\x1b[33m', WAIT: '\x1b[90m', AVOID: '\x1b[31m' };
  const reset = '\x1b[0m';
  const sc = signalColors[r.signal] ?? '';

  console.log(`\n${'─'.repeat(60)}`);
  console.log(`  ${r.ticker}   ${sc}${r.signal}${reset}   score ${r.score.toFixed(2)}   [${r.dataQuality}]   ${r.daysOfData} 天数据`);
  console.log('─'.repeat(60));

  if (!r.breakdown.length) {
    console.log('  数据不足，无法评分');
    return;
  }

  for (const b of r.breakdown) {
    const skipped = b.maxPoints === 0;
    console.log(`  ${b.factor.padEnd(12)}  ${bar(b.points, b.maxPoints)}`);
    console.log(`               ${b.displayValue.padEnd(10)}  ${b.explanation}`);
    if (skipped) console.log(`               ⚠  跳过此因子，不影响其他因子权重`);
    console.log();
  }
}

async function main() {
  console.log('获取 Yahoo Finance session…');
  const sess = await getSession();

  for (const ticker of TICKERS) {
    process.stdout.write(`拉取 ${ticker} 历史数据… `);
    try {
      const history = await fetchPriceHistory(ticker, sess);
      console.log(`${history.closes.length} 天`);
      const result = momentumScoreWithBreakdown(ticker, history);
      printResult(result);
    } catch (e) {
      console.log(`\n  [ERROR] ${e.message}`);
    }
  }
}

main().catch(console.error);
