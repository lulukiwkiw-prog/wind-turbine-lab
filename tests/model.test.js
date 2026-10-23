// 模型與規格一致性：在 Node 中建立 three.js 場景圖（不需 WebGL），比對世界座標與轉軸
import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { DIM, PARTS, CURRENT_STAGE, COORDS, rotorCenterLocal, rotorAxisLocal, hubHeight } from '../src/spec/turbineSpec.js';
import { createMaterialRegistry } from '../src/model/materials.js';
import { buildTurbine } from '../src/model/turbine.js';
import { buildSite } from '../src/model/site.js';
import { createBladeGeometry, sectionPoint } from '../src/model/bladeGeometry.js';
import { createStore } from '../src/state/store.js';
import { createAnimator } from '../src/animation/animator.js';

const DEG = Math.PI / 180;
const near = (a, b, eps = 1e-6) => assert.ok(a.distanceTo(b) < eps, `${a.toArray()} ≠ ${b.toArray()}`);

function build() {
  const mats = createMaterialRegistry();
  const t = buildTurbine(mats);
  const site = buildSite(mats);
  const scene = new THREE.Scene();
  scene.add(t.root, site);
  scene.updateMatrixWorld(true);
  return { ...t, scene, mats };
}

test('葉輪中心的世界座標 = 規格計算值（偏航 0° 與 90°）', () => {
  const { nodes } = build();
  const c = new THREE.Vector3(...rotorCenterLocal());
  const w = nodes.rotor.getWorldPosition(new THREE.Vector3());
  near(w, new THREE.Vector3(c.x, c.y + DIM.tower.topY, c.z));
  assert.ok(Math.abs(w.y - hubHeight()) < 1e-6);
  nodes.yaw.rotation.y = 90 * DEG;
  nodes.yaw.updateMatrixWorld(true);
  const w90 = nodes.rotor.getWorldPosition(new THREE.Vector3());
  // 偏航 90°：葉輪面朝 +X（風從 +X 吹來）
  near(w90, new THREE.Vector3(c.z, c.y + DIM.tower.topY, -c.x));
});

test('葉輪旋轉軸（世界）= 規格的葉輪軸', () => {
  const { nodes } = build();
  const axis = new THREE.Vector3(0, 0, 1).transformDirection(nodes.rotor.matrixWorld);
  near(axis, new THREE.Vector3(...rotorAxisLocal()), 1e-9);
});

test('葉片根部位於變槳軸承半徑、三片相隔 120°，葉尖在葉輪半徑上', () => {
  const { nodes } = build();
  const center = nodes.rotor.getWorldPosition(new THREE.Vector3());
  const tips = [];
  for (let i = 0; i < DIM.rotor.bladeCount; i++) {
    const root = nodes[`pitch${i}`].getWorldPosition(new THREE.Vector3());
    assert.ok(Math.abs(root.distanceTo(center) - DIM.blade.rootR) < 1e-6);
    const tip = new THREE.Vector3(0, DIM.rotor.radius - DIM.blade.rootR, 0).applyMatrix4(nodes[`pitch${i}`].matrixWorld);
    assert.ok(Math.abs(tip.distanceTo(center) - DIM.rotor.radius) < 1e-6, '葉尖距中心 = R');
    tips.push(tip.sub(center).normalize());
  }
  for (let i = 0; i < 3; i++) {
    const a = tips[i].angleTo(tips[(i + 1) % 3]) / DEG;
    assert.ok(Math.abs(a - 120) < 1.5, `葉片夾角 ${a}`); // 錐角使夾角略小於 120°
  }
});

test('動畫：葉輪從上風看順時針轉，槳距角讓前緣轉向上風', () => {
  const { nodes, sensorParts } = build();
  const store = createStore();
  const anim = createAnimator({ nodes, sensorParts, store });
  anim.update(0);
  nodes.rotor.updateMatrixWorld(true);
  const tip0 = new THREE.Vector3(0, 40, 0).applyMatrix4(nodes.pitch0.matrixWorld);
  anim.update(0.05);
  nodes.rotor.updateMatrixWorld(true);
  const tip1 = new THREE.Vector3(0, 40, 0).applyMatrix4(nodes.pitch0.matrixWorld);
  assert.ok(tip1.x > tip0.x, '朝上的葉片應往 +X（從上風看的右方）移動 → 順時針');

  store.set({ pitchDeg: 30 });
  anim.update(0);
  nodes.rotor.updateMatrixWorld(true);
  const le = new THREE.Vector3(1, 0, 0).transformDirection(nodes.pitch0.matrixWorld);
  assert.ok(le.z > 0.4, '槳距 30° 時前緣朝上風');
  assert.equal(COORDS.pitchSign, -1);
});

test('暫停時葉輪不轉；慢動作時轉得較慢', () => {
  const { nodes, sensorParts } = build();
  const store = createStore();
  const anim = createAnimator({ nodes, sensorParts, store });
  anim.update(0.1);
  const a1 = anim.rotorAngleDeg();
  store.set({ paused: true });
  anim.update(0.5);
  assert.equal(anim.rotorAngleDeg(), a1);
  store.set({ paused: false, animSpeed: 0.25 });
  anim.update(0.1);
  const slow = Math.abs(anim.rotorAngleDeg() - a1);
  assert.ok(Math.abs(slow - Math.abs(a1) * 0.25) < 1e-6);
});

test('第一階段的零件都有可點選網格；網格只有一個葉片幾何（三片共用）', () => {
  const { scene } = build();
  const found = new Set();
  const bladeGeos = new Set();
  scene.traverse((o) => {
    if (o.isMesh && o.userData.partId) found.add(o.userData.partId);
    if (o.isMesh && o.userData.partId === 'blade') bladeGeos.add(o.geometry);
  });
  for (const p of PARTS.filter((q) => q.stage <= CURRENT_STAGE)) assert.ok(found.has(p.id), `缺少零件網格 ${p.id}`);
  assert.equal(bladeGeos.size, 1);
});

test('葉片幾何：外法線朝外、葉根為圓、葉尖在 R', () => {
  const g = createBladeGeometry();
  g.computeBoundingBox();
  assert.ok(Math.abs(g.boundingBox.max.y - (DIM.rotor.radius - DIM.blade.rootR) - 0.05) < 1e-3);
  const [x, z] = sectionPoint(DIM.blade.rootR, Math.PI / 2);
  assert.ok(Math.abs(Math.hypot(x, z) - DIM.blade.rootDiameter / 2) < 1e-9, '葉根斷面為圓');
  // 取中段某頂點，法線應與「頂點相對斷面中心」同向
  const pos = g.attributes.position, nor = g.attributes.normal;
  const i = 20 * DIM.blade.profilePoints + 7;
  const p = new THREE.Vector3().fromBufferAttribute(pos, i);
  const n = new THREE.Vector3().fromBufferAttribute(nor, i);
  let cx = 0, cz = 0;
  for (let j = 0; j < DIM.blade.profilePoints; j++) { cx += pos.getX(20 * DIM.blade.profilePoints + j); cz += pos.getZ(20 * DIM.blade.profilePoints + j); }
  const out = new THREE.Vector3(p.x - cx / DIM.blade.profilePoints, 0, p.z - cz / DIM.blade.profilePoints);
  assert.ok(out.dot(n) > 0, '法線應朝外');
});

test('固定種子：兩次建立場地的樹位置完全相同', () => {
  const a = build().scene.getObjectByName('trees');
  const b = build().scene.getObjectByName('trees');
  assert.deepEqual(Array.from(a.instanceMatrix.array), Array.from(b.instanceMatrix.array));
});

test('集中狀態：拒絕不合法或尚未開放的值', () => {
  const s = createStore();
  const warn = console.warn;
  console.warn = () => {};
  s.set({ mode: 'explode' }); // 第三階段才開放
  s.set({ animSpeed: 3 });
  s.set({ selectedPart: 'gearbox' }); // 第二階段才有模型
  console.warn = warn;
  assert.equal(s.get().mode, 'exterior');
  assert.equal(s.get().animSpeed, 1);
  assert.equal(s.get().selectedPart, null);
  s.set({ selectedPart: 'tower', infoExpanded: true });
  s.set({ selectedPart: 'blade' });
  assert.equal(s.get().infoExpanded, false, '換零件時收合進階說明');
});
