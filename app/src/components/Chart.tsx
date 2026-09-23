import { useMemo, useRef, useState, type PointerEvent } from 'react';
import type { Point } from '../lib/data';

export type Range = '1D' | '1W' | '1M' | '3M' | 'ALL';
export const RANGES: Range[] = ['1D', '1W', '1M', '3M', 'ALL'];
const SPAN: Record<Range, number> = { '1D': 86400, '1W': 604800, '1M': 2592000, '3M': 7776000, ALL: Infinity };

/** Points of the most recent trading session: everything after the last gap longer than 3 hours. */
function lastSession(points: Point[]) {
  for (let i = points.length - 1; i > 0; i--) if (points[i].t - points[i - 1].t > 3 * 3600) return points.slice(i);
  return points;
}

export function sliceRange(points: Point[], range: Range, now: number) {
  if (range === '1D') {
    const day = points.filter((p) => p.t >= now - 86400);
    // Market closed for much of the last day (nights, weekends): show the latest session instead, like brokerages do.
    if (day.length < 24 || day.some((p, i) => i > 0 && p.t - day[i - 1].t > 3 * 3600)) { const s = lastSession(points); if (s.length >= 2) return s; }
  }
  const from = SPAN[range] === Infinity ? -Infinity : now - SPAN[range];
  const inRange = points.filter((p) => p.t >= from);
  const before = points.filter((p) => p.t < from).at(-1);
  return before ? [{ t: from, v: before.v }, ...inRange] : inRange;
}
export const rangeStart = (range: Range, now: number, first?: number) => (SPAN[range] === Infinity ? first ?? now : now - SPAN[range]);

/** Axis-less price chart. Hover or drag to scrub; `onScrub` reports the point under the cursor. */
export function PriceChart({ points, color, height = 220, onScrub, baseline }: { points: Point[]; color: string; height?: number; onScrub?: (p: Point | null) => void; baseline?: number }) {
  const ref = useRef<SVGSVGElement>(null);
  const [hover, setHover] = useState<number | null>(null);
  const W = 1000, H = height, PAD = 12;
  const geo = useMemo(() => {
    if (points.length < 2) return null;
    const t0 = points[0].t, t1 = points.at(-1)!.t;
    let lo = Math.min(...points.map((p) => p.v)), hi = Math.max(...points.map((p) => p.v));
    if (baseline !== undefined) { lo = Math.min(lo, baseline); hi = Math.max(hi, baseline); }
    if (hi - lo < 1e-9) { hi += 1; lo -= 1; }
    const x = (t: number) => ((t - t0) / Math.max(1, t1 - t0)) * W;
    const y = (v: number) => PAD + (1 - (v - lo) / (hi - lo)) * (H - PAD * 2);
    const d = points.map((p, i) => `${i ? 'L' : 'M'}${x(p.t).toFixed(1)},${y(p.v).toFixed(1)}`).join('');
    return { x, y, d, by: baseline !== undefined ? y(baseline) : null };
  }, [points, H, baseline]);

  const locate = (e: PointerEvent) => {
    if (!geo || !ref.current) return;
    const r = ref.current.getBoundingClientRect();
    const px = ((e.clientX - r.left) / r.width) * W;
    let best = 0, dist = Infinity;
    points.forEach((p, i) => { const dd = Math.abs(geo.x(p.t) - px); if (dd < dist) { dist = dd; best = i; } });
    setHover(best); onScrub?.(points[best]);
  };
  const clear = () => { setHover(null); onScrub?.(null); };

  if (!geo) return <div style={{ height }} className="grid place-items-center text-sm text-muted">Not enough price history yet</div>;
  const hp = hover !== null ? points[hover] : null;
  return (
    <svg ref={ref} viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" className="w-full touch-none select-none" style={{ height }}
      onPointerMove={locate} onPointerDown={locate} onPointerLeave={clear} onPointerUp={(e) => e.pointerType !== 'mouse' && clear()} role="img" aria-label="Price chart">
      {geo.by !== null && <line x1="0" x2={W} y1={geo.by} y2={geo.by} stroke="var(--line-2)" strokeDasharray="2 6" vectorEffect="non-scaling-stroke" />}
      <path d={geo.d} fill="none" stroke={color} strokeWidth="2.25" strokeLinejoin="round" strokeLinecap="round" vectorEffect="non-scaling-stroke" />
      {hp && <>
        <line x1={geo.x(hp.t)} x2={geo.x(hp.t)} y1="0" y2={H} stroke="var(--faint)" strokeWidth="1" vectorEffect="non-scaling-stroke" />
        <circle cx={geo.x(hp.t)} cy={geo.y(hp.v)} r="5" fill={color} stroke="var(--bg)" strokeWidth="2" vectorEffect="non-scaling-stroke" />
      </>}
    </svg>
  );
}

export function Sparkline({ points, color, width = 72, height = 28 }: { points: Point[]; color: string; width?: number; height?: number }) {
  if (points.length < 2) return <span style={{ width, height }} className="inline-block" />;
  const vs = points.map((p) => p.v); const lo = Math.min(...vs), hi = Math.max(...vs) || 1;
  const t0 = points[0].t, t1 = points.at(-1)!.t;
  const d = points.map((p, i) => `${i ? 'L' : 'M'}${(((p.t - t0) / Math.max(1, t1 - t0)) * width).toFixed(1)},${(2 + (1 - (p.v - lo) / Math.max(1e-9, hi - lo)) * (height - 4)).toFixed(1)}`).join('');
  return <svg width={width} height={height} viewBox={`0 0 ${width} ${height}`} aria-hidden><path d={d} fill="none" stroke={color} strokeWidth="1.5" strokeLinejoin="round" /></svg>;
}

export function scrubLabel(t: number, range: Range) {
  const d = new Date(t * 1000);
  return range === '1D' || range === '1W'
    ? d.toLocaleString('en-US', { weekday: range === '1W' ? 'short' : undefined, hour: 'numeric', minute: '2-digit' })
    : d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: range === 'ALL' ? 'numeric' : undefined });
}
