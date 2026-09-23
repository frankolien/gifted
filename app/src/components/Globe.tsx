import { useEffect, useRef, useState } from 'react';
import dots from '../assets/land-dots.json';
import { publicClient } from '../lib/chain';
import { brokerAddress } from '../lib/config';
import type { Market } from '../lib/data';
import { usd } from '../lib/format';

const D = Math.PI / 180;
// Cities our users invest from, and New York where the underlying shares trade.
const CITIES: [string, number, number][] = [
  ['Lagos', 3.38, 6.52], ['Nairobi', 36.82, -1.29], ['Accra', -0.19, 5.6], ['Johannesburg', 28.05, -26.2], ['London', -0.13, 51.5],
  ['Dubai', 55.3, 25.2], ['Mumbai', 72.88, 19.08], ['Singapore', 103.8, 1.35], ['São Paulo', -46.63, -23.55], ['Mexico City', -99.13, 19.43],
];
const NYC: [number, number] = [-74.0, 40.7];

type Ping = { city: number; t0: number };

/**
 * Rotating dotted Earth. Each new Robinhood Chain block sends a ping from a city and an arc to New York.
 * Pauses when off-screen and renders a still frame for reduced-motion users.
 */
export function Globe({ market }: { market?: Market }) {
  const wrap = useRef<HTMLDivElement>(null);
  const canvas = useRef<HTMLCanvasElement>(null);
  const pings = useRef<Ping[]>([]);
  const visibleCities = useRef<number[]>([]);
  const [block, setBlock] = useState<bigint | null>(null);

  useEffect(() => {
    if (!brokerAddress) return;
    let last = 0;
    return publicClient.watchBlockNumber({ pollingInterval: 1000, emitOnBegin: true, onBlockNumber: (n) => {
      setBlock(n);
      const now = performance.now();
      if (now - last < 650) return; // fast chains: at most ~1.5 pings a second
      last = now;
      const pool = visibleCities.current.length ? visibleCities.current : CITIES.map((_, i) => i);
      pings.current = [...pings.current.filter((p) => now - p.t0 < 2600), { city: pool[Math.floor(Math.random() * pool.length)], t0: now }];
    } });
  }, []);

  useEffect(() => {
    const c = canvas.current!, box = wrap.current!;
    const ctx = c.getContext('2d')!;
    const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;
    let raf = 0, visible = true, lon0 = -20;
    const tilt = -20 * D; // look slightly from the south so Africa, the Gulf and South Asia face the viewer
    const size = () => { const dpr = Math.min(2, devicePixelRatio || 1); c.width = box.clientWidth * dpr; c.height = box.clientHeight * dpr; c.style.width = `${box.clientWidth}px`; c.style.height = `${box.clientHeight}px`; };
    size();
    const ro = new ResizeObserver(size); ro.observe(box);
    const io = new IntersectionObserver(([e]) => { visible = e.isIntersecting; if (visible && !reduced) loop(); }); io.observe(box);

    const project = (lon: number, lat: number, R: number, cx: number, cy: number) => {
      const l = (lon - lon0) * D, p = lat * D;
      const x = R * Math.cos(p) * Math.sin(l);
      const y = R * (Math.cos(tilt) * Math.sin(p) - Math.sin(tilt) * Math.cos(p) * Math.cos(l));
      const z = Math.sin(tilt) * Math.sin(p) + Math.cos(tilt) * Math.cos(p) * Math.cos(l);
      return [cx + x, cy - y, z] as const;
    };

    const draw = () => {
      const W = c.width, H = c.height, dpr = W / box.clientWidth;
      const R = Math.min(W * 0.46, H * 1.35), cx = W / 2, cy = R + H * 0.16;
      ctx.clearRect(0, 0, W, H);
      // atmosphere
      const g = ctx.createRadialGradient(cx, cy, R * 0.9, cx, cy, R * 1.12);
      g.addColorStop(0, 'rgba(255,255,255,0.10)'); g.addColorStop(1, 'rgba(255,255,255,0)');
      ctx.fillStyle = g; ctx.beginPath(); ctx.arc(cx, cy, R * 1.12, 0, Math.PI * 2); ctx.fill();
      // sphere body with a soft top-lit shade
      const body = ctx.createRadialGradient(cx - R * 0.25, cy - R * 0.55, R * 0.1, cx, cy, R);
      body.addColorStop(0, '#2a2a2a'); body.addColorStop(0.55, '#141414'); body.addColorStop(1, '#0c0c0c');
      ctx.fillStyle = body; ctx.beginPath(); ctx.arc(cx, cy, R, 0, Math.PI * 2); ctx.fill();
      ctx.strokeStyle = 'rgba(255,255,255,0.18)'; ctx.lineWidth = 1 * dpr; ctx.stroke();
      // land
      const r = 1.25 * dpr;
      for (const [lon, lat] of dots as [number, number][]) {
        const [x, y, z] = project(lon, lat, R, cx, cy);
        if (z <= 0 || y > H + 4) continue;
        ctx.globalAlpha = 0.18 + 0.72 * z;
        ctx.fillStyle = '#ffffff'; ctx.fillRect(x - r, y - r, r * 2, r * 2);
      }
      ctx.globalAlpha = 1;
      // which cities face the viewer right now (pings only fire from these)
      visibleCities.current = CITIES.map(([, lon, lat], i) => { const [, y, z] = project(lon, lat, R, cx, cy); return z > 0.15 && y < H * 0.9 ? i : -1; }).filter((i) => i >= 0);
      // pings and arcs to New York
      const now = performance.now();
      const [nx, ny, nz] = project(NYC[0], NYC[1], R, cx, cy);
      for (const p of pings.current) {
        const age = (now - p.t0) / 2600; if (age > 1) continue;
        const [, lon, lat] = CITIES[p.city];
        const [x, y, z] = project(lon, lat, R, cx, cy);
        if (z <= 0.05) continue;
        const fade = 1 - age;
        ctx.strokeStyle = `rgba(204,255,0,${0.9 * fade})`; ctx.lineWidth = 1.5 * dpr;
        ctx.beginPath(); ctx.arc(x, y, (4 + age * 26) * dpr, 0, Math.PI * 2); ctx.stroke();
        ctx.fillStyle = `rgba(204,255,0,${fade})`; ctx.beginPath(); ctx.arc(x, y, 3 * dpr, 0, Math.PI * 2); ctx.fill();
        if (nz > 0.05) {
          const mx = (x + nx) / 2, my = (y + ny) / 2, lift = Math.hypot(nx - x, ny - y) * 0.35;
          const ux = mx - cx, uy = my - cy, ul = Math.hypot(ux, uy) || 1;
          const qx = mx + (ux / ul) * lift, qy = my + (uy / ul) * lift;
          const prog = Math.min(1, age * 2.2);
          ctx.strokeStyle = `rgba(255,255,255,${0.55 * fade})`; ctx.lineWidth = 1.2 * dpr; ctx.beginPath(); ctx.moveTo(x, y);
          for (let s = 1; s <= 24 * prog; s++) { const t = s / 24; ctx.lineTo((1 - t) ** 2 * x + 2 * (1 - t) * t * qx + t * t * nx, (1 - t) ** 2 * y + 2 * (1 - t) * t * qy + t * t * ny); }
          ctx.stroke();
        }
      }
      if (nz > 0) { ctx.fillStyle = '#ffffff'; ctx.beginPath(); ctx.arc(nx, ny, 3.2 * dpr, 0, Math.PI * 2); ctx.fill(); }
    };
    const loop = () => { cancelAnimationFrame(raf); const tick = () => { if (!visible) return; lon0 += 0.045; draw(); raf = requestAnimationFrame(tick); }; tick(); };
    if (reduced) draw(); else loop();
    return () => { cancelAnimationFrame(raf); ro.disconnect(); io.disconnect(); };
  }, []);

  const assets = market?.assets ?? [];
  return (
    <div ref={wrap} className="relative h-[440px] w-full overflow-hidden sm:h-[560px]" data-testid="globe">
      <canvas ref={canvas} className="absolute inset-0" aria-hidden />
      <div className="pointer-events-none absolute inset-x-0 top-0 flex flex-col items-center gap-4 px-4">
        <div className="inline-flex items-center gap-2 rounded-full bg-white/[0.07] px-3.5 py-1.5 text-[12px] font-medium text-white/80 ring-1 ring-white/10 backdrop-blur">
          <span className="relative flex size-2"><span className="absolute inline-flex size-full animate-ping rounded-full bg-[#ccff00] opacity-70" /><span className="relative size-2 rounded-full bg-[#ccff00]" /></span>
          Live · Robinhood Chain {block !== null ? <span className="num">block {block.toLocaleString('en-US')}</span> : 'connecting…'}
        </div>
        {assets.length > 0 && (
          <div className="relative w-full max-w-[900px] overflow-hidden [mask-image:linear-gradient(90deg,transparent,#000_12%,#000_88%,transparent)]" data-testid="ticker">
            <div className="ticker flex w-max gap-2">
              {[...assets, ...assets].map((a, i) => (
                <span key={`${a.symbol}${i}`} aria-hidden={i >= assets.length} className="num inline-flex shrink-0 items-center gap-2 rounded-full bg-black/60 px-3 py-1.5 text-[13px] text-white ring-1 ring-white/10 backdrop-blur">
                  <b className="font-semibold">{a.symbol}</b>{a.price !== null ? usd(a.price) : '—'}
                  <span className={a.change24h >= 0 ? 'text-[#ccff00]' : 'text-[#ff6b4a]'}>{a.change24h >= 0 ? '▲' : '▼'} {Math.abs(a.changePct24h * 100).toFixed(2)}%</span>
                </span>
              ))}
            </div>
          </div>
        )}
      </div>
      <p className="absolute inset-x-0 bottom-6 z-10 px-6 text-center text-[13px] text-white/60">Each ping is a new block on Robinhood Chain. Stock Tokens issued by Robinhood Assets (Jersey) Limited. Not available to US persons.</p>
    </div>
  );
}
