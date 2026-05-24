export type Signal = 'BUY' | 'WATCH' | 'WAIT' | 'AVOID';

export interface BreakdownItem {
  factor: string;
  rawValue: number | null;
  displayValue: string;
  points: number;
  maxPoints: number;
  explanation: string;
  sentiment: 'positive' | 'neutral' | 'negative';
}

export interface ScoreResult {
  ticker: string;
  score: number;
  signal: Signal;
  timestamp: string;
  breakdown: BreakdownItem[];
}

export interface WatchlistEntry extends ScoreResult {
  refreshedAt: string;
}

export interface ScoresFile {
  refreshedAt: string;
  scores: WatchlistEntry[];
}

export interface HistoryRecord {
  date: string;
  scores: { ticker: string; score: number }[];
}

export interface MomentumEntry extends WatchlistEntry {
  dataQuality: 'full' | 'partial' | 'insufficient';
  daysOfData: number;
}

export interface MomentumScoresFile {
  refreshedAt: string;
  scores: MomentumEntry[];
}
