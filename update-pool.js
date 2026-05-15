const fs   = require('fs');
const path = require('path');

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

const ETFS = ['SOXX', 'NLR', 'FIVG', 'ARKG', 'CIBR', 'ITA', 'QTUM', 'IGV'];

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function fetchTopHoldings(symbol, sess) {
  const crumbParam = sess.crumb ? `&crumb=${encodeURIComponent(sess.crumb)}` : '';
  const url = `https://query1.finance.yahoo.com/v10/finance/quoteSummary/${encodeURIComponent(symbol)}?modules=topHoldings${crumbParam}`;
  const res = await axios.get(url, {
    headers: {
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
      'Accept': 'application/json',
      Cookie: sess.cookies,
    },
  });
  return res.data.quoteSummary.result[0].topHoldings?.holdings ?? [];
}

async function fetchProfile(symbol, key) {
  const url = `https://finnhub.io/api/v1/stock/profile2?symbol=${encodeURIComponent(symbol)}&token=${key}`;
  try {
    const res = await axios.get(url);
    return res.data;
  } catch {
    return null;
  }
}

function isUsOrCanadian(symbol) {
  if (!symbol.includes('.')) return true;           // US — no suffix
  if (symbol.endsWith('.TO') || symbol.endsWith('.V')) return true; // Canadian TSX / TSX-V
  return false;
}

async function main() {
  const key = process.env.FINNHUB_KEY;

  // ── Step 1: fetch top 10 holdings for each ETF ────────────────────────────
  console.log('Fetching Yahoo Finance session...');
  const sess = await getSession();
  console.log('Session ready.\n');

  const holdingsMap = {}; // symbol -> Set of ETF names
  for (const etf of ETFS) {
    const holdings = await fetchTopHoldings(etf, sess);
    console.log(`${etf.padEnd(6)} — ${holdings.length} holdings returned`);
    for (const h of holdings.slice(0, 10)) {
      if (!h.symbol) continue;
      if (!holdingsMap[h.symbol]) holdingsMap[h.symbol] = new Set();
      holdingsMap[h.symbol].add(etf);
    }
  }

  // ── Step 2: combine + deduplicate ─────────────────────────────────────────
  const allSymbols = Object.keys(holdingsMap);
  console.log(`\nUnique symbols across all ETFs : ${allSymbols.length}`);

  // ── Step 3: filter to US / Canadian exchanges only ────────────────────────
  const eligible = allSymbols.filter(isUsOrCanadian);
  console.log(`After exchange filter           : ${eligible.length}  (dropped: ${allSymbols.length - eligible.length})`);

  // ── Step 4 & 5: fetch Finnhub profile, keep marketCap > $1B ──────────────
  console.log('\nFetching Finnhub profiles (1s delay between requests)...\n');
  const results = [];

  for (const sym of eligible) {
    await sleep(1000);
    const profile = await fetchProfile(sym, key);
    // marketCapitalization from Finnhub is in millions USD
    const capM = profile?.marketCapitalization ?? 0;
    if (capM >= 1000) {
      results.push({
        symbol:    sym,
        name:      profile.name ?? '',
        sector:    profile.finnhubIndustry ?? 'N/A',
        marketCap: capM,
        etfs:      [...holdingsMap[sym]],
      });
    }
  }

  results.sort((a, b) => b.marketCap - a.marketCap);

  // ── Step 6: print final list ───────────────────────────────────────────────
  console.log(`Final pool (marketCap > $1B)   : ${results.length} stocks\n`);
  console.log(
    `${'Symbol'.padEnd(10)} ${'Market Cap'.padStart(12)} ${'Sector'.padEnd(30)} ETF Sources`
  );
  console.log('─'.repeat(80));
  for (const s of results) {
    const capStr = `$${(s.marketCap / 1000).toFixed(2)}B`;
    console.log(
      `${s.symbol.padEnd(10)} ${capStr.padStart(12)} ${s.sector.padEnd(30)} ${s.etfs.join(', ')}`
    );
  }

  // ── Step 7: overwrite STOCKS in config.js ────────────────────────────────
  const symbols     = results.map(s => s.symbol);
  const configPath  = path.join(__dirname, 'config.js');
  const configText  = fs.readFileSync(configPath, 'utf8');
  const newLine     = `const STOCKS = [${symbols.map(s => `'${s}'`).join(', ')}];`;
  const updated     = configText.replace(/^const STOCKS = \[.*?\];$/m, newLine);
  fs.writeFileSync(configPath, updated, 'utf8');
  console.log(`\nconfig.js updated with ${symbols.length} stocks`);
}

main().catch(err => {
  console.error('Error:', err.response?.data || err.message);
  process.exit(1);
});
