import fs from 'fs';
import path from 'path';
import type { ScoresFile, HistoryRecord, WatchlistEntry } from './types';

const DATA_DIR = path.join(process.cwd(), 'data');
const LATEST_PATH = path.join(DATA_DIR, 'latest-scores.json');
const HISTORY_PATH = path.join(DATA_DIR, 'scores-history.json');

function ensureDataDir() {
  if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
}

export function readLatestScores(): ScoresFile | null {
  if (!fs.existsSync(LATEST_PATH)) return null;
  return JSON.parse(fs.readFileSync(LATEST_PATH, 'utf8')) as ScoresFile;
}

export function writeLatestScores(scores: WatchlistEntry[]) {
  ensureDataDir();
  const file: ScoresFile = { refreshedAt: new Date().toISOString(), scores };
  fs.writeFileSync(LATEST_PATH, JSON.stringify(file, null, 2), 'utf8');

  // Append daily snapshot to history
  const today = new Date().toISOString().slice(0, 10);
  const history = readHistory();
  const record: HistoryRecord = {
    date: today,
    scores: scores.map(s => ({ ticker: s.ticker, score: s.score })),
  };
  // Replace today's entry if it already exists
  const idx = history.findIndex(h => h.date === today);
  if (idx >= 0) history[idx] = record; else history.push(record);
  // Keep last 90 days
  const trimmed = history.slice(-90);
  fs.writeFileSync(HISTORY_PATH, JSON.stringify(trimmed, null, 2), 'utf8');
}

export function readHistory(): HistoryRecord[] {
  if (!fs.existsSync(HISTORY_PATH)) return [];
  return JSON.parse(fs.readFileSync(HISTORY_PATH, 'utf8')) as HistoryRecord[];
}
