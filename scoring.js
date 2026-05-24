const {
  DROP_WEIGHT, VIX_WEIGHT, FNG_WEIGHT, TNX_WEIGHT,
  PE_WEIGHT, SHORT_WEIGHT, NEWS_WEIGHT, ETFS, FILTERS,
} = require('./config');

// ── Explanation helpers (plain-language Chinese, dynamic by value) ──────────

function dropExplanation(drop) {
  if (drop > 40) return `股价已从近期高点大幅下跌 ${drop.toFixed(1)}%，属于罕见的深度打折区间，历史上往往是价值投资者出手的好机会`;
  if (drop > 30) return `股价从高点回落 ${drop.toFixed(1)}%，处于历史上较有吸引力的买入区间，安全边际比较充足`;
  if (drop > 20) return `股价已从高点回调 ${drop.toFixed(1)}%，进入了相对合理的买入区间，安全边际适中`;
  if (drop > 10) return `股价从高点下跌了 ${drop.toFixed(1)}%，有一定的买入安全边际，但空间不算大`;
  return `股价距离近期高点仅下跌 ${drop.toFixed(1)}%，仍处于相对高位，当前价格安全边际不足`;
}

function vixExplanation(vix) {
  if (vix > 35) return `市场恐慌程度极高（VIX ${vix.toFixed(1)}），超过35通常意味着集体恐慌性抛售，历史上这种时候往往是绝佳的反向买入机会`;
  if (vix > 25) return `市场出现较明显的恐慌情绪（VIX ${vix.toFixed(1)}），投资者整体偏悲观，逆向布局的价值开始显现`;
  if (vix >= 18) return `市场波动处于中等水平（VIX ${vix.toFixed(1)}），情绪中性，没有明显的恐慌或贪婪信号，观望为主`;
  return `市场非常平静（VIX ${vix.toFixed(1)}），大家普遍乐观，这种时候反而需要提防市场过热带来的追高风险`;
}

function fngExplanation(value) {
  const v = Number(value);
  if (v < 25) return `市场极度恐慌（恐贪指数 ${v}），几乎所有人都在卖，历史上这类读数往往意味着阶段性底部临近`;
  if (v < 40) return `市场偏向恐惧（恐贪指数 ${v}），整体情绪悲观但还没到极端，属于比较适合布局的区间`;
  if (v < 55) return `市场情绪中性（恐贪指数 ${v}），多空力量相对均衡，没有明显的方向性偏好`;
  if (v < 75) return `市场偏向贪婪（恐贪指数 ${v}），整体情绪乐观，上涨预期已部分反映在价格中，要注意高估风险`;
  return `市场极度贪婪（恐贪指数 ${v}），历史上这种情绪高位往往预示着短期内出现回调的概率上升`;
}

function tnxExplanation(yield10y) {
  if (yield10y < 3.5) return `10年期国债收益率仅 ${yield10y.toFixed(2)}%，利率偏低，资金借贷成本便宜，对股票估值扩张非常有利`;
  if (yield10y < 4.0) return `10年期国债收益率 ${yield10y.toFixed(2)}%，处于相对温和水平，整体资金环境偏宽松，对股市影响友好`;
  if (yield10y < 4.5) return `10年期国债收益率 ${yield10y.toFixed(2)}%，利率中等水平，对股市形成一定压力但尚在可承受范围`;
  if (yield10y < 5.0) return `10年期国债收益率 ${yield10y.toFixed(2)}%，利率偏高，资金成本上升，高估值股票承受的压力较大`;
  return `10年期国债收益率高达 ${yield10y.toFixed(2)}%，高利率环境下债券吸引力增强，资金有流出股市的动力`;
}

function peExplanation(pe) {
  if (pe === null || pe < 0) return `暂无有效的市盈率数据（公司可能处于亏损或数据缺失），按中性分处理，不额外加分也不扣分`;
  if (pe < 15) return `市盈率仅 ${pe.toFixed(1)} 倍，估值非常低，在大多数行业里都属于明显的低估区间`;
  if (pe < 25) return `市盈率 ${pe.toFixed(1)} 倍，估值合理，价格与当前盈利能力匹配较好，没有明显高估`;
  if (pe < 40) return `市盈率 ${pe.toFixed(1)} 倍，估值中等偏高，市场愿意为其成长预期付出一定溢价`;
  if (pe < 60) return `市盈率 ${pe.toFixed(1)} 倍，估值偏贵，投资者对公司未来增长有很高预期，如果增长不及预期则压力较大`;
  return `市盈率高达 ${pe.toFixed(1)} 倍，估值很高，当前价格已充分甚至超额反映了未来的增长预期`;
}

function shortExplanation(ratio) {
  if (ratio === null) return `没有可用的做空数据，按中性分处理`;
  if (ratio < 1) return `空头比率仅 ${ratio.toFixed(2)} 天，做空力量极弱，说明市场对这只股票整体持看多态度`;
  if (ratio < 2) return `空头比率 ${ratio.toFixed(2)} 天，做空比例较低，整体多头氛围较强`;
  if (ratio < 4) return `空头比率 ${ratio.toFixed(2)} 天，存在一定的做空力量，需关注空头是否会带来短期压力`;
  if (ratio < 7) return `空头比率 ${ratio.toFixed(2)} 天，做空比例偏高，市场中有相当一部分人在押注这只股票下跌`;
  return `空头比率高达 ${ratio.toFixed(2)} 天，做空力量很强，市场整体偏向看空这只股票`;
}

function newsExplanation(news) {
  if (!news || news.headlines === 0 || news.sentiment === 'no news') {
    return '最近7天内没有找到相关新闻，按中性分处理，不加分也不扣分';
  }
  if (news.sentiment === 'parse error') {
    return '新闻数据获取异常，按中性分处理';
  }
  const summaryClean = news.summary ? news.summary.trim().replace(/[。！？…]+$/, '') : '';
  const base = summaryClean ? `${summaryClean}。` : '';
  if (news.raw >= 9) {
    const extra = news.multiYear
      ? '且涉及多年期合同，通常对股价有持续性支撑'
      : '属于重大正面催化剂，对股价影响较大';
    return `${base}近期有强力利好消息，${extra}`;
  }
  if (news.raw >= 7) return `${base}近期新闻整体积极，有正面催化剂出现，影响偏利多`;
  if (news.raw >= 5) return `${base}近期新闻较为平淡，没有特别突出的利好或利空`;
  if (news.raw >= 2) return `${base}近期出现一些偏负面的消息，需要留意潜在风险`;
  return `${base}近期有较严重的负面新闻，对股价可能形成明显压力`;
}

// ── Main structured scoring function ─────────────────────────────────────────

function scoreWithBreakdown(stock, vix, tnx, fng, news) {
  const ds = dropScore(stock);
  const vs = vixScore(vix);
  const fs = fngScore(fng.value);
  const ts = tnxScore(tnx);
  const ps = peScore(stock.pe);
  const ss = shortScore(stock.shortRatio);
  const ns = newsScore(news.raw);

  const total = +(
    ds.weighted + vs.weighted + ts.weighted + fs.weighted +
    ps.weighted + ss.weighted + ns.weighted
  ).toFixed(2);

  const breakdown = [
    {
      factor:       '价格回撤',
      rawValue:     +((-ds.drop) / 100).toFixed(4),
      displayValue: `-${ds.drop.toFixed(1)}%`,
      points:       ds.weighted,
      maxPoints:    +(10 * DROP_WEIGHT).toFixed(2),
      explanation:  dropExplanation(ds.drop),
      sentiment:    ds.raw >= 7 ? 'positive' : ds.raw >= 3 ? 'neutral' : 'negative',
    },
    {
      factor:       '市场恐慌度(VIX)',
      rawValue:     +vix.toFixed(2),
      displayValue: vix.toFixed(2),
      points:       vs.weighted,
      maxPoints:    +(10 * VIX_WEIGHT).toFixed(2),
      explanation:  vixExplanation(vix),
      sentiment:    vs.raw >= 7 ? 'positive' : vs.raw >= 4 ? 'neutral' : 'negative',
    },
    {
      factor:       '恐贪指数',
      rawValue:     Number(fng.value),
      displayValue: `${fng.value}/100 (${fng.label})`,
      points:       fs.weighted,
      maxPoints:    +(10 * FNG_WEIGHT).toFixed(2),
      explanation:  fngExplanation(fng.value),
      sentiment:    fs.raw >= 7 ? 'positive' : fs.raw >= 5 ? 'neutral' : 'negative',
    },
    {
      factor:       '国债收益率',
      rawValue:     +tnx.toFixed(2),
      displayValue: `${tnx.toFixed(2)}%`,
      points:       ts.weighted,
      maxPoints:    +(10 * TNX_WEIGHT).toFixed(2),
      explanation:  tnxExplanation(tnx),
      sentiment:    ts.raw >= 7 ? 'positive' : ts.raw >= 5 ? 'neutral' : 'negative',
    },
    {
      factor:       '估值(市盈率)',
      rawValue:     stock.pe,
      displayValue: stock.pe === null || stock.pe < 0 ? 'N/A' : `${stock.pe.toFixed(1)}x`,
      points:       ps.weighted,
      maxPoints:    +(10 * PE_WEIGHT).toFixed(2),
      explanation:  peExplanation(stock.pe),
      sentiment:    ps.raw >= 7 ? 'positive' : ps.raw >= 4 ? 'neutral' : 'negative',
    },
    {
      factor:       '做空比率',
      rawValue:     stock.shortRatio,
      displayValue: stock.shortRatio === null ? 'N/A' : `${stock.shortRatio.toFixed(2)}天`,
      points:       ss.weighted,
      maxPoints:    +(8 * SHORT_WEIGHT).toFixed(2),
      explanation:  shortExplanation(stock.shortRatio),
      sentiment:    stock.shortRatio === null ? 'neutral' : (ss.raw >= 6 ? 'positive' : ss.raw >= 4 ? 'neutral' : 'negative'),
    },
    {
      factor:       '新闻情绪',
      rawValue:     news.raw,
      displayValue: news.sentiment,
      points:       ns.weighted,
      maxPoints:    +(10 * NEWS_WEIGHT).toFixed(2),
      explanation:  newsExplanation(news),
      sentiment:    news.raw >= 7 ? 'positive' : news.raw >= 5 ? 'neutral' : 'negative',
    },
  ];

  return {
    ticker:    stock.symbol,
    score:     total,
    signal:    signal(total),
    timestamp: new Date().toISOString(),
    breakdown,
  };
}

function filterResult(s) {
  if (ETFS.has(s.symbol)) return 'PASS (ETF)';
  return FILTERS.every(f => f.check(s)) ? 'PASS' : 'FAIL';
}

function dropScore(s) {
  const drop = ((s.high52 - s.price) / s.high52) * 100;
  let raw;
  if      (drop > 40) raw = 10;
  else if (drop > 30) raw = 7;
  else if (drop > 20) raw = 5;
  else if (drop > 10) raw = 3;
  else                raw = 0;
  return { drop, raw, weighted: +(raw * DROP_WEIGHT).toFixed(2) };
}

function tnxScore(yield10y) {
  let raw;
  if      (yield10y < 3.5) raw = 10;
  else if (yield10y < 4.0) raw = 7;
  else if (yield10y < 4.5) raw = 5;
  else if (yield10y < 5.0) raw = 3;
  else                     raw = 1;
  return { raw, weighted: +(raw * TNX_WEIGHT).toFixed(2) };
}

function vixScore(vix) {
  let raw;
  if      (vix > 35)  raw = 10;
  else if (vix > 25)  raw = 7;
  else if (vix >= 18) raw = 4;
  else                raw = 1;
  return { raw, weighted: +(raw * VIX_WEIGHT).toFixed(2) };
}

function fngScore(value) {
  const v = Number(value);
  let raw;
  if      (v < 25) raw = 10;
  else if (v < 40) raw = 7;
  else if (v < 55) raw = 5;
  else if (v < 75) raw = 3;
  else             raw = 0;
  return { raw, weighted: +(raw * FNG_WEIGHT).toFixed(2) };
}

function peScore(pe) {
  if (pe === null || pe < 0) return { raw: 3, weighted: +(3 * PE_WEIGHT).toFixed(2) };
  let raw;
  if      (pe < 15) raw = 10;
  else if (pe < 25) raw = 7;
  else if (pe < 40) raw = 4;
  else if (pe < 60) raw = 2;
  else              raw = 0;
  return { raw, weighted: +(raw * PE_WEIGHT).toFixed(2) };
}

function shortScore(ratio) {
  if (ratio === null) return { raw: 3, weighted: +(3 * SHORT_WEIGHT).toFixed(2) };
  let raw;
  if      (ratio < 1) raw = 8;
  else if (ratio < 2) raw = 6;
  else if (ratio < 4) raw = 4;
  else if (ratio < 7) raw = 2;
  else                raw = 0;
  return { raw, weighted: +(raw * SHORT_WEIGHT).toFixed(2) };
}

function newsScore(raw) {
  return { raw, weighted: +(raw * NEWS_WEIGHT).toFixed(2) };
}

function signal(total) {
  if (total >= 7) return 'BUY';
  if (total >= 5) return 'WATCH';
  if (total >= 3) return 'WAIT';
  return 'AVOID';
}

function topReason(s, total, drop, vix, fng) {
  const dropPct = drop.toFixed(1);
  const peStr   = s.pe === null || s.pe < 0 ? 'no positive trailing PE' : `P/E of ${s.pe.toFixed(1)}`;
  const sig     = signal(total);
  return `${s.symbol} is down ${dropPct}% from its 52W high with ${peStr}, while market fear (F&G: ${fng.value}) and VIX at ${vix.toFixed(2)} give it a combined score of ${total.toFixed(2)} — signal: ${sig}.`;
}

module.exports = {
  filterResult, dropScore, tnxScore, vixScore, fngScore,
  peScore, shortScore, newsScore, signal, topReason,
  scoreWithBreakdown,
};
