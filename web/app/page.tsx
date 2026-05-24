import { readLatestScores, readHistory } from '@/lib/history';
import { readLatestMomentumScores, readMomentumHistory } from '@/lib/momentum-history';
import { STOCK_UNIVERSE } from '@/lib/stock-universe';
import WatchlistClient from '@/components/WatchlistClient';

export const dynamic = 'force-dynamic';

export default function Home() {
  const latest         = readLatestScores();
  const history        = readHistory();
  const momentumLatest = readLatestMomentumScores();
  const momentumHistory = readMomentumHistory();

  return (
    <div className="max-w-5xl mx-auto">
      <div className="mb-6">
        <h1 className="text-txt text-sm font-semibold tracking-wide uppercase">Watchlist</h1>
        <p className="text-muted text-xs mt-1">
          {Object.keys(STOCK_UNIVERSE).length} 个行业  ·  {Object.values(STOCK_UNIVERSE).flat().length} 只标的  ·  点击行展开因子明细
        </p>
      </div>
      <WatchlistClient
        initialScores={latest?.scores ?? []}
        initialRefreshedAt={latest?.refreshedAt ?? null}
        history={history}
        initialMomentumScores={momentumLatest?.scores ?? []}
        initialMomentumRefreshedAt={momentumLatest?.refreshedAt ?? null}
        momentumHistory={momentumHistory}
        industryGroups={STOCK_UNIVERSE}
      />
    </div>
  );
}
