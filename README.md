# Market Analyzer

Personal investment decision system for tracking 29 US tech/growth stocks across 8 sectors.  
Two independent scoring systems — **dip-buying (抄底)** and **momentum (追涨)** — each producing a 0-10 signal score updated daily via a Next.js web dashboard.

---

## Architecture Overview

```
┌─────────────────────────────────────────────────────────────────┐
│                        External APIs                            │
│                                                                 │
│  Yahoo Finance (free)    Alternative.me (free)   Finnhub (free) │
│  ├─ Stock price/PE/short ├─ Fear & Greed index   └─ News (7d)   │
│  ├─ VIX / TNX            └─ 0–100 sentiment                     │
│  └─ 260d OHLCV history                  Claude AI (paid)        │
│                                         └─ Haiku: news analysis  │
└────────────┬───────────────────────────────────┬────────────────┘
             │                                   │
     ┌───────▼──────────┐             ┌──────────▼──────────┐
     │  REVERSAL 抄底   │             │  MOMENTUM 追涨      │
     │  scoring.js      │             │  momentum.js        │
     │  7 factors       │             │  4 factors          │
     │  score 0–10      │             │  score 0–10         │
     └───────┬──────────┘             └──────────┬──────────┘
             │                                   │
             └──────────────┬────────────────────┘
                            │
                ┌───────────▼───────────┐
                │   Next.js Web App     │
                │   web/                │
                │                       │
                │  /api/watchlist       │
                │  /api/watchlist/refresh│
                │  /api/momentum        │
                │  /api/momentum/refresh│
                │                       │
                │  Tab: 抄底 REVERSAL   │
                │  Tab: 追涨 MOMENTUM   │
                │  ⟳ Refresh each / All │
                └───────────────────────┘
```

---

## Scoring Systems

### 抄底 REVERSAL — Buy the Dip
> "Is this stock cheap enough + is the market scared enough to buy?"

| Factor | Weight | High score when |
|--------|--------|-----------------|
| 价格回撤 Drop from 52W high | 25% | Stock is down >30% from peak |
| 市场恐慌度 VIX | 15% | VIX > 35 (extreme fear) |
| 恐贪指数 Fear & Greed | 15% | F&G < 25 (extreme fear) |
| 国债收益率 10Y yield | 15% | TNX < 3.5% (cheap money) |
| 估值 PE ratio | 15% | PE < 15 (undervalued) |
| 做空比率 Short ratio | 8% | Short ratio < 1 day |
| 新闻情绪 News (Claude) | 7% | Claude rates +2 (major catalyst) |

### 追涨 MOMENTUM — Trend Following
> "Is this stock already in a strong uptrend worth joining?"

| Factor | Weight | High score when |
|--------|--------|-----------------|
| 52W高点接近度 52W high proximity | 30% | Within 3% of all-time high |
| 200日均线位置 Price vs 200-day MA | 25% | 15%+ above 200MA |
| 放量突破 Breakout + volume | 25% | 20-day high + 1.5× avg volume |
| 均线斜率 200-day MA slope | 20% | MA rising +2%+ over 30 days |

**Data quality handling:** Stocks with < 200 days of history skip unavailable factors and normalize the score proportionally (never hardcode 0).

### Signal thresholds (both systems)
| Score | Signal | Meaning |
|-------|--------|---------|
| ≥ 7 | 🟢 BUY | Strong signal, conditions met |
| ≥ 5 | 🟡 WATCH | Approaching buy zone |
| ≥ 3 | ⬜ WAIT | Not ready yet |
| < 3 | 🔴 AVOID | Actively avoid |

---

## Stock Universe (29 tickers, 8 sectors)

| Sector | Tickers |
|--------|---------|
| 半导体 Semiconductors | SOXX, NVDA, AMD, AVGO, MU |
| 核能 Nuclear | CEG, VST, SMR, CCJ |
| 光通信 Optical | ANET, COHR, LITE, CIEN |
| 网络安全 Cybersecurity | CRWD, PANW, ZS, S |
| 医疗AI Medical AI | ISRG, TEM |
| 国防航天 Defense/Space | ITA, RKLB, LMT |
| AI算力云 AI Compute | CRWV, IREN, APLD, NBIS |
| 量子计算 Quantum | IONQ, RGTI, QUBT |

---

## Project Structure

```
market-analyzer/
│
├── yahoo.js              # Yahoo Finance: stock data, VIX, TNX, F&G, session
├── news.js               # Finnhub headlines → Claude Haiku sentiment
├── scoring.js            # Reversal scoring: 7-factor dip-buying model
├── momentum-fetch.js     # Yahoo Finance: 260-day OHLCV price history
├── momentum.js           # Momentum scoring: 4-factor trend model
├── fetch.js              # CLI runner for reversal scoring
├── demo.js               # Quick demo: SPY/QQQ/NVDA
├── demo-momentum.js      # Quick demo: NVDA/CRWV/RGTI momentum
├── config.js             # Weights, headers, filter rules
│
└── web/                  # Next.js 14 dashboard
    ├── app/
    │   ├── page.tsx                          # Home page (SSR)
    │   └── api/
    │       ├── watchlist/route.ts            # GET reversal scores
    │       ├── watchlist/refresh/route.ts    # POST batch reversal refresh
    │       ├── momentum/route.ts             # GET momentum scores
    │       └── momentum/refresh/route.ts     # POST batch momentum refresh
    ├── components/
    │   ├── WatchlistClient.tsx   # Main UI: tabs, tables, alerts
    │   ├── BreakdownPanel.tsx    # Factor detail expandable row
    │   └── Sparkline.tsx         # 30-day score sparkline
    ├── lib/
    │   ├── bridge.ts             # Webpack-safe loader for root CJS modules
    │   ├── scorer.ts             # Reversal scorer with macro cache (5-min TTL)
    │   ├── momentum-scorer.ts    # Momentum scorer with session cache
    │   ├── history.ts            # R/W latest-scores.json + scores-history.json
    │   ├── momentum-history.ts   # R/W momentum-scores.json + momentum-scores-history.json
    │   ├── stock-universe.ts     # 29 tickers grouped by sector
    │   └── types.ts              # Shared TypeScript interfaces
    └── data/
        ├── latest-scores.json             # Most recent reversal scores
        ├── scores-history.json            # 90-day rolling reversal history
        ├── momentum-scores.json           # Most recent momentum scores
        └── momentum-scores-history.json   # 90-day rolling momentum history
```

---

## Setup

### Prerequisites
- Node.js 18+
- **Your own API keys** in a `.env` file at the project root (this file is gitignored — never shared):

```env
ANTHROPIC_API_KEY=sk-ant-...      # your own key from console.anthropic.com
FINNHUB_KEY=your_finnhub_key      # your own key from finnhub.io
```

> ⚠️ You must register for these services yourself and use your own keys.  
> The repo does not include any API keys.

- Finnhub free tier (no credit card): https://finnhub.io  
- Anthropic API (pay-per-use, Haiku is very cheap): https://console.anthropic.com

### Install

```bash
# Root CLI tools
npm install

# Web dashboard
cd web && npm install
```

### Run

```bash
# CLI demo (reversal)
node --max-http-header-size=131072 demo.js

# CLI demo (momentum)
node --max-http-header-size=131072 demo-momentum.js

# Web dashboard
cd web && npm run dev
# → http://localhost:3000
```

---

## Web Dashboard Features

- **Dual-tab system** — switch between 抄底 REVERSAL and 追涨 MOMENTUM
- **Industry grouping** — collapsible panels per sector with avg score
- **Flat sort view** — all 29 tickers ranked by score
- **Change detection** — daily delta vs previous day, signal alerts (new BUY, dropped BUY, big moves >1.5)
- **30-day sparkline** — score trend mini-chart per ticker
- **Factor breakdown** — click any row to expand full factor explanation (Chinese)
- **Independent refresh** — refresh either system separately, or use ⟳ 全部刷新 for both sequentially
- **Data quality badge** — momentum scores flag `partial`/`insufficient` for new IPOs

---

## Personal Trading Rules (stored in memory)

| Signal | Max Position |
|--------|-------------|
| AVOID / WAIT | No action |
| small_test | ≤ 5% |
| normal | ≤ 15% |
| heavy | ≤ 25% (absolute cap 30%) |

Risk rules: cut in half if < 5 similar historical cases; cut in half again if using proxy data.  
Stop-loss: −8% → reduce by half; −15% → full exit.

---

## Tech Stack

| Layer | Tech |
|-------|------|
| Data fetching | axios, Yahoo Finance v8/v10, Finnhub REST |
| AI analysis | Anthropic SDK, claude-haiku-4-5 |
| Scoring | Pure JavaScript, no ML |
| Web framework | Next.js 14 App Router |
| UI | React 18, Tailwind CSS, recharts (sparklines) |
| Language | TypeScript (web), CommonJS JavaScript (root) |
| Storage | Local JSON files (no database) |
