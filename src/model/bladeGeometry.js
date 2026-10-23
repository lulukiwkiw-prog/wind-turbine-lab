// 葉片幾何（只在初始化時產生一次，三片葉片共用）
//
// 葉片局部座標（= pitch 節點）：
//   +Y：沿葉片往葉尖（y = r − rootR）
//   +X：槳距角 0° 時的前緣方向（葉輪從上風看順時針轉，朝上的葉片往 +X 移動）
//   +Z：上風側（壓力面）
// 每個斷面依 bladeSectionAt(r) 決定弦長、扭轉、厚度，葉根由圓形平滑過渡到翼型。
import * as THREE from 'three';
import { DIM, COORDS, bladeSectionAt } from '../spec/turbineSpec.js';

// NACA 4 位數厚度分佈（後緣閉合版）
function naca(s, t) {
  return 5 * t * (0.2969 * Math.sqrt(s) - 0.126 * s - 0.3516 * s * s + 0.2843 * s ** 3 - 0.1036 * s ** 4);
}

/** 單一斷面上的點（x, z），θ ∈ [0, 2π)：θ=0 前緣，θ=π 後緣，θ∈(0,π) 上風面 */
export function sectionPoint(r, theta) {
  const { chord, twistDeg, thickness, blend } = bladeSectionAt(r);
  const b = DIM.blade;
  // 翼型
  const s = (1 - Math.cos(theta)) / 2; // 0 前緣 → 1 後緣
  const upper = Math.sin(theta) >= 0;
  const yt = naca(s, Math.min(thickness, 0.5)) * chord;
  const camber = -0.025 * 4 * s * (1 - s) * chord * blend; // 彎度往下風側（吸力面）
  const ax = (b.pitchAxisChordFrac - s) * chord;
  const az = (upper ? yt : -yt) + camber;
  // 圓
  const d = b.rootDiameter;
  const cx = (d / 2) * Math.cos(theta);
  const cz = (d / 2) * Math.sin(theta);
  const x = cx + (ax - cx) * blend;
  const z = cz + (az - cz) * blend;
  // 扭轉：與槳距同方向（前緣轉往上風 +Z）
  const a = COORDS.pitchSign * twistDeg * Math.PI / 180;
  return [x * Math.cos(a) + z * Math.sin(a), -x * Math.sin(a) + z * Math.cos(a)];
}

export function createBladeGeometry() {
  const b = DIM.blade;
  const R = DIM.rotor.radius;
  const nS = b.sections;
  const nP = b.profilePoints;
  // 斷面半徑：葉根附近較密
  const radii = [];
  for (let i = 0; i <= nS; i++) {
    const u = i / nS;
    radii.push(b.rootR + (R - b.rootR) * (u * u * 0.35 + u * 0.65));
  }
  const pos = [];
  const idx = [];
  for (const r of radii) {
    for (let j = 0; j < nP; j++) {
      const th = (j / nP) * Math.PI * 2;
      const [x, z] = sectionPoint(r, th);
      pos.push(x, r - b.rootR, z);
    }
  }
  for (let i = 0; i < nS; i++) {
    for (let j = 0; j < nP; j++) {
      const a = i * nP + j;
      const bb = (i + 1) * nP + j;
      const c = i * nP + ((j + 1) % nP);
      const d = (i + 1) * nP + ((j + 1) % nP);
      // 外法線：(上一圈 → 下一圈) × (沿斷面) 指向外側
      idx.push(a, bb, c, c, bb, d);
    }
  }
  // 葉尖封口（扇形）
  const tipCenter = pos.length / 3;
  {
    let cx = 0, cz = 0;
    for (let j = 0; j < nP; j++) { cx += pos[(nS * nP + j) * 3]; cz += pos[(nS * nP + j) * 3 + 2]; }
    pos.push(cx / nP, R - b.rootR + 0.05, cz / nP);
  }
  for (let j = 0; j < nP; j++) idx.push(nS * nP + j, tipCenter, nS * nP + ((j + 1) % nP));
  // 葉根封口
  const rootCenter = pos.length / 3;
  pos.push(0, 0, 0);
  for (let j = 0; j < nP; j++) idx.push(j, (j + 1) % nP, rootCenter);

  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setIndex(idx);
  g.computeVertexNormals();
  g.computeBoundingSphere();
  return g;
}
