// 發電實驗的流動畫面（第四階段，教學示意）
//   - 風的流線：從上風處吹向葉輪；通過葉輪後變慢（風把一部分能量交給葉輪），慢多少由模擬的 Cp 決定
//   - 能量流動點：從發電機出發，沿電纜、地下電纜、變壓器、電線、變電所、高壓鐵塔送往遠方；點的數量跟發電量成正比
// 幾何只建立一次；每幀只更新 InstancedMesh 的矩陣。
import * as THREE from 'three';
import {
  DIM, DRIVETRAIN, CABLE_ROUTE, SIM, PALETTE, RANDOM_SEED, highSpeedShaftOffset, drivetrainToNacelle,
  substationLayout, lineAxes, upwindVector,
} from '../spec/turbineSpec.js';
import { createRng } from '../spec/rng.js';

const WIND_COUNT = 70;
const DOT_COUNT = 220;
const UPSTREAM = 80, DOWNSTREAM = 70; // 流線從上風 80 m 吹到下風 70 m

/** 世界座標的送電路徑（不含機艙段，機艙段會跟著偏航轉，每幀另外計算） */
function staticPath() {
  const s = DIM.site;
  const sub = s.substation;
  const lay = substationLayout();
  const { along, across } = lineAxes();
  const P = (b, a, c, y) => [b[0] + along[0] * a + across[0] * c, y, b[2] + along[2] * a + across[2] * c];
  const lift = (p, y) => [p[0], y, p[2]];
  const off = CABLE_ROUTE.riserOffset;
  return [
    ...CABLE_ROUTE.tower,
    ...CABLE_ROUTE.underground.map((p) => lift(p, 0.35)),
    ...CABLE_ROUTE.riser.map((p) => [p[0] + off[0], p[1] + 0.35, p[2] + off[2]]),
    ...s.poles.slice(1).map((p) => lift(p, s.poleHeight - 0.45)),
    P(lay.gantryIn, 0, 0, sub.gantryHeight - 0.2),
    P(lay.center, 0, -2.5, 3.2), // 經過主變壓器
    P(lay.gantryOut, 0, 0, sub.gantryHeight + 3.2),
    ...lay.towers.map((t) => P(t, 0, 0, s.hvLine.towerHeight + 0.3)),
  ];
}

export function createFlows({ scene, nodes, sim, store }) {
  const group = new THREE.Group();
  group.name = 'flows';
  scene.add(group);

  // ---------- 風的流線 ----------
  const windGeo = new THREE.BoxGeometry(0.18, 0.18, 1);
  const windMat = new THREE.MeshBasicMaterial({ color: PALETTE.wind, transparent: true, opacity: 0.4, depthWrite: false });
  const wind = new THREE.InstancedMesh(windGeo, windMat, WIND_COUNT);
  wind.name = 'windStreaks';
  wind.frustumCulled = false;
  group.add(wind);
  const rng = createRng(RANDOM_SEED + 4);
  const streaks = Array.from({ length: WIND_COUNT }, () => {
    const r = Math.sqrt(rng.next()) * DIM.rotor.radius * 1.2;
    const a = rng.range(0, Math.PI * 2);
    return { p: Math.cos(a) * r, q: Math.sin(a) * r, s: rng.range(-UPSTREAM, DOWNSTREAM) };
  });

  // ---------- 能量流動點 ----------
  const dotGeo = new THREE.SphereGeometry(1, 10, 6);
  const dotMat = new THREE.MeshBasicMaterial({ color: PALETTE.energy });
  const dots = new THREE.InstancedMesh(dotGeo, dotMat, DOT_COUNT);
  dots.name = 'energyDots';
  dots.frustumCulled = false;
  group.add(dots);
  const [hx, hy] = highSpeedShaftOffset();
  const g = DRIVETRAIN.generator;
  const nacellePath = [drivetrainToNacelle([hx, hy, (g.z0 + g.z1) / 2]), ...CABLE_ROUTE.nacelle];
  const rest = staticPath().map((p) => new THREE.Vector3(...p));
  // 用黃金比例打散：點數變少時仍平均分布在整條路線上
  const order = Array.from({ length: DOT_COUNT }, (_, i) => (i * 0.6180339887) % 1);

  let flowT = 0;
  const m = new THREE.Matrix4();
  const q = new THREE.Quaternion();
  const v3 = new THREE.Vector3();
  const sc = new THREE.Vector3();
  const zAxis = new THREE.Vector3(0, 0, 1);

  function buildPath() {
    const pts = nacellePath.map((p) => new THREE.Vector3(...p).applyMatrix4(nodes.nacelle.matrixWorld));
    const all = [...pts, ...rest.slice(1)]; // 機艙段終點 = 塔內電纜起點
    const cum = [0];
    for (let i = 1; i < all.length; i++) cum.push(cum[i - 1] + all[i].distanceTo(all[i - 1]));
    return { all, cum, length: cum[cum.length - 1] };
  }

  function pointAt(path, d, out) {
    let i = 1;
    while (i < path.cum.length - 1 && path.cum[i] < d) i++;
    const t = (d - path.cum[i - 1]) / (path.cum[i] - path.cum[i - 1] || 1);
    return out.copy(path.all[i - 1]).lerp(path.all[i], Math.min(Math.max(t, 0), 1));
  }

  return {
    group,
    /** dt 已乘上慢動作倍率；visible：是否在發電實驗模式 */
    update(dt, visible) {
      group.visible = visible;
      if (!visible) return;
      const now = sim.get();
      const v = store.get().windSpeed;

      // 風：沿實際風向（不是機艙方向）吹
      const u = new THREE.Vector3(...upwindVector(store.get().windAngleDeg));
      const flow = u.clone().negate();
      q.setFromUnitVectors(zAxis, flow);
      const side = new THREE.Vector3(0, 1, 0).cross(u).normalize();
      const up = new THREE.Vector3(0, 1, 0);
      const hub = nodes.rotor.getWorldPosition(new THREE.Vector3());
      sc.set(1, 1, v > 0 ? 4 + v * 0.9 : 0); // 風越快，流線越長
      for (let i = 0; i < WIND_COUNT; i++) {
        const st = streaks[i];
        const speed = st.s < 0 ? v : now.wakeSpeed + (v - now.effectiveWind); // 葉輪後方變慢
        st.s += speed * dt;
        if (st.s > DOWNSTREAM) st.s -= UPSTREAM + DOWNSTREAM;
        v3.copy(hub).addScaledVector(flow, st.s).addScaledVector(side, st.p).addScaledVector(up, st.q);
        if (v3.y < 1) v3.y = 1;
        m.compose(v3, q, sc);
        wind.setMatrixAt(i, m);
      }
      wind.instanceMatrix.needsUpdate = true;

      // 能量：點數 ∝ 發電量
      const path = buildPath();
      flowT = (flowT + SIM.energyDotSpeed * dt) % path.length;
      const frac = Math.min(1, now.powerKW / SIM.ratedPowerKW);
      const spacing = path.length / DOT_COUNT;
      for (let i = 0; i < DOT_COUNT; i++) {
        const show = order[i] < frac;
        const d = (flowT + i * spacing) % path.length;
        pointAt(path, d, v3);
        // 機艙與塔內的點小一點，戶外的點大一點才看得到
        const inside = Math.hypot(v3.x, v3.z) < 3 && v3.y > 1;
        const r = show ? (inside ? 0.14 : 0.55 + Math.min(d / path.length, 1) * 0.6) : 0;
        m.compose(v3, q.identity(), sc.set(r, r, r));
        dots.setMatrixAt(i, m);
      }
      dots.instanceMatrix.needsUpdate = true;
    },
    pathLength: () => buildPath().length,
  };
}
