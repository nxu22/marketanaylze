const axios    = require('axios');
const Anthropic = require('@anthropic-ai/sdk');

const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

const SCORE_TO_PTS = { 2: 10, 1: 7, 0: 5, '-1': 2, '-2': 0 };

function dateStr(unixSec) {
  return new Date(unixSec * 1000).toISOString().slice(0, 10);
}

async function fetchNewsHeadlines(symbol) {
  const key  = process.env.FINNHUB_KEY;
  const to   = Math.floor(Date.now() / 1000);
  const from = to - 7 * 24 * 60 * 60;
  const url  = `https://finnhub.io/api/v1/company-news?symbol=${encodeURIComponent(symbol)}&from=${dateStr(from)}&to=${dateStr(to)}&token=${key}`;
  try {
    const res = await axios.get(url);
    return (res.data || []).slice(0, 20);
  } catch {
    return [];
  }
}

async function analyzeWithClaude(symbol, articles) {
  const lines = articles.map((a, i) => {
    const hl  = (a.headline || '').replace(/"/g, "'");
    const sum = a.summary ? ' — ' + a.summary.slice(0, 100).replace(/"/g, "'") : '';
    return `${i + 1}. ${hl}${sum}`;
  }).join('\n');

  const prompt =
    `From these news headlines for ${symbol}, ` +
    `select the 3 most important ones that could impact stock price.\n` +
    `Prioritize: multi-year contracts, earnings beats, major partnerships, analyst upgrades/downgrades.\n` +
    `Ignore: generic market commentary, unrelated articles.\n` +
    `Then analyze sentiment and return JSON only (no markdown, no extra text):\n` +
    `{\n` +
    `  "selected_headlines": ["headline1", "headline2", "headline3"],\n` +
    `  "score": 0,\n` +
    `  "catalyst": "none",\n` +
    `  "contract_value": null,\n` +
    `  "multi_year": false,\n` +
    `  "importance": "medium",\n` +
    `  "summary": "..."\n` +
    `}\n\n` +
    `Fields:\n` +
    `  selected_headlines: array of 3 headline strings (fewer if fewer articles)\n` +
    `  score: integer -2 to 2\n` +
    `  catalyst: one of major_contract/earnings_beat/upgrade/partnership/none/downgrade/lawsuit/miss\n` +
    `  contract_value: dollar amount string if mentioned, else null\n` +
    `  multi_year: true if multi-year or long-term contract mentioned, else false\n` +
    `  importance: high/medium/low based on potential price impact\n` +
    `  summary: one sentence in Chinese summarizing the key news\n\n` +
    `Score guide: +2=major multi-year contract or massive earnings beat, +1=positive/upgrade/partnership, 0=neutral, -1=negative/downgrade, -2=lawsuit/major miss/scandal\n\n` +
    `Headlines:\n${lines}`;

  const msg = await client.messages.create({
    model: 'claude-haiku-4-5-20251001',
    max_tokens: 1024,
    messages: [{ role: 'user', content: prompt }],
  });

  const text = msg.content[0].text.trim();
  const json = text.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/i, '').trim();
  return JSON.parse(json);
}

async function fetchNewsSentiment(symbol) {
  const articles = await fetchNewsHeadlines(symbol);
  if (articles.length === 0) {
    return {
      headlines: 0, sentiment: 'no news', catalyst: 'none',
      contractValue: null, multiYear: false, importance: 'low',
      selectedHeadlines: [], summary: '暂无新闻', raw: 5,
    };
  }

  let analysis;
  try {
    analysis = await analyzeWithClaude(symbol, articles);
  } catch (err) {
    process.stderr.write(`  [news] ${symbol} Claude error: ${err.message}\n`);
    return {
      headlines: articles.length, sentiment: 'parse error', catalyst: 'none',
      contractValue: null, multiYear: false, importance: 'low',
      selectedHeadlines: [], summary: '分析失败', raw: 5,
    };
  }

  const raw_score = Number(analysis.score);
  const score = isNaN(raw_score) ? 0 : Math.max(-2, Math.min(2, Math.round(raw_score)));
  const pts = SCORE_TO_PTS[String(score)];
  let raw = pts !== undefined ? pts : 5;
  if (analysis.multi_year) raw = Math.min(10, raw + 2);

  const sentiment =
    score >= 2   ? 'strongly positive' :
    score === 1  ? 'positive'          :
    score === 0  ? 'neutral'           :
    score === -1 ? 'negative'          : 'strongly negative';

  return {
    headlines:        articles.length,
    sentiment,
    catalyst:         analysis.catalyst          ?? 'none',
    contractValue:    analysis.contract_value     ?? null,
    multiYear:        !!analysis.multi_year,
    importance:       analysis.importance         ?? 'medium',
    selectedHeadlines: analysis.selected_headlines ?? [],
    summary:          analysis.summary            ?? '',
    raw,
  };
}

module.exports = { fetchNewsSentiment };
