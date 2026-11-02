// 由 Natural Earth（公有領域）的陸地資料產生「世界風場」用的地圖路徑：src/data/worldMap.js
// 用法：node tools/gen-world-map.mjs <ne_110m_land.geojson> <ne_50m_land.geojson>
// 資料下載：https://github.com/nvkelso/natural-earth-vector/tree/master/geojson
// 座標：等距圓柱投影，x = 經度 + 180、y = 90 − 緯度（單位：度），SVG 直接用。
import { readFileSync, writeFileSync } from 'node:fs';

const [world110, world50] = process.argv.slice(2);
if (!world110 || !world50) throw new Error('用法：node tools/gen-world-map.mjs <ne_110m_land.geojson> <ne_50m_land.geojson>');

// 需要細一點的地方（[西, 南, 東, 北]）：放大看時改用 1:5000 萬的資料
export const DETAIL_REGIONS = {
  taiwan: [117.5, 20.5, 123.5, 26.5],
  northSea: [-12, 48, 18, 66],
};

const rings = (file) => {
  const out = [];
  for (const f of JSON.parse(readFileSync(file, 'utf8')).features) {
    const g = f.geometry;
    const polys = g.type === 'Polygon' ? [g.coordinates] : g.coordinates;
    for (const poly of polys) for (const ring of poly) out.push(ring);
  }
  return out;
};

/** 多邊形裁切到矩形（Sutherland–Hodgman） */
function clip(ring, [w, s, e, n]) {
  const edges = [
    [(p) => p[0] >= w, (a, b) => { const t = (w - a[0]) / (b[0] - a[0]); return [w, a[1] + t * (b[1] - a[1])]; }],
    [(p) => p[0] <= e, (a, b) => { const t = (e - a[0]) / (b[0] - a[0]); return [e, a[1] + t * (b[1] - a[1])]; }],
    [(p) => p[1] >= s, (a, b) => { const t = (s - a[1]) / (b[1] - a[1]); return [a[0] + t * (b[0] - a[0]), s]; }],
    [(p) => p[1] <= n, (a, b) => { const t = (n - a[1]) / (b[1] - a[1]); return [a[0] + t * (b[0] - a[0]), n]; }],
  ];
  let pts = ring;
  for (const [inside, cut] of edges) {
    const next = [];
    for (let i = 0; i < pts.length; i++) {
      const a = pts[i], b = pts[(i + 1) % pts.length];
      if (inside(a)) { next.push(a); if (!inside(b)) next.push(cut(a, b)); } else if (inside(b)) next.push(cut(a, b));
    }
    pts = next;
    if (!pts.length) break;
  }
  return pts;
}

/** 轉成 SVG 路徑；step：小數位數，相鄰重複點去掉 */
function toPath(rs, digits) {
  const f = (v) => Number(v.toFixed(digits));
  let d = '';
  for (const ring of rs) {
    const pts = [];
    for (const [lon, lat] of ring) {
      const p = [f(lon + 180), f(90 - lat)];
      const q = pts[pts.length - 1];
      if (!q || q[0] !== p[0] || q[1] !== p[1]) pts.push(p);
    }
    if (pts.length < 3) continue;
    d += 'M' + pts.map((p) => `${p[0]} ${p[1]}`).join('L') + 'Z';
  }
  return d;
}

const world = toPath(rings(world110), 1);
const detail = {};
for (const [name, box] of Object.entries(DETAIL_REGIONS)) {
  const rs = rings(world50).map((r) => clip(r, box)).filter((r) => r.length >= 3);
  detail[name] = { box, path: toPath(rs, 2) };
}

const out = `// 自動產生（tools/gen-world-map.mjs），請勿手動修改。
// 陸地資料：Natural Earth（公有領域）ne_110m_land；放大區域用 ne_50m_land。https://www.naturalearthdata.com/
// 座標：x = 經度 + 180、y = 90 − 緯度（單位：度）。
export const WORLD_LAND = '${world}';
export const DETAIL_LAND = ${JSON.stringify(detail)};
`;
writeFileSync(new URL('../src/data/worldMap.js', import.meta.url), out);
console.log(`worldMap.js：${(out.length / 1024).toFixed(1)} KB（世界 ${(world.length / 1024).toFixed(1)} KB）`);
