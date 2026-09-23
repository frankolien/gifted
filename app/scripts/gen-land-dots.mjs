/** One-off: sample a lat/lon grid and keep points on land, for the landing-page globe. */
import { geoContains } from 'd3-geo';
import { feature } from 'topojson-client';
import { readFileSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const topo = JSON.parse(readFileSync(require.resolve('world-atlas/land-110m.json'), 'utf8'));
const land = feature(topo, topo.objects.land);
const pts = [];
const STEP = 1.6;
for (let lat = -58; lat <= 78; lat += STEP) {
  // keep dots evenly spaced on the sphere: fewer longitude samples near the poles
  const n = Math.max(8, Math.round((360 / STEP) * Math.cos((lat * Math.PI) / 180)));
  for (let i = 0; i < n; i++) {
    const lon = -180 + (360 * i) / n;
    if (geoContains(land, [lon, lat])) pts.push([+lon.toFixed(2), +lat.toFixed(2)]);
  }
}
writeFileSync('src/assets/land-dots.json', JSON.stringify(pts));
console.log(`${pts.length} land dots`);
