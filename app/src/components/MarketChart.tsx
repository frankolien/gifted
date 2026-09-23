import { useId, useMemo, useRef, useState, type PointerEvent } from 'react';
import type { Asset, Point } from '../lib/data';
import { sliceRange, type Range } from './Chart';
import { cx } from './ui';
import { usd } from '../lib/format';

const RANGE_LABEL: Record<string, string> = { '1D': 'today', '1W': 'past week', '1M': 'past month', '3M': 'past 3 months' };

function niceTicks(lo: number, hi: number, count = 4) {
  const span = hi - lo || 1;
  const raw = span / count;
  const mag = 10 ** Math.floor(Math.log10(raw));
  const step = [1, 2, 2.5, 5, 10].map((m) => m * mag).find((s) => span / s <= count) ?? 10 * mag;
  const start = Math.floor(lo / step) * step;
  const out: number[] = [];
  for (let v = start; v < hi + step; v += step) out.push(+v.toFixed(6)); // last tick >= hi, so nothing clips
  return out;
}

function xLabel(t: number, range: Range) {
  const d = new Date(t * 1000);
  if (range === '1D') return d.toLocaleTimeString('en-US', { hour: 'numeric' });
  if (range === '1W') return d.toLocaleDateString('en-US', { weekday: 'short' });
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

/**
 * Finance-style price chart for marketing and onboarding surfaces: axis labels, gridlines, area fill,
 * range tabs and hover scrubbing. `markers` draws dots on the line (e.g. recurring buy dates).
 */
export function MarketChart({ asset, now, tone = 'dark', ranges = ['1D', '1W', '1M', '3M'], initial = '3M', markers, footer, className }: {
  asset: Asset; now: number; tone?: 'dark' | 'light'; ranges?: Range[]; initial?: Range; markers?: (pts: Point[]) => Point[]; footer?: React.ReactNode; className?: string;
}) {
  const [range, setRange] = useState<Range>(initial);
  const [hover, setHover] = useState<number | null>(null);
  const svgRef = useRef<SVGSVGElement>(null);
  const gid = useId().replace(/:/g, '');
  const pts = useMemo(() => sliceRange(asset.history, range, now).filter((p, i, a) => i === 0 || p.t > a[i - 1].t), [asset.history, range, now]);
  const W = 720, H = 300, L = 8, R = 56, T = 14, B = 30;
  const geo = useMemo(() => {
    if (pts.length < 2) return null;
    const vs = pts.map((p) => p.v); const lo = Math.min(...vs), hi = Math.max(...vs);
    const pad = (hi - lo) * 0.08 || hi * 0.01;
    const ticks = niceTicks(lo - pad, hi + pad);
    const y0 = ticks[0], y1 = ticks.at(-1)!;
    const t0 = pts[0].t, t1 = pts.at(-1)!.t;
    const x = (t: number) => L + ((t - t0) / Math.max(1, t1 - t0)) * (W - L - R);
    const y = (v: number) => T + (1 - (v - y0) / (y1 - y0 || 1)) * (H - T - B);
    const line = pts.map((p, i) => `${i ? 'L' : 'M'}${x(p.t).toFixed(1)},${y(p.v).toFixed(1)}`).join('');
    const area = `${line}L${x(t1).toFixed(1)},${H - B}L${x(t0).toFixed(1)},${H - B}Z`;
    const xs = [0.12, 0.5, 0.88].map((f) => t0 + (t1 - t0) * f);
    return { x, y, line, area, ticks, xs };
  }, [pts]);

  const dark = tone === 'dark';
  const first = pts[0]?.v ?? 0;
  const shown = hover !== null ? pts[hover] : pts.at(-1);
  const change = (shown?.v ?? 0) - first;
  const up = change >= 0;
  const color = up ? (dark ? '#2fd46a' : '#0a9d3f') : (dark ? '#ff6b4a' : '#e0402a');
  const marks = geo && markers ? markers(pts) : [];

  const onMove = (e: PointerEvent) => {
    if (!geo || !svgRef.current) return;
    const r = svgRef.current.getBoundingClientRect();
    const px = ((e.clientX - r.left) / r.width) * W;
    let best = 0, d = Infinity; pts.forEach((p, i) => { const dd = Math.abs(geo.x(p.t) - px); if (dd < d) { d = dd; best = i; } });
    setHover(best);
  };

  return (
    <div className={cx('rounded-3xl p-6 sm:p-8', dark ? 'bg-white/[0.04] text-white ring-1 ring-white/10' : 'bg-white text-ink shadow-[0_24px_60px_-24px_rgba(0,0,0,.25)] ring-1 ring-black/5', className)} data-testid={`market-chart-${asset.symbol}`}>
      <div className="flex items-start justify-between gap-4">
        <div>
          <div className={cx('text-[13px] font-semibold tracking-wide', dark ? 'text-white/60' : 'text-ink/55')}>{asset.name} · {asset.symbol}</div>
          <div className="num mt-1 text-[44px] font-medium leading-none tracking-[-0.02em] sm:text-[52px]">{shown ? usd(shown.v).replace('$', '') : '—'}<span className={cx('ml-2 text-[18px] font-normal', dark ? 'text-white/60' : 'text-ink/55')}>USD</span></div>
          <div className="num mt-2 text-[17px] font-medium" style={{ color }}>{up ? '+' : '−'}{Math.abs(change).toFixed(2)} ({up ? '+' : '−'}{first ? Math.abs((change / first) * 100).toFixed(2) : '0.00'}%) {up ? '↑' : '↓'} {hover !== null && shown ? new Date(shown.t * 1000).toLocaleString('en-US', { month: 'short', day: 'numeric', hour: range === '1D' || range === '1W' ? 'numeric' : undefined, minute: range === '1D' ? '2-digit' : undefined }) : RANGE_LABEL[range] ?? ''}</div>
        </div>
        <span className={cx('hidden shrink-0 items-center gap-1.5 rounded-full px-3 py-1.5 text-[12px] font-semibold sm:inline-flex', dark ? 'bg-white/10' : 'bg-ink/5')}>
          <span className="relative flex size-2"><span className="absolute inline-flex size-full animate-ping rounded-full opacity-60" style={{ background: color }} /><span className="relative size-2 rounded-full" style={{ background: color }} /></span>Live on Robinhood Chain
        </span>
      </div>
      <div role="tablist" aria-label="Chart range" className={cx('mt-6 flex border-b', dark ? 'border-white/10' : 'border-ink/10')}>
        {ranges.map((r) => (
          <button key={r} role="tab" aria-selected={range === r} onClick={() => { setRange(r); setHover(null); }}
            className={cx('relative flex-1 pb-3 text-[15px] font-medium transition sm:flex-none sm:px-6', range === r ? '' : dark ? 'text-white/55 hover:text-white' : 'text-ink/50 hover:text-ink')} style={range === r ? { color } : undefined}>
            {r}{range === r && <span className="absolute inset-x-2 -bottom-px h-[3px] rounded-t-full" style={{ background: color }} />}
          </button>
        ))}
      </div>
      {geo ? (
        <svg ref={svgRef} viewBox={`0 0 ${W} ${H}`} className="mt-4 w-full touch-none select-none" onPointerMove={onMove} onPointerDown={onMove} onPointerLeave={() => setHover(null)} role="img" aria-label={`${asset.symbol} price chart`}>
          <defs><linearGradient id={gid} x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor={color} stopOpacity=".28" /><stop offset="100%" stopColor={color} stopOpacity="0" /></linearGradient></defs>
          {geo.ticks.map((v) => (
            <g key={v}>
              <line x1={L} x2={W - R} y1={geo.y(v)} y2={geo.y(v)} stroke={dark ? 'rgba(255,255,255,.08)' : 'rgba(0,0,0,.07)'} />
              <text x={W - R + 10} y={geo.y(v) + 4} fontSize="13" fill={dark ? 'rgba(255,255,255,.5)' : 'rgba(0,0,0,.45)'} className="num">{v >= 1000 ? v.toLocaleString('en-US') : v % 1 ? v.toFixed(1) : v}</text>
            </g>
          ))}
          {geo.xs.map((t) => <text key={t} x={geo.x(t)} y={H - 6} fontSize="13" textAnchor="middle" fill={dark ? 'rgba(255,255,255,.5)' : 'rgba(0,0,0,.45)'}>{xLabel(t, range)}</text>)}
          <path d={geo.area} fill={`url(#${gid})`} />
          <path d={geo.line} fill="none" stroke={color} strokeWidth="2.4" strokeLinejoin="round" strokeLinecap="round" />
          {marks.map((m) => <circle key={m.t} cx={geo.x(m.t)} cy={geo.y(m.v)} r="4.5" fill={dark ? '#0a0a0a' : '#fff'} stroke={color} strokeWidth="2" />)}
          {hover !== null && shown ? <>
            <line x1={geo.x(shown.t)} x2={geo.x(shown.t)} y1={T} y2={H - B} stroke={dark ? 'rgba(255,255,255,.35)' : 'rgba(0,0,0,.3)'} />
            <circle cx={geo.x(shown.t)} cy={geo.y(shown.v)} r="5.5" fill={color} stroke={dark ? '#0a0a0a' : '#fff'} strokeWidth="2" />
          </> : pts.length > 0 && <circle cx={geo.x(pts.at(-1)!.t)} cy={geo.y(pts.at(-1)!.v)} r="6" fill={color}><animate attributeName="r" values="5;8;5" dur="2s" repeatCount="indefinite" /></circle>}
        </svg>
      ) : <div className="grid h-[260px] place-items-center text-sm opacity-60">Loading live prices…</div>}
      {footer}
    </div>
  );
}
