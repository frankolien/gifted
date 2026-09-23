import { Link } from 'react-router-dom';
import type { Asset } from '../lib/data';
import { sliceRange, Sparkline } from './Chart';
import { StockLogo, cx } from './ui';
import { usd, shares as fmtShares } from '../lib/format';

export function StockRow({ asset, now, sharesHeld, right }: { asset: Asset; now: number; sharesHeld?: number; right?: 'price' | 'change' }) {
  const up = asset.change24h >= 0;
  const day = sliceRange(asset.history, '1D', now);
  return (
    <Link to={`/stocks/${asset.symbol}`} className="flex items-center gap-3 rounded-2xl px-2 py-3 -mx-2 hover:bg-bg-2" data-testid={`stock-${asset.symbol}`}>
      <StockLogo symbol={asset.symbol} color={asset.color} />
      <div className="min-w-0 flex-1">
        <div className="font-semibold">{asset.symbol}</div>
        <div className="truncate text-sm text-muted">{sharesHeld !== undefined ? `${fmtShares(sharesHeld)} shares` : asset.name}</div>
      </div>
      <Sparkline points={day} color={up ? 'var(--up)' : 'var(--down)'} />
      <div className={cx('num w-[5.5rem] rounded-lg px-2 py-1.5 text-center text-sm font-semibold', up ? 'bg-up-soft text-up' : 'bg-down-soft text-down')}>
        {right === 'change' ? `${up ? '+' : '−'}${Math.abs(asset.changePct24h * 100).toFixed(2)}%` : asset.price !== null ? usd(asset.price) : '—'}
      </div>
    </Link>
  );
}
