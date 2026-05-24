'use client';

import { useState, useTransition, useMemo } from 'react';
import type { WatchlistEntry, MomentumEntry, HistoryRecord, Signal } from '@/lib/types';
import BreakdownPanel from './BreakdownPanel';
import Sparkline from './Sparkline';

// ── Signal / score helpers ────────────────────────────────────────────────

const SIGNAL_COLOR: Record<Signal, string> = {
  BUY:   'text-green',
  WATCH: 'text-yellow',
  WAIT:  'text-dim',
  AVOID: 'text-red',
};

function scoreColor(score: number) {
  if (score >= 7) return 'text-green';
  if (score >= 5) return 'text-yellow';
  if (score >= 3) return 'text-dim';
  return 'text-red';
}

function scoreToSignal(score: number): Signal {
  if (score >= 7) return 'BUY';
  if (score >= 5) return 'WATCH';
  if (score >= 3) return 'WAIT';
  return 'AVOID';
}

function getSparklineData(ticker: string, history: HistoryRecord[]): number[] {
  return history
    .map(h => h.scores.find(s => s.ticker === ticker)?.score)
    .filter((v): v is number => v !== undefined)
    .slice(-30);
}

// ── Change detection ──────────────────────────────────────────────────────

interface Alerts {
  newBUY:     string[];
  droppedBUY: string[];
  bigMoves:   { ticker: string; delta: number }[];
  hasPrev:    boolean;
}

function computeChanges(
  scores: WatchlistEntry[],
  history: HistoryRecord[],
): { deltaMap: Map<string, number | null>; alerts: Alerts } {
  const sorted = [...history].sort((a, b) => a.date.localeCompare(b.date));
  const prev   = sorted.length >= 2 ? sorted[sorted.length - 2] : null;

  if (!prev) {
    const deltaMap = new Map<string, number | null>(scores.map(s => [s.ticker, null]));
    return { deltaMap, alerts: { newBUY: [], droppedBUY: [], bigMoves: [], hasPrev: false } };
  }

  const prevMap  = new Map(prev.scores.map(s => [s.ticker, s.score]));
  const deltaMap = new Map<string, number | null>();
  const newBUY:     string[] = [];
  const droppedBUY: string[] = [];
  const bigMoves:   { ticker: string; delta: number }[] = [];

  for (const entry of scores) {
    const prevScore = prevMap.get(entry.ticker);
    if (prevScore === undefined) { deltaMap.set(entry.ticker, null); continue; }
    const delta = entry.score - prevScore;
    deltaMap.set(entry.ticker, delta);
    const prevSig = scoreToSignal(prevScore);
    if (prevSig !== 'BUY' && entry.signal === 'BUY') newBUY.push(entry.ticker);
    if (prevSig === 'BUY' && entry.signal !== 'BUY') droppedBUY.push(entry.ticker);
    if (Math.abs(delta) > 1.5) bigMoves.push({ ticker: entry.ticker, delta });
  }

  bigMoves.sort((a, b) => Math.abs(b.delta) - Math.abs(a.delta));
  return { deltaMap, alerts: { newBUY, droppedBUY, bigMoves, hasPrev: true } };
}

// ── Sub-components ────────────────────────────────────────────────────────

function DeltaCell({ delta }: { delta: number | null | undefined }) {
  if (delta === undefined || delta === null) {
    return <span className="text-accent text-xs">NEW</span>;
  }
  if (delta === 0) return <span className="text-muted">—</span>;
  const big   = Math.abs(delta) > 1;
  const color = delta > 0 ? 'text-green' : 'text-red';
  const sign  = delta > 0 ? '+' : '';
  return (
    <span className={`${color} ${big ? 'font-bold' : ''}`}>
      {sign}{delta.toFixed(2)}
    </span>
  );
}

function SignalAlerts({ alerts }: { alerts: Alerts }) {
  if (!alerts.hasPrev) return null;
  const hasChanges = alerts.newBUY.length + alerts.droppedBUY.length + alerts.bigMoves.length > 0;

  return (
    <div className="bg-[#0c0f14] border border-[#1e2433] rounded px-5 py-4 mb-5 text-xs">
      <div className="text-muted uppercase tracking-widest text-xs mb-3">信号警示区</div>
      {!hasChanges ? (
        <p className="text-dim">今日无信号变化</p>
      ) : (
        <div className="space-y-2">
          {alerts.newBUY.length > 0 && (
            <div className="flex items-baseline gap-3">
              <span className="text-green font-bold w-20 shrink-0">▲ 新 BUY</span>
              <span className="text-txt">{alerts.newBUY.join('  ')}</span>
            </div>
          )}
          {alerts.droppedBUY.length > 0 && (
            <div className="flex items-baseline gap-3">
              <span className="text-red font-bold w-20 shrink-0">▼ 跌出 BUY</span>
              <span className="text-txt">{alerts.droppedBUY.join('  ')}</span>
            </div>
          )}
          {alerts.bigMoves.length > 0 && (
            <div className="flex items-baseline gap-3">
              <span className="text-yellow font-bold w-20 shrink-0">⚡ 大幅变化</span>
              <span className="text-txt">
                {alerts.bigMoves.map(m => (
                  <span key={m.ticker} className="mr-3">
                    <span className="text-accent">{m.ticker}</span>
                    <span className={m.delta > 0 ? 'text-green' : 'text-red'}>
                      {' '}{m.delta > 0 ? '+' : ''}{m.delta.toFixed(2)}
                    </span>
                  </span>
                ))}
              </span>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ── Table layout ──────────────────────────────────────────────────────────

const COL      = 'grid-cols-[80px_72px_56px_72px_80px_72px]';
const ROW_GRID = `grid ${COL} gap-0`;

function ColHeader() {
  return (
    <div className={`${ROW_GRID} px-4 py-1.5 border-b border-border text-muted text-xs uppercase tracking-widest`}>
      <span>Ticker</span>
      <span>Signal</span>
      <span>Score</span>
      <span>Change</span>
      <span className="text-right">30d</span>
      <span className="text-right">Updated</span>
    </div>
  );
}

function TickerRow({
  entry, history, delta, isOpen, onToggle,
}: {
  entry: WatchlistEntry;
  history: HistoryRecord[];
  delta: number | null | undefined;
  isOpen: boolean;
  onToggle: () => void;
}) {
  const sparkData = getSparklineData(entry.ticker, history);
  return (
    <div className="border-b border-border last:border-0">
      <button
        onClick={onToggle}
        className={`w-full ${ROW_GRID} px-4 py-2.5 text-left hover:bg-surface transition-colors`}
      >
        <span className="text-accent font-semibold">{entry.ticker}</span>
        <span className={`font-semibold ${SIGNAL_COLOR[entry.signal]}`}>{entry.signal}</span>
        <span className={`font-semibold ${scoreColor(entry.score)}`}>{entry.score.toFixed(2)}</span>
        <span><DeltaCell delta={delta} /></span>
        <span className="flex justify-end items-center">
          <Sparkline data={sparkData} />
        </span>
        <span className="text-right text-muted">
          {new Date(entry.refreshedAt).toLocaleTimeString('zh-CN', {
            hour: '2-digit', minute: '2-digit', hour12: false,
          })}
        </span>
      </button>
      {isOpen && (
        <div className="px-4 pb-4">
          <BreakdownPanel breakdown={entry.breakdown} />
        </div>
      )}
    </div>
  );
}

// ── Industry panel ────────────────────────────────────────────────────────

function IndustryPanel({
  industry, tickers, scores, history, deltaMap, expandedTicker, onToggleTicker,
}: {
  industry: string;
  tickers: string[];
  scores: WatchlistEntry[];
  history: HistoryRecord[];
  deltaMap: Map<string, number | null>;
  expandedTicker: string | null;
  onToggleTicker: (t: string) => void;
}) {
  const [panelOpen, setPanelOpen] = useState(true);

  const scoredInIndustry = tickers
    .map(t => scores.find(s => s.ticker === t))
    .filter((e): e is WatchlistEntry => e !== undefined)
    .sort((a, b) => b.score - a.score);

  const avgScore = scoredInIndustry.length > 0
    ? scoredInIndustry.reduce((s, e) => s + e.score, 0) / scoredInIndustry.length
    : null;

  const missingCount = tickers.length - scoredInIndustry.length;

  return (
    <div className="border border-border mb-2 last:mb-0">
      <button
        onClick={() => setPanelOpen(p => !p)}
        className="w-full flex items-center justify-between px-4 py-2 bg-surface hover:bg-[#181818] transition-colors"
      >
        <div className="flex items-center gap-3">
          <span className="text-dim text-xs">{panelOpen ? '▾' : '▸'}</span>
          <span className="text-txt font-semibold text-xs tracking-wide">{industry}</span>
          <span className="text-muted text-xs">
            {scoredInIndustry.length}/{tickers.length}
            {missingCount > 0 && ` · ${missingCount} pending`}
          </span>
        </div>
        {avgScore !== null && (
          <span className={`text-xs font-semibold ${scoreColor(avgScore)}`}>
            avg {avgScore.toFixed(2)}
          </span>
        )}
      </button>

      {panelOpen && scoredInIndustry.length > 0 && (
        <div>
          <ColHeader />
          {scoredInIndustry.map(entry => (
            <TickerRow
              key={entry.ticker}
              entry={entry}
              history={history}
              delta={deltaMap.get(entry.ticker)}
              isOpen={expandedTicker === entry.ticker}
              onToggle={() => onToggleTicker(entry.ticker)}
            />
          ))}
        </div>
      )}

      {panelOpen && scoredInIndustry.length === 0 && (
        <p className="px-4 py-3 text-dim text-xs">— no data yet, click Refresh</p>
      )}
    </div>
  );
}

// ── Main component ────────────────────────────────────────────────────────

interface Props {
  initialScores:              WatchlistEntry[];
  initialRefreshedAt:         string | null;
  history:                    HistoryRecord[];
  initialMomentumScores:      MomentumEntry[];
  initialMomentumRefreshedAt: string | null;
  momentumHistory:            HistoryRecord[];
  industryGroups:             Record<string, string[]>;
}

export default function WatchlistClient({
  initialScores, initialRefreshedAt, history: initialHistory,
  initialMomentumScores, initialMomentumRefreshedAt, momentumHistory: initialMomentumHistory,
  industryGroups,
}: Props) {
  // ── System tab ───────────────────────────────────────────────────────────
  const [systemTab, setSystemTab] = useState<'reversal' | 'momentum'>('reversal');

  // ── Reversal (抄底) state ────────────────────────────────────────────────
  const [scores, setScores]           = useState(initialScores);
  const [refreshedAt, setRefreshedAt] = useState(initialRefreshedAt);
  const [history, setHistory]         = useState(initialHistory);
  const [isPending,         startTransition]         = useTransition();
  const [refreshError,      setRefreshError]         = useState<string | null>(null);
  const [refreshStatus,     setRefreshStatus]        = useState('');

  // ── Momentum (追涨) state ────────────────────────────────────────────────
  const [momentumScores, setMomentumScores]             = useState<WatchlistEntry[]>(
    initialMomentumScores as WatchlistEntry[]
  );
  const [momentumRefreshedAt, setMomentumRefreshedAt]   = useState(initialMomentumRefreshedAt);
  const [momentumHistory, setMomentumHistory]           = useState(initialMomentumHistory);
  const [isPendingMomentum, startTransitionMomentum]    = useTransition();
  const [momentumRefreshError,  setMomentumRefreshError]  = useState<string | null>(null);
  const [momentumRefreshStatus, setMomentumRefreshStatus] = useState('');

  // ── All-refresh state ────────────────────────────────────────────────────
  const [isPendingAll, setIsPendingAll] = useState(false);

  // ── Shared UI state ──────────────────────────────────────────────────────
  const [expandedTicker, setExpandedTicker] = useState<string | null>(null);
  const [viewMode, setViewMode]             = useState<'grouped' | 'flat'>('grouped');

  // ── Computed deltas ──────────────────────────────────────────────────────
  const { deltaMap, alerts } = useMemo(
    () => computeChanges(scores, history),
    [scores, history],
  );
  const { deltaMap: momentumDeltaMap, alerts: momentumAlerts } = useMemo(
    () => computeChanges(momentumScores, momentumHistory),
    [momentumScores, momentumHistory],
  );

  function toggleTicker(t: string) {
    setExpandedTicker(prev => prev === t ? null : t);
  }

  // ── Reversal refresh ─────────────────────────────────────────────────────
  async function handleRefresh() {
    setRefreshError(null);
    setRefreshStatus('Refreshing 29 tickers in batches of 5…  (~40s)');
    startTransition(async () => {
      try {
        const res  = await fetch('/api/watchlist/refresh', { method: 'POST' });
        const json = await res.json();
        if (!res.ok) throw new Error(json.error ?? 'refresh failed');
        const latest = await fetch('/api/watchlist').then(r => r.json());
        setScores(latest.scores ?? []);
        setRefreshedAt(latest.refreshedAt ?? null);
        if (latest.history) setHistory(latest.history);
        const { count, durationSec, failures } = json as {
          count: number; durationSec: string; failures: { ticker: string }[];
        };
        const failMsg = failures?.length ? `  ·  ${failures.length} failed` : '';
        setRefreshStatus(`Done: ${count} scored in ${durationSec}s${failMsg}`);
      } catch (e: unknown) {
        setRefreshError(e instanceof Error ? e.message : String(e));
        setRefreshStatus('');
      }
    });
  }

  // ── Momentum refresh ─────────────────────────────────────────────────────
  async function handleRefreshMomentum() {
    setMomentumRefreshError(null);
    setMomentumRefreshStatus('追涨评分刷新中（拉取历史K线）… (~15s)');
    startTransitionMomentum(async () => {
      try {
        const res  = await fetch('/api/momentum/refresh', { method: 'POST' });
        const json = await res.json();
        if (!res.ok) throw new Error(json.error ?? 'momentum refresh failed');
        const latest = await fetch('/api/momentum').then(r => r.json());
        setMomentumScores(latest.scores ?? []);
        setMomentumRefreshedAt(latest.refreshedAt ?? null);
        if (latest.history) setMomentumHistory(latest.history);
        const { count, durationSec, failures } = json as {
          count: number; durationSec: string; failures: { ticker: string }[];
        };
        const failMsg = failures?.length ? `  ·  ${failures.length} failed` : '';
        setMomentumRefreshStatus(`Done: ${count} scored in ${durationSec}s${failMsg}`);
      } catch (e: unknown) {
        setMomentumRefreshError(e instanceof Error ? e.message : String(e));
        setMomentumRefreshStatus('');
      }
    });
  }

  // ── All-refresh (sequential) ─────────────────────────────────────────────
  async function handleRefreshAll() {
    if (isPendingAll || isPending || isPendingMomentum) return;
    setIsPendingAll(true);
    setRefreshError(null);
    setMomentumRefreshError(null);
    setRefreshStatus('全部刷新：抄底评分进行中…  (~40s)');
    setMomentumRefreshStatus('追涨评分等待中…');
    try {
      const r1 = await fetch('/api/watchlist/refresh', { method: 'POST' });
      const j1 = await r1.json();
      if (!r1.ok) throw new Error(j1.error ?? 'reversal refresh failed');
      const l1 = await fetch('/api/watchlist').then(r => r.json());
      setScores(l1.scores ?? []);
      setRefreshedAt(l1.refreshedAt ?? null);
      if (l1.history) setHistory(l1.history);
      const f1 = j1.failures?.length ? `  ·  ${j1.failures.length} failed` : '';
      setRefreshStatus(`抄底: ${j1.count} 只 ${j1.durationSec}s${f1}`);

      setMomentumRefreshStatus('全部刷新：追涨评分进行中…  (~15s)');
      const r2 = await fetch('/api/momentum/refresh', { method: 'POST' });
      const j2 = await r2.json();
      if (!r2.ok) throw new Error(j2.error ?? 'momentum refresh failed');
      const l2 = await fetch('/api/momentum').then(r => r.json());
      setMomentumScores(l2.scores ?? []);
      setMomentumRefreshedAt(l2.refreshedAt ?? null);
      if (l2.history) setMomentumHistory(l2.history);
      const f2 = j2.failures?.length ? `  ·  ${j2.failures.length} failed` : '';
      setMomentumRefreshStatus(`追涨: ${j2.count} 只 ${j2.durationSec}s${f2}`);
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      if (msg.includes('reversal')) setRefreshError(msg);
      else setMomentumRefreshError(msg);
    } finally {
      setIsPendingAll(false);
    }
  }

  const activeScores  = systemTab === 'reversal' ? scores        : momentumScores;
  const activeHistory = systemTab === 'reversal' ? history       : momentumHistory;
  const activeDeltaMap = systemTab === 'reversal' ? deltaMap     : momentumDeltaMap;
  const flatSorted    = [...activeScores].sort((a, b) => b.score - a.score);
  const isAnyPending  = isPending || isPendingMomentum || isPendingAll;
  const activeRefreshedAt = systemTab === 'reversal' ? refreshedAt : momentumRefreshedAt;

  return (
    <div>
      {/* ── System tabs ── */}
      <div className="flex items-center gap-2 mb-3">
        {(['reversal', 'momentum'] as const).map(sys => (
          <button
            key={sys}
            onClick={() => setSystemTab(sys)}
            className={`px-3 py-1 text-xs border transition-colors ${
              systemTab === sys
                ? 'border-accent text-accent'
                : 'border-border text-dim hover:border-muted hover:text-txt'
            }`}
          >
            {sys === 'reversal' ? '抄底 REVERSAL' : '追涨 MOMENTUM'}
          </button>
        ))}
        <span className="text-muted text-xs ml-1">
          {systemTab === 'reversal' ? '低位反弹 · 7因子综合评分' : '趋势追踪 · 4因子动量评分'}
        </span>
      </div>

      {/* ── Toolbar ── */}
      <div className="flex items-center justify-between mb-4 flex-wrap gap-2">
        <div className="flex items-center gap-3">
          {(['grouped', 'flat'] as const).map(mode => (
            <button
              key={mode}
              onClick={() => setViewMode(mode)}
              className={`px-3 py-1 text-xs border transition-colors ${
                viewMode === mode
                  ? 'border-accent text-accent'
                  : 'border-border text-dim hover:border-muted hover:text-txt'
              }`}
            >
              {mode === 'grouped' ? '按行业分组' : '全部按评分排序'}
            </button>
          ))}
        </div>
        <div className="flex items-center gap-2 flex-wrap justify-end">
          {/* Status messages */}
          <div className="flex flex-col items-end gap-0.5">
            {refreshStatus && (
              <span className={`text-xs ${refreshError ? 'text-red' : 'text-dim'}`}>
                抄底: {refreshStatus}
              </span>
            )}
            {momentumRefreshStatus && (
              <span className={`text-xs ${momentumRefreshError ? 'text-red' : 'text-dim'}`}>
                追涨: {momentumRefreshStatus}
              </span>
            )}
            {refreshError      && <span className="text-red text-xs">Error: {refreshError}</span>}
            {momentumRefreshError && <span className="text-red text-xs">Error: {momentumRefreshError}</span>}
          </div>
          <span className="text-muted text-xs">
            {activeRefreshedAt
              ? new Date(activeRefreshedAt).toLocaleString('zh-CN', { hour12: false })
              : 'no data'}
          </span>
          {/* Individual refresh for active system */}
          <button
            onClick={systemTab === 'reversal' ? handleRefresh : handleRefreshMomentum}
            disabled={isAnyPending}
            className="px-3 py-1 text-xs border border-border text-txt hover:border-accent hover:text-accent disabled:opacity-40 transition-colors"
          >
            {(systemTab === 'reversal' ? isPending : isPendingMomentum)
              ? '⟳ refreshing…'
              : `⟳ ${systemTab === 'reversal' ? '抄底' : '追涨'} Refresh`}
          </button>
          {/* All-refresh */}
          <button
            onClick={handleRefreshAll}
            disabled={isAnyPending}
            className="px-3 py-1 text-xs border border-border text-txt hover:border-accent hover:text-accent disabled:opacity-40 transition-colors"
          >
            {isPendingAll ? '⟳ 全部刷新中…' : '⟳ 全部刷新'}
          </button>
        </div>
      </div>

      {/* ── Signal alert zone ── */}
      <SignalAlerts alerts={systemTab === 'reversal' ? alerts : momentumAlerts} />

      {/* ── Grouped view ── */}
      {viewMode === 'grouped' && (
        <div>
          {Object.entries(industryGroups).map(([industry, tickers]) => (
            <IndustryPanel
              key={industry}
              industry={industry}
              tickers={tickers}
              scores={activeScores}
              history={activeHistory}
              deltaMap={activeDeltaMap}
              expandedTicker={expandedTicker}
              onToggleTicker={toggleTicker}
            />
          ))}
        </div>
      )}

      {/* ── Flat view ── */}
      {viewMode === 'flat' && (
        <div className="border border-border">
          <ColHeader />
          {flatSorted.length === 0 ? (
            <p className="px-4 py-8 text-dim text-center text-xs">
              No scores yet. Click Refresh to fetch all 29 tickers.
            </p>
          ) : (
            flatSorted.map(entry => (
              <TickerRow
                key={entry.ticker}
                entry={entry}
                history={activeHistory}
                delta={activeDeltaMap.get(entry.ticker)}
                isOpen={expandedTicker === entry.ticker}
                onToggle={() => toggleTicker(entry.ticker)}
              />
            ))
          )}
        </div>
      )}
    </div>
  );
}
