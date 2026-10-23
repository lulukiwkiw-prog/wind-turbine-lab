// 「葉片切開來看」小圖：用 3D 模型同一個斷面公式（bladeGeometry.sectionPoint）畫出翼型，
// 再加上空氣流動與升力的箭頭（箭頭是教學示意）。只在初始化時產生一次 SVG 字串。
import { DIM, bladeSectionAt, COORDS } from '../spec/turbineSpec.js';
import { sectionPoint } from '../model/bladeGeometry.js';

export const AIRFOIL_FIG_R = 0.6 * DIM.rotor.radius; // 取葉片 60% 處的斷面（已完全是翼型）

/** 斷面輪廓（公尺）：已扣掉扭轉，弦線水平；u = 往前緣，v = 往下風（吸力面、比較彎的一面） */
export function airfoilOutline(r = AIRFOIL_FIG_R, n = 72) {
  const a = -COORDS.pitchSign * bladeSectionAt(r).twistDeg * Math.PI / 180; // 反轉扭轉
  const pts = [];
  for (let i = 0; i < n; i++) {
    const [x, z] = sectionPoint(r, (i / n) * 2 * Math.PI);
    const xr = x * Math.cos(a) + z * Math.sin(a);
    const zr = -x * Math.sin(a) + z * Math.cos(a);
    pts.push([xr, -zr]); // +Z 是上風（壓力面），所以下風 = −Z
  }
  return pts;
}

export function airfoilSVG() {
  const pts = airfoilOutline();
  const us = pts.map((p) => p[0]), vs = pts.map((p) => p[1]);
  const uMax = Math.max(...us), uMin = Math.min(...us);
  const W = 320, H = 200, pad = 46;
  const k = (W - pad * 2) / (uMax - uMin);
  const cy = 118;
  // 前緣放左邊（風從左邊來），比較彎的一面朝上
  const X = (u) => pad + (uMax - u) * k;
  const Y = (v) => cy - v * k;
  const d = pts.map((p, i) => `${i ? 'L' : 'M'}${X(p[0]).toFixed(1)} ${Y(p[1]).toFixed(1)}`).join(' ') + ' Z';
  const top = Y(Math.max(...vs)), bottom = Y(Math.min(...vs));
  const x0 = X(uMax), x1 = X(uMin);
  const liftX = x0 + (x1 - x0) * 0.35; // 升力大約作用在前緣後面 1/4～1/3 處
  return `<svg viewBox="0 0 ${W} ${H}" role="img" aria-label="葉片切開來看：一面比較彎，空氣跑得比較快；另一面比較平，空氣跑得比較慢；產生往旁邊推的升力">
  <defs><marker id="af-arrow" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse"><path d="M0 0L10 5L0 10z" fill="currentColor"/></marker></defs>
  <text x="${W / 2}" y="18" text-anchor="middle" class="af-title">葉片切開來看</text>
  <g class="af-air">
    <path d="M6 ${cy - 4} H${x0 - 6}" marker-end="url(#af-arrow)"/>
    <path d="M${x0 - 2} ${top - 10} C ${x0 + 40} ${top - 30}, ${x1 - 60} ${top - 22}, ${W - 8} ${cy - 10}" class="af-fast" marker-end="url(#af-arrow)"/>
    <path d="M${x0 - 2} ${bottom + 10} C ${x0 + 60} ${bottom + 16}, ${x1 - 60} ${bottom + 14}, ${W - 8} ${cy + 14}" marker-end="url(#af-arrow)"/>
  </g>
  <path d="${d}" class="af-blade"/>
  <path d="M${liftX} ${top + 4} V 30" class="af-lift" marker-end="url(#af-arrow)"/>
  <text x="10" y="${cy - 12}" class="af-label">風</text>
  <text x="${liftX - 14}" y="44" text-anchor="end" class="af-label af-lift-text">升力：往旁邊推</text>
  <text x="${W - 6}" y="44" text-anchor="end" class="af-label af-fast-text">比較彎：空氣跑得快</text>
  <text x="${W - 6}" y="${H - 6}" text-anchor="end" class="af-label">比較平：空氣跑得慢</text>
</svg>
<p class="af-note">形狀取自這台模型的葉片；箭頭是教學示意</p>`;
}
