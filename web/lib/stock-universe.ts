export const STOCK_UNIVERSE: Record<string, string[]> = {
  '半导体':   ['SOXX', 'NVDA', 'AMD', 'AVGO', 'MU'],
  '核能':     ['CEG', 'VST', 'SMR', 'CCJ'],
  '光通信':   ['ANET', 'COHR', 'LITE', 'CIEN'],
  '网络安全': ['CRWD', 'PANW', 'ZS', 'S'],
  '医疗AI':   ['ISRG', 'TEM'],
  '国防航天': ['ITA', 'RKLB', 'LMT'],
  'AI算力云': ['CRWV', 'IREN', 'APLD', 'NBIS'],
  '量子计算': ['IONQ', 'RGTI', 'QUBT'],
};

// 29 tickers total
export const ALL_TICKERS: string[] = Object.values(STOCK_UNIVERSE).flat();

// Reverse lookup: ticker → industry
export const TICKER_INDUSTRY: Record<string, string> = Object.fromEntries(
  Object.entries(STOCK_UNIVERSE).flatMap(([industry, tickers]) =>
    tickers.map(t => [t, industry])
  )
);
