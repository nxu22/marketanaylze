const {
  DROP_WEIGHT, VIX_WEIGHT, FNG_WEIGHT, TNX_WEIGHT,
  PE_WEIGHT, SHORT_WEIGHT, NEWS_WEIGHT, ETFS, FILTERS,
} = require('./config');

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
};
