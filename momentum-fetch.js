const axios = require('axios');
const { BASE_HEADERS } = require('./config');

// 260 trading days ≈ 380 calendar days (accounts for weekends + holidays)
const CALENDAR_MULTIPLIER = 1.46;

async function fetchPriceHistory(ticker, sess, days = 260) {
  const calDays = Math.ceil(days * CALENDAR_MULTIPLIER);
  const period2 = Math.floor(Date.now() / 1000);
  const period1 = period2 - calDays * 24 * 60 * 60;
  const crumb   = sess.crumb ? `&crumb=${encodeURIComponent(sess.crumb)}` : '';
  const url     = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(ticker)}` +
                  `?interval=1d&period1=${period1}&period2=${period2}${crumb}`;

  const res    = await axios.get(url, { headers: { ...BASE_HEADERS, Cookie: sess.cookies } });
  const result = res.data?.chart?.result?.[0];

  if (!result) return { ticker, closes: [], volumes: [], dates: [] };

  const rawCloses  = result.indicators?.quote?.[0]?.close  ?? [];
  const rawVolumes = result.indicators?.quote?.[0]?.volume ?? [];
  const timestamps = result.timestamp ?? [];

  const closes  = [];
  const volumes = [];
  const dates   = [];

  for (let i = 0; i < rawCloses.length; i++) {
    if (rawCloses[i] != null && rawVolumes[i] != null && rawVolumes[i] > 0) {
      closes.push(rawCloses[i]);
      volumes.push(rawVolumes[i]);
      dates.push(new Date(timestamps[i] * 1000).toISOString().slice(0, 10));
    }
  }

  return { ticker, closes, volumes, dates };
}

module.exports = { fetchPriceHistory };
