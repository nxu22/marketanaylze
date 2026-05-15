const STOCKS = ['NVDA', 'AAPL', 'MSFT', 'AVGO', 'MU', 'AMD', 'INTC', 'ORCL', 'CSCO', 'AMAT', 'PLTR', 'GE', 'TXN', 'RTX', 'QCOM', 'ADI', 'BA', 'PANW', 'ANET', 'MRVL', 'APP', 'CRWD', 'CRM', 'LMT', 'HWM', 'INTU', 'CEG', 'SNPS', 'ADBE', 'GD', 'FTNT', 'MPWR', 'COHR', 'NOC', 'NXPI', 'RKLB', 'NET', 'TDG', 'NOK', 'LHX', 'STM', 'ON', 'PEG', 'PCG', 'NTRA', 'AKAM', 'ILMN', 'FFIV', 'ZS', 'BWXT', 'ONTO', 'OKLO', 'TEM', 'CRSP', 'TWST', 'BEAM', 'TXG', 'NTLA'];

const ETFS = new Set(['SOXX', 'ITA']);

const DROP_WEIGHT  = 0.25;
const VIX_WEIGHT   = 0.15;
const FNG_WEIGHT   = 0.15;
const TNX_WEIGHT   = 0.15;
const PE_WEIGHT    = 0.15;
const SHORT_WEIGHT = 0.08;
const NEWS_WEIGHT  = 0.07;

const BASE_HEADERS = {
  'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
  'Accept': 'application/json',
};

const POS_KEYWORDS = ['contract', 'growth', 'upgrade', 'partnership', 'beats', 'record', 'launch'];
const NEG_KEYWORDS = ['crash', 'ban', 'investigation', 'lawsuit', 'downgrade', 'miss', 'layoff', 'recall'];

const AI_TAGS = {
  NVDA:  'AI Chips',
  AAPL:  'AI Devices',
  MSFT:  'AI Platform',
  AVGO:  'AI Chips',
  MU:    'AI Chips',
  AMD:   'AI Chips',
  INTC:  'AI Chips',
  ORCL:  'AI Cloud',
  CSCO:  'AI Infra',
  AMAT:  'AI Chips',
  PLTR:  'AI Analytics',
  GE:    'AI Defense',
  TXN:   'AI Chips',
  RTX:   'AI Defense',
  QCOM:  'AI Chips',
  ADI:   'AI Chips',
  BA:    'AI Defense',
  PANW:  'AI Security',
  ANET:  'AI Infra',
  MRVL:  'AI Chips',
  APP:   'AI Platform',
  CRWD:  'AI Security',
  CRM:   'AI Platform',
  LMT:   'AI Defense',
  HWM:   'AI Defense',
  INTU:  'AI Software',
  CEG:   'AI Energy',
  SNPS:  'AI EDA',
  ADBE:  'AI Creative',
  GD:    'AI Defense',
  FTNT:  'AI Security',
  MPWR:  'AI Chips',
  COHR:  'AI Infra',
  NOC:   'AI Defense',
  NXPI:  'AI Chips',
  RKLB:  'AI Space',
  NET:   'AI Security',
  TDG:   'AI Defense',
  NOK:   'AI Infra',
  LHX:   'AI Defense',
  STM:   'AI Chips',
  ON:    'AI Chips',
  PEG:   'AI Energy',
  PCG:   'AI Energy',
  NTRA:  'AI Biotech',
  AKAM:  'AI Security',
  ILMN:  'AI Genomics',
  FFIV:  'AI Infra',
  ZS:    'AI Security',
  BWXT:  'Nuclear',
  ONTO:  'AI Chips',
  OKLO:  'AI Energy',
  TEM:   'AI Biotech',
  CRSP:  'AI Genomics',
  TWST:  'AI Genomics',
  BEAM:  'AI Genomics',
  TXG:   'AI Genomics',
  NTLA:  'AI Genomics',
  // ETFs in the pool
  SOXX:  'ETF: Semis',
  ITA:   'ETF: Defense',
  CIBR:  'ETF: Cyber',
  NLR:   'ETF: Nuclear',
  IONQ:  'Quantum',
};

const FILTERS = [
  { label: 'Op Cash Flow > 0', check: s => s.operatingCashflow !== null && s.operatingCashflow > 0 },
  { label: 'D/E < 100',        check: s => s.debtToEquity === null || s.debtToEquity < 100 },
  { label: 'Mkt Cap > $1B',    check: s => s.marketCap !== null && s.marketCap > 1e9 },
];

module.exports = {
  STOCKS, ETFS, AI_TAGS,
  DROP_WEIGHT, VIX_WEIGHT, FNG_WEIGHT, TNX_WEIGHT, PE_WEIGHT, SHORT_WEIGHT, NEWS_WEIGHT,
  BASE_HEADERS, POS_KEYWORDS, NEG_KEYWORDS, FILTERS,
};
