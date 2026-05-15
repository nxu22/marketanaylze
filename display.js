const { ETFS, FILTERS, AI_TAGS } = require('./config');
const { filterResult, dropScore, peScore, shortScore, newsScore, signal, topReason } = require('./scoring');

function fmtPrice(n)  { return n !== null ? `$${n.toFixed(2)}` : 'N/A'; }
function fmtPE(n)     { return n !== null ? n.toFixed(1) : 'N/A'; }
function fmtDE(n)     { return n !== null ? n.toFixed(1) : 'N/A'; }
function fmtCap(n) {
  if (n === null) return 'N/A';
  if (n >= 1e12) return `$${(n / 1e12).toFixed(2)}T`;
  if (n >= 1e9)  return `$${(n / 1e9).toFixed(2)}B`;
  return `$${(n / 1e6).toFixed(2)}M`;
}
function fmtCF(n) {
  if (n === null) return 'N/A';
  const abs  = Math.abs(n);
  const sign = n < 0 ? '-' : '';
  if (abs >= 1e9) return `${sign}$${(abs / 1e9).toFixed(2)}B`;
  return `${sign}$${(abs / 1e6).toFixed(2)}M`;
}
function ln(char, len) { return char.repeat(len); }

function printHeader() {
  console.log('\n' + ln('=', 78));
  console.log('  MARKET ANALYZER');
  console.log(ln('=', 78));
}

function printMarketCycle(cycle) {
  const arrow  = cycle.pctAbove >= 0 ? '▲' : '▼';
  const sign   = cycle.pctAbove >= 0 ? '+' : '';
  const bar    = cycle.pctAbove >= 0
    ? ln('█', Math.min(30, Math.round(Math.abs(cycle.pctAbove) * 2))) + ln('░', 30 - Math.min(30, Math.round(Math.abs(cycle.pctAbove) * 2)))
    : ln('░', 30 - Math.min(30, Math.round(Math.abs(cycle.pctAbove) * 2))) + ln('█', Math.min(30, Math.round(Math.abs(cycle.pctAbove) * 2)));
  console.log('\n  MARKET CYCLE  (S&P 500 vs 200-day MA)');
  console.log('  ' + ln('─', 74));
  console.log(`  Mode   : ${cycle.mode}  —  ${cycle.label}`);
  console.log(`  S&P 500: $${cycle.price.toFixed(2)}   200-day MA: $${cycle.ma200.toFixed(2)}   ${arrow} ${sign}${cycle.pctAbove.toFixed(2)}% vs MA`);
  console.log(`  [${bar}]  ${cycle.mode === 'BULL' ? 'Bull zone' : 'Bear zone'}`);
  console.log('  ' + ln('─', 74));
}

function printPriceTable(stocks) {
  console.log('  PRICE & 52-WEEK RANGE');
  console.log('  ' + ln('─', 74));
  console.log(`  ${'Symbol'.padEnd(7)} ${'Price'.padStart(10)} ${'52W High'.padStart(12)} ${'52W Low'.padStart(12)} ${'vs 52W Low'.padStart(12)}`);
  console.log('  ' + ln('─', 74));
  for (const s of stocks) {
    const pct = `+${(((s.price - s.low52) / s.low52) * 100).toFixed(1)}%`;
    console.log(
      `  ${s.symbol.padEnd(7)} ${fmtPrice(s.price).padStart(10)} ${fmtPrice(s.high52).padStart(12)} ${fmtPrice(s.low52).padStart(12)} ${pct.padStart(12)}`
    );
  }
  console.log('  ' + ln('─', 74));
}

function printFundamentalsTable(stocks) {
  console.log('\n  FUNDAMENTALS & FILTER');
  console.log('  ' + ln('─', 74));
  console.log(
    `  ${'Symbol'.padEnd(7)} ${'P/E'.padStart(7)} ${'Mkt Cap'.padStart(11)} ${'D/E'.padStart(7)} ${'Op Cash Flow'.padStart(14)} ${'Result'.padStart(8)}`
  );
  console.log('  ' + ln('─', 74));
  for (const s of stocks) {
    const result = filterResult(s);
    console.log(
      `  ${s.symbol.padEnd(7)} ${fmtPE(s.pe).padStart(7)} ${fmtCap(s.marketCap).padStart(11)} ${fmtDE(s.debtToEquity).padStart(7)} ${fmtCF(s.operatingCashflow).padStart(14)} ${result.padStart(10)}`
    );
  }
  console.log('  ' + ln('─', 74));
  console.log('  Filters: ' + FILTERS.map(f => f.label).join('  |  '));
}

function printFilterDetail(stocks) {
  console.log('\n  FILTER DETAIL');
  console.log('  ' + ln('─', 74));
  const colW   = 18;
  const header = '  ' + 'Symbol'.padEnd(7) + FILTERS.map(f => f.label.padStart(colW)).join('');
  console.log(header);
  console.log('  ' + ln('─', 74));
  for (const s of stocks) {
    const cols = ETFS.has(s.symbol)
      ? FILTERS.map(() => 'ETF (skipped)'.padStart(colW)).join('')
      : FILTERS.map(f => (f.check(s) ? 'yes' : 'NO').padStart(colW)).join('');
    console.log(`  ${s.symbol.padEnd(7)}${cols}`);
  }
  console.log('  ' + ln('─', 74));
}

function printDropScoreTable(passing) {
  console.log('\n  PRICE DROP SCORE  (weight: 25%)');
  console.log('  ' + ln('─', 74));
  console.log(
    `  ${'Symbol'.padEnd(7)} ${'Drop from 52W High'.padStart(20)} ${'Raw Score'.padStart(11)} ${'Weighted'.padStart(10)}`
  );
  console.log('  ' + ln('─', 74));
  const sorted = passing
    .map(s => ({ s, ...dropScore(s) }))
    .sort((a, b) => b.weighted - a.weighted);
  for (const { s, drop, raw, weighted } of sorted) {
    const dropStr = `-${drop.toFixed(1)}%`;
    console.log(
      `  ${s.symbol.padEnd(7)} ${dropStr.padStart(20)} ${String(raw).padStart(11)} ${String(weighted).padStart(10)}`
    );
  }
  console.log('  ' + ln('─', 74));
  console.log('  Scoring: >40% drop=10pts  30-40%=7pts  20-30%=5pts  10-20%=3pts  <10%=0pts');
}

function printVixScore(vix, vs) {
  console.log('\n  VIX SCORE  (weight: 15%,  applies to all passing stocks)');
  console.log('  ' + ln('─', 74));
  console.log(`  ${'VIX Value'.padEnd(14)} ${'Raw Score'.padStart(11)} ${'Weighted'.padStart(10)}`);
  console.log('  ' + ln('─', 74));
  console.log(`  ${vix.toFixed(2).padEnd(14)} ${String(vs.raw).padStart(11)} ${String(vs.weighted).padStart(10)}`);
  console.log('  ' + ln('─', 74));
  console.log('  Scoring: >35=10pts  25-35=7pts  18-25=4pts  <18=1pt');
}

function printFngScore(fng, fs) {
  console.log('\n  FEAR & GREED SCORE  (weight: 15%,  applies to all passing stocks)');
  console.log('  ' + ln('─', 74));
  console.log(`  ${'F&G Value'.padEnd(20)} ${'Raw Score'.padStart(11)} ${'Weighted'.padStart(10)}`);
  console.log('  ' + ln('─', 74));
  console.log(`  ${(fng.value + '  —  ' + fng.label).padEnd(20)} ${String(fs.raw).padStart(11)} ${String(fs.weighted).padStart(10)}`);
  console.log('  ' + ln('─', 74));
  console.log('  Scoring: <25=10pts  25-40=7pts  40-55=5pts  55-75=3pts  >75=0pts');
}

function printTnxScore(tnx, ts) {
  console.log('\n  10Y TREASURY YIELD SCORE  (weight: 15%,  applies to all passing stocks)');
  console.log('  ' + ln('─', 74));
  console.log(`  ${'10Y Yield'.padEnd(14)} ${'Raw Score'.padStart(11)} ${'Weighted'.padStart(10)}`);
  console.log('  ' + ln('─', 74));
  console.log(`  ${(tnx.toFixed(2) + '%').padEnd(14)} ${String(ts.raw).padStart(11)} ${String(ts.weighted).padStart(10)}`);
  console.log('  ' + ln('─', 74));
  console.log('  Scoring: <3.5%=10pts  3.5-4%=7pts  4-4.5%=5pts  4.5-5%=3pts  >5%=1pt');
}

function printPeScoreTable(passing) {
  console.log('\n  PE VALUATION SCORE  (weight: 15%)');
  console.log('  ' + ln('─', 74));
  console.log(`  ${'Symbol'.padEnd(7)} ${'P/E'.padStart(8)} ${'Raw Score'.padStart(11)} ${'Weighted'.padStart(10)}`);
  console.log('  ' + ln('─', 74));
  const sorted = passing
    .map(s => ({ s, ...peScore(s.pe) }))
    .sort((a, b) => b.weighted - a.weighted);
  for (const { s, raw, weighted } of sorted) {
    const peStr = s.pe === null ? 'N/A' : s.pe < 0 ? `${s.pe.toFixed(1)} (neg)` : s.pe.toFixed(1);
    const note  = (s.pe === null || s.pe < 0) ? ' *' : '';
    console.log(
      `  ${s.symbol.padEnd(7)} ${peStr.padStart(8)} ${String(raw).padStart(11)} ${String(weighted).padStart(10)}${note}`
    );
  }
  console.log('  ' + ln('─', 74));
  console.log('  Scoring: <15=10pts  15-25=7pts  25-40=4pts  40-60=2pts  >60=0pts  * null/neg=3pts');
}

function printShortScoreTable(passing) {
  console.log('\n  SHORT INTEREST SCORE  (weight: 8%)');
  console.log('  ' + ln('─', 74));
  console.log(`  ${'Symbol'.padEnd(7)} ${'Short Ratio'.padStart(13)} ${'Raw Score'.padStart(11)} ${'Weighted'.padStart(10)}`);
  console.log('  ' + ln('─', 74));
  const sorted = passing
    .map(s => ({ s, ...shortScore(s.shortRatio) }))
    .sort((a, b) => b.weighted - a.weighted);
  for (const { s, raw, weighted } of sorted) {
    const ratioStr = s.shortRatio === null ? 'N/A *' : s.shortRatio.toFixed(2);
    console.log(
      `  ${s.symbol.padEnd(7)} ${ratioStr.padStart(13)} ${String(raw).padStart(11)} ${String(weighted).padStart(10)}`
    );
  }
  console.log('  ' + ln('─', 74));
  console.log('  Scoring: <1=8pts  1-2=6pts  2-4=4pts  4-7=2pts  >7=0pts  * null=3pts');
}

function printNewsScoreTable(passing, newsMap) {
  console.log('\n  NEWS SENTIMENT SCORE  (weight: 7%,  powered by Claude AI + Finnhub)');
  console.log('  ' + ln('─', 110));
  console.log(
    `  ${'Symbol'.padEnd(7)} ${'Hdls'.padStart(5)} ${'Imp'.padStart(6)} ${'Sentiment'.padStart(16)} ${'Catalyst'.padStart(16)} ${'Contract'.padStart(12)} ${'Raw'.padStart(5)} ${'Wtd'.padStart(5)}  Summary`
  );
  console.log('  ' + ln('─', 110));
  const sorted = passing
    .map(s => ({ s, news: newsMap[s.symbol], ...newsScore(newsMap[s.symbol].raw) }))
    .sort((a, b) => b.weighted - a.weighted);
  for (const { s, news, raw, weighted } of sorted) {
    const cv  = news.contractValue ? String(news.contractValue) : '—';
    const my  = news.multiYear ? ' ✓' : '';
    const imp = (news.importance || 'low').padStart(6);
    const sum = news.summary || '';
    console.log(
      `  ${s.symbol.padEnd(7)} ${String(news.headlines).padStart(5)} ${imp} ${news.sentiment.padStart(16)} ${(news.catalyst || 'none').padStart(16)} ${(cv + my).padStart(12)} ${String(raw).padStart(5)} ${String(weighted).padStart(5)}  ${sum}`
    );
    if (news.selectedHeadlines && news.selectedHeadlines.length > 0) {
      for (const h of news.selectedHeadlines) {
        console.log(`  ${''.padEnd(7)}        → ${h}`);
      }
    }
  }
  console.log('  ' + ln('─', 110));
  console.log('  Scoring: +2=10pts  +1=7pts  0=5pts  -1=2pts  -2=0pts  +2pts bonus for multi-year contract');
}

function printFinalSummary(passing, newsMap, vs, ts, fs, vix, fng) {
  const summary = passing
    .map(s => {
      const ds    = dropScore(s);
      const ps    = peScore(s.pe);
      const ss    = shortScore(s.shortRatio);
      const ns    = newsScore(newsMap[s.symbol].raw);
      const total = +(ds.weighted + vs.weighted + ts.weighted + fs.weighted + ps.weighted + ss.weighted + ns.weighted).toFixed(2);
      return { s, total, drop: ds.drop };
    })
    .sort((a, b) => b.total - a.total);

  console.log('\n' + ln('=', 94));
  console.log('  FINAL SCORE SUMMARY');
  console.log(ln('=', 94));
  console.log(`  ${'Symbol'.padEnd(7)} ${'Drop'.padStart(7)} ${'VIX'.padStart(5)} ${'TNX'.padStart(5)} ${'F&G'.padStart(5)} ${'PE'.padStart(5)} ${'Short'.padStart(7)} ${'News'.padStart(6)} ${'TOTAL'.padStart(7)} ${'Signal'.padStart(7)} ${'Tag'.padStart(14)}`);
  console.log('  ' + ln('─', 94));
  for (const { s, total } of summary) {
    const ds  = dropScore(s);
    const ps  = peScore(s.pe);
    const ss  = shortScore(s.shortRatio);
    const ns  = newsScore(newsMap[s.symbol].raw);
    const sig = signal(total);
    const tag = AI_TAGS[s.symbol] ?? '';
    console.log(
      `  ${s.symbol.padEnd(7)} ${String(ds.weighted).padStart(7)} ${String(vs.weighted).padStart(5)} ${String(ts.weighted).padStart(5)} ${String(fs.weighted).padStart(5)} ${String(ps.weighted).padStart(5)} ${String(ss.weighted).padStart(7)} ${String(ns.weighted).padStart(6)} ${String(total).padStart(7)} ${sig.padStart(7)} ${tag.padStart(14)}`
    );
  }
  console.log('  ' + ln('─', 94));

  const top = summary[0];
  console.log(`\n  >> ${topReason(top.s, top.total, top.drop, vix, fng)}`);
}

function printMacro(vix, tnx, fng) {
  console.log(`\n  VIX (Volatility Index)  : ${vix.toFixed(2)}`);
  console.log(`  10Y Treasury Yield      : ${tnx.toFixed(2)}%`);
  console.log(`  Fear & Greed Index      : ${fng.value} / 100  —  ${fng.label}`);
  console.log('\n' + ln('=', 94) + '\n');
}

module.exports = {
  printHeader, printMarketCycle,
  printPriceTable, printFundamentalsTable, printFilterDetail,
  printDropScoreTable, printVixScore, printFngScore, printTnxScore,
  printPeScoreTable, printShortScoreTable, printNewsScoreTable,
  printFinalSummary, printMacro,
};
