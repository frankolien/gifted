import { useInView } from './Motion';

/**
 * Isometric line-art in the style of modern brokerage marketing sites, drawn from simple prisms,
 * rings and discs. Faces are filled with the section background so hidden edges disappear.
 */
const C = Math.cos(Math.PI / 6), S = Math.sin(Math.PI / 6);
const P = (x: number, y: number, z: number) => [(x - y) * C, (x + y) * S - z] as const;
const pts = (a: (readonly [number, number])[]) => a.map(([x, y]) => `${x.toFixed(1)},${y.toFixed(1)}`).join(' ');

type Prism = { x: number; y: number; z?: number; w: number; d: number; h: number };
function prism({ x, y, z = 0, w, d, h }: Prism, fill: string, key: string) {
  const top = [P(x, y, z + h), P(x + w, y, z + h), P(x + w, y + d, z + h), P(x, y + d, z + h)];
  const left = [P(x, y + d, z), P(x + w, y + d, z), P(x + w, y + d, z + h), P(x, y + d, z + h)];
  const right = [P(x + w, y, z), P(x + w, y + d, z), P(x + w, y + d, z + h), P(x + w, y, z + h)];
  return <g key={key}>{[left, right, top].map((f, i) => <polygon key={i} points={pts(f)} fill={fill} pathLength={1} />)}</g>;
}
function ring(cx: number, cy: number, rx: number, ry: number, key: string, fill = 'none') { return <ellipse key={key} cx={cx} cy={cy} rx={rx} ry={ry} fill={fill} pathLength={1} />; }

export type ArtKind = 'bars' | 'bowl' | 'fraction' | 'slabs' | 'coins' | 'cluster' | 'rings' | 'capsules' | 'shield';

function shapes(kind: ArtKind, fill: string) {
  switch (kind) {
    case 'bars': {
      const hs = [[3, 5, 7, 4], [6, 9, 11, 6], [5, 12, 8, 5], [3, 6, 4, 2]];
      const out: any[] = [];
      hs.forEach((row, i) => row.forEach((h, j) => out.push({ x: j * 14, y: i * 14, w: 10, d: 10, h: h * 9, k: `b${i}${j}` })));
      return out.sort((a, b) => a.x + a.y - (b.x + b.y)).map((b) => prism(b, fill, b.k));
    }
    case 'fraction': return [prism({ x: 0, y: 0, w: 60, d: 60, h: 60 }, fill, 'a'), prism({ x: 30, y: -2, z: 30, w: 32, d: 32, h: 32 }, fill, 'n'), prism({ x: 52, y: -30, z: 44, w: 30, d: 30, h: 30 }, fill, 'b')];
    case 'slabs': return [0, 1, 2, 3, 4, 5].map((i) => prism({ x: (i % 2) * 34, y: i * 16 - 40, z: 60 - i * 10, w: 70, d: 12, h: 6 }, fill, `s${i}`)).reverse();
    case 'cluster': {
      const cs = [[0, 0, 0], [38, 0, 0], [0, 38, 0], [38, 38, 0], [0, 0, 38], [38, 0, 38], [0, 38, 38]];
      return cs.map(([x, y, z], i) => prism({ x: x - 38, y: y - 38, z: z - 20, w: 36, d: 36, h: 36 }, fill, `c${i}`));
    }
    case 'bowl': return [
      <path key="bowl" d="M-80,0 A80,40 0 0 0 80,0 A80,78 0 0 1 -80,0 Z" fill={fill} pathLength={1} />,
      ...[80, 62, 46, 30, 16].map((r, i) => ring(0, 0, r, r / 2, `r${i}`, i === 0 ? fill : 'none')),
      <circle key="b1" cx="0" cy="-12" r="11" fill={fill} pathLength={1} />, <circle key="b2" cx="0" cy="-52" r="8" fill={fill} pathLength={1} />,
    ];
    case 'coins': return Array.from({ length: 14 }, (_, i) => { const a = (i / 14) * Math.PI * 2; return ring(Math.cos(a) * 70, Math.sin(a) * 70, 22, 34, `c${i}`, fill); });
    case 'rings': return [70, 56, 42, 30, 18].map((r, i) => <path key={i} d={`M${-r},0 A${r},${r} 0 1 1 ${r * Math.cos(0.9)},${r * Math.sin(0.9)}`} fill="none" pathLength={1} transform={`rotate(${i * 47})`} />);
    case 'capsules': return [0, 1, 2].map((i) => <rect key={i} x={-60 + i * 18} y={-50 + i * 34} width="90" height="34" rx="17" fill={fill} pathLength={1} transform="skewY(-18)" />);
    case 'shield': return [
      <path key="s" d="M0,-80 L64,-56 L64,6 C64,46 36,70 0,86 C-36,70 -64,46 -64,6 L-64,-56 Z" fill={fill} pathLength={1} />,
      <path key="s2" d="M0,-60 L46,-42 L46,4 C46,34 26,52 0,64 C-26,52 -46,34 -46,4 L-46,-42 Z" fill="none" pathLength={1} />,
      <path key="k" d="M-18,2 L-4,16 L22,-14" fill="none" pathLength={1} />,
    ];
  }
}

export function IsoArt({ kind, className = '', stroke = 'currentColor', fill = 'var(--art-bg, transparent)', size = 260 }: { kind: ArtKind; className?: string; stroke?: string; fill?: string; size?: number }) {
  const [ref, inView] = useInView<SVGSVGElement>(0.25);
  return (
    <svg ref={ref} viewBox="-110 -110 220 220" width={size} height={size} className={`draw ${inView ? 'in' : ''} ${className}`} aria-hidden
      fill="none" stroke={stroke} strokeWidth="1.2" strokeLinejoin="round" strokeLinecap="round">
      <g transform={kind === 'bars' || kind === 'cluster' || kind === 'fraction' ? 'translate(0,20)' : kind === 'slabs' ? 'translate(-20,0)' : undefined}>{shapes(kind, fill)}</g>
    </svg>
  );
}
