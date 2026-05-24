import fs from 'fs';
import path from 'path';
import type { MomentumEntry, MomentumScoresFile, HistoryRecord } from './types';

const DATA_DIR      = path.join(process.cwd(), 'data');
const LATEST_PATH   = path.join(DATA_DIR, 'momentum-scores.json');
const HISTORY_PATH  = path.join(DATA_DIR, 'momentum-scores-history.json');

function ensureDataDir() {
  if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
}

export function readLatestMomentumScores(): MomentumScoresFile | null {
  if (!fs.existsSync(LATEST_PATH)) return null;
  return JSON.parse(fs.readFileSync(LATEST_PATH, 'utf8')) as MomentumScoresFile;
}

export function writeMomentumScores(scores: MomentumEntry[]) {
  ensureDataDir();
  const file: MomentumScoresFile = { refreshedAt: new Date().toISOString(), scores };
  fs.writeFileSync(LATEST_PATH, JSON.stringify(file, null, 2), 'utf8');

  const today   = new Date().toISOString().slice(0, 10);
  const history = readMomentumHistory();
  const record: HistoryRecord = {
    date: today,
    scores: scores.map(s => ({ ticker: s.ticker, score: s.score })),
  };
  const idx = history.findIndex(h => h.date === today);
  if (idx >= 0) history[idx] = record; else history.push(record);
  fs.writeFileSync(HISTORY_PATH, JSON.stringify(history.slice(-90), null, 2), 'utf8');
}

export function readMomentumHistory(): HistoryRecord[] {
  if (!fs.existsSync(HISTORY_PATH)) return [];
  return JSON.parse(fs.readFileSync(HISTORY_PATH, 'utf8')) as HistoryRecord[];
}
