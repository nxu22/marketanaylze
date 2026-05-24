// Momentum (追涨) scoring — completely independent of scoring.js (dip-buying).
// Input:  priceHistory from momentum-fetch.js { closes[], volumes[], dates[] }
// Output: { ticker, score, signal, dataQuality, timestamp, breakdown[] }
//
// 4 factors, max 10 points total when all data available:
//   52W high proximity   30%  (max 3.0)
//   200-day MA position  25%  (max 2.5, skipped if < 200 days)
//   Breakout + volume    25%  (max 2.5)
//   200-day MA slope     20%  (max 2.0, skipped if < 230 days)
//
// When factors are skipped, score is proportionally normalized to 10.

function avg(arr) {
  return arr.reduce((s, v) => s + v, 0) / arr.length;
}

function signalFromScore(score) {
  if (score >= 7) return 'BUY';
  if (score >= 5) return 'WATCH';
  if (score >= 3) return 'WAIT';
  return 'AVOID';
}

function momentumScoreWithBreakdown(ticker, priceHistory) {
  const { closes, volumes } = priceHistory;
  const n = closes.length;

  if (n < 20) {
    return {
      ticker,
      score: 0,
      signal: 'AVOID',
      dataQuality: 'insufficient',
      timestamp: new Date().toISOString(),
      breakdown: [],
    };
  }

  const price       = closes[n - 1];
  const todayVol    = volumes[n - 1];

  // ── Factor 1: 52W high proximity (max 3.0) ──────────────────────────────
  const lookback52  = Math.min(n, 252);
  const high52      = Math.max(...closes.slice(-lookback52));
  const highRatio   = price / high52;
  const distPct     = ((1 - highRatio) * 100).toFixed(1);

  let f1Points;
  let f1Sentiment;
  if      (highRatio >= 0.97) { f1Points = 3.0; f1Sentiment = 'positive'; }
  else if (highRatio >= 0.90) { f1Points = 2.0; f1Sentiment = 'positive'; }
  else if (highRatio >= 0.80) { f1Points = 1.0; f1Sentiment = 'neutral';  }
  else                         { f1Points = 0;   f1Sentiment = 'negative'; }

  const f1Explanation = highRatio >= 0.97
    ? `股价距 52 周高点仅 ${distPct}%，处于突破区，动量强劲`
    : highRatio >= 0.90
    ? `股价距 52 周高点 ${distPct}%，相对靠近高点`
    : highRatio >= 0.80
    ? `股价距 52 周高点 ${distPct}%，尚有一定距离`
    : `股价距 52 周高点 ${distPct}%，远离高点，动量不足`;

  // ── Factor 2: Price vs 200-day MA (max 2.5, skip if < 200 days) ─────────
  const ma200       = n >= 200 ? avg(closes.slice(-200)) : null;
  let   f2Points    = 0;
  let   f2MaxPoints = ma200 !== null ? 2.5 : 0;
  let   f2Sentiment = 'neutral';
  let   f2Explanation;

  if (ma200 !== null) {
    const maRatio = price / ma200;
    const maDiff  = ((maRatio - 1) * 100).toFixed(1);
    if      (maRatio >= 1.15) { f2Points = 2.5; f2Sentiment = 'positive'; f2Explanation = `股价高于 200 日均线 ${maDiff}%，趋势强势`; }
    else if (maRatio >= 1.05) { f2Points = 2.0; f2Sentiment = 'positive'; f2Explanation = `股价高于 200 日均线 ${maDiff}%，处于多头区间`; }
    else if (maRatio >= 1.00) { f2Points = 1.5; f2Sentiment = 'neutral';  f2Explanation = `股价刚站上 200 日均线，多空分水岭`; }
    else if (maRatio >= 0.97) { f2Points = 0.5; f2Sentiment = 'negative'; f2Explanation = `股价略低于 200 日均线 ${((1-maRatio)*100).toFixed(1)}%，趋势偏弱`; }
    else                       { f2Points = 0;   f2Sentiment = 'negative'; f2Explanation = `股价低于 200 日均线 ${((1-maRatio)*100).toFixed(1)}%，不在趋势之中`; }
  } else {
    f2Explanation = `上市历史不足 200 天，无法计算 200 日均线（当前 ${n} 天）`;
  }

  // ── Factor 3: Breakout + volume (max 2.5) ────────────────────────────────
  const past20Closes = closes.slice(-21, -1);
  const high20       = Math.max(...past20Closes);
  const atHigh20     = price >= high20;

  const vol50Len  = Math.min(n - 1, 50);
  const vol50avg  = avg(volumes.slice(-(vol50Len + 1), -1));
  const volRatio  = vol50avg > 0 ? todayVol / vol50avg : null;

  let f3Points;
  let f3Sentiment;
  let f3Explanation;

  if (atHigh20 && volRatio !== null && volRatio >= 1.5) {
    f3Points = 2.5; f3Sentiment = 'positive';
    f3Explanation = `突破 20 日新高且成交量放大至均量的 ${volRatio.toFixed(1)} 倍，突破信号有效`;
  } else if (atHigh20 && volRatio !== null && volRatio >= 1.0) {
    f3Points = 2.0; f3Sentiment = 'positive';
    f3Explanation = `站上 20 日高点，成交量正常，突破但未见明显放量`;
  } else if (atHigh20) {
    f3Points = 1.2; f3Sentiment = 'neutral';
    f3Explanation = `创 20 日新高但成交量萎缩，突破可信度一般`;
  } else if (volRatio !== null && volRatio >= 1.5) {
    f3Points = 0.8; f3Sentiment = 'neutral';
    f3Explanation = `成交量明显放大（${volRatio.toFixed(1)} 倍均量），但价格未突破 20 日高点`;
  } else {
    f3Points = 0.3; f3Sentiment = 'negative';
    f3Explanation = `无明显放量突破，动量缺失`;
  }

  // ── Factor 4: 200-day MA slope over 30 days (max 2.0, skip if < 230 days)
  // ma200_30ago = avg of closes[n-230 .. n-30] (200 elements)
  const ma200_30ago   = n >= 230 ? avg(closes.slice(n - 230, n - 30)) : null;
  let   f4Points      = 0;
  let   f4MaxPoints   = (ma200 !== null && ma200_30ago !== null) ? 2.0 : 0;
  let   f4Sentiment   = 'neutral';
  let   f4Explanation;
  let   slopePct      = null;

  if (ma200 !== null && ma200_30ago !== null) {
    slopePct = (ma200 - ma200_30ago) / ma200_30ago * 100;
    if      (slopePct >= 2.0) { f4Points = 2.0; f4Sentiment = 'positive'; f4Explanation = `200 日均线 30 天斜率 +${slopePct.toFixed(2)}%，趋势加速上扬`; }
    else if (slopePct >= 0.5) { f4Points = 1.5; f4Sentiment = 'positive'; f4Explanation = `200 日均线斜率持续上扬（+${slopePct.toFixed(2)}%），趋势健康`; }
    else if (slopePct >= 0.0) { f4Points = 1.0; f4Sentiment = 'neutral';  f4Explanation = `200 日均线斜率接近平坦（${slopePct.toFixed(2)}%），趋势待定`; }
    else                       { f4Points = 0;   f4Sentiment = 'negative'; f4Explanation = `200 日均线向下倾斜（${slopePct.toFixed(2)}%），趋势偏空`; }
  } else if (ma200 !== null) {
    f4Explanation = `历史数据不足 230 天，无法计算均线斜率（当前 ${n} 天）`;
  } else {
    f4Explanation = `历史数据不足，无法计算均线斜率`;
  }

  // ── Normalize and total ──────────────────────────────────────────────────
  const breakdown = [
    {
      factor:       '52W高点接近度',
      rawValue:     highRatio,
      displayValue: `${(highRatio * 100).toFixed(1)}%`,
      points:       f1Points,
      maxPoints:    3.0,
      explanation:  f1Explanation,
      sentiment:    f1Sentiment,
    },
    {
      factor:       '200日均线位置',
      rawValue:     ma200 !== null ? price / ma200 : null,
      displayValue: ma200 !== null ? `${((price / ma200 - 1) * 100).toFixed(1)}%` : 'N/A',
      points:       f2Points,
      maxPoints:    f2MaxPoints,
      explanation:  f2Explanation,
      sentiment:    f2Sentiment,
    },
    {
      factor:       '放量突破',
      rawValue:     volRatio,
      displayValue: volRatio !== null ? `${volRatio.toFixed(2)}x` : 'N/A',
      points:       f3Points,
      maxPoints:    2.5,
      explanation:  f3Explanation,
      sentiment:    f3Sentiment,
    },
    {
      factor:       '均线斜率',
      rawValue:     slopePct,
      displayValue: slopePct !== null ? `${slopePct.toFixed(2)}%` : 'N/A',
      points:       f4Points,
      maxPoints:    f4MaxPoints,
      explanation:  f4Explanation,
      sentiment:    f4Sentiment,
    },
  ];

  const earned       = breakdown.reduce((s, b) => s + b.points, 0);
  const maxAvailable = breakdown.reduce((s, b) => s + b.maxPoints, 0);
  const rawScore     = maxAvailable > 0 ? (earned / maxAvailable) * 10 : 0;
  const score        = Math.round(Math.min(10, rawScore) * 100) / 100;

  const dataQuality = n >= 200 ? 'full' : n >= 100 ? 'partial' : 'insufficient';

  return {
    ticker,
    score,
    signal:      signalFromScore(score),
    dataQuality,
    daysOfData:  n,
    timestamp:   new Date().toISOString(),
    breakdown,
  };
}

module.exports = { momentumScoreWithBreakdown };
