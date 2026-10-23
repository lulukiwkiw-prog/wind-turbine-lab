// 模型與規格一致性：在 Node 中建立 three.js 場景圖（不需 WebGL），比對世界座標與轉軸
import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import {
  DIM, PARTS, CURRENT_STAGE, COORDS, SIM, CABLE_ROUTE, EXPLODE, rotorCenterLocal, rotorAxisLocal, hubHeight, gearTrainAngles,
  upwindVector, lineAxes, substationLayout,
} from '../src/spec/turbineSpec.js';
import { createExploder } from '../src/animation/exploder.js';
import { createViewController } from '../src/model/viewState.js';
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

test('目前階段的零件都有可點選網格；網格只有一個葉片幾何（三片共用）', () => {
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
  s.set({ mode: 'experiment' }); // 第四階段才開放
  s.set({ animSpeed: 3 });
  s.set({ selectedPart: 'flywheel' }); // 不存在的零件
  s.set({ shellView: 'glass' });
  console.warn = warn;
  assert.equal(s.get().mode, 'exterior');
  assert.equal(s.get().animSpeed, 1);
  assert.equal(s.get().selectedPart, null);
  s.set({ selectedPart: 'tower', infoExpanded: true });
  s.set({ selectedPart: 'blade' });
  assert.equal(s.get().infoExpanded, false, '換零件時收合進階說明');
});

test('第二階段：主軸與葉輪同角度；高速軸同向、畫面轉速有上限', () => {
  const { nodes, sensorParts } = build();
  const store = createStore();
  const anim = createAnimator({ nodes, sensorParts, store });
  anim.update(0.2);
  assert.equal(nodes.lowSpeedShaft.rotation.z, nodes.rotor.rotation.z);
  assert.ok(Math.sign(nodes.highSpeedShaft.rotation.z) === Math.sign(nodes.rotor.rotation.z), '高速軸與葉輪同向');
  assert.ok(anim.highSpeedRps() <= SIM.visualMaxHighSpeedRps + 1e-12);
  assert.ok(anim.highSpeedRps() > SIM.demoRotorRpm / 60, '高速軸比主軸快');
});

test('第二階段：外觀模式隱藏內部零件；剖視模式顯示；拿掉外殼只隱藏機艙外殼與導流罩', () => {
  const { scene, mats } = build();
  const view = createViewController({ root: scene, mats });
  const st = (mode, shellView) => ({ mode, shellView });
  const shown = (pred) => { let n = 0, v = 0; scene.traverse((o) => { if (o.isMesh && pred(o)) { n++; if (o.visible) v++; } }); return [v, n]; };
  view.apply(st('exterior', 'solid'));
  assert.equal(shown((o) => o.userData.internal)[0], 0);
  view.apply(st('cutaway', 'transparent'));
  const [vi, ni] = shown((o) => o.userData.internal);
  assert.equal(vi, ni);
  assert.ok(ni > 30, `內部零件網格數 ${ni}`);
  assert.equal(scene.getObjectByName('nacelleShell').material.transparent, true);
  view.apply(st('cutaway', 'hidden'));
  assert.equal(scene.getObjectByName('nacelleShell').visible, false);
  assert.equal(scene.getObjectByName('spinner').visible, false);
  assert.equal(scene.getObjectByName('towerShell').visible, true, '塔架不能拿掉，只變透明');
  view.apply(st('exterior', 'solid'));
  assert.equal(scene.getObjectByName('nacelleShell').visible, true);
  assert.equal(scene.getObjectByName('nacelleShell').material.transparent, false);
});

test('第二階段：內部零件不互相穿插、都在機艙外殼內', () => {
  const { scene } = build();
  const box = (name) => new THREE.Box3().setFromObject(scene.getObjectByName(name));
  const shell = box('nacelleShell');
  // 主軸會穿出機艙前端接到輪轂，所以不在此列（另有規格測試檢查它接到輪轂法蘭）
  for (const n of ['gearboxPlanetary', 'gearboxParallel', 'generatorStator', 'controllerBox', 'brakeDisc']) {
    assert.ok(shell.containsBox(box(n)), `${n} 超出機艙外殼`);
  }
  assert.ok(!box('controllerBox').intersectsBox(box('generatorStator')), '控制器與發電機重疊');
  for (let i = 0; i < 4; i++) {
    const m = box(`yawMotor${i}`);
    for (const n of ['gearboxPlanetary', 'gearboxParallel', 'generatorStator']) {
      assert.ok(!m.intersectsBox(box(n)), `偏航馬達 ${i} 與 ${n} 重疊`);
    }
  }
});

test('第二階段：電纜在任何偏航角都與塔內電纜相接', () => {
  const { nodes, scene } = build();
  const last = CABLE_ROUTE.nacelle[CABLE_ROUTE.nacelle.length - 1];
  for (const yaw of [0, 75, 190]) {
    nodes.yaw.rotation.y = yaw * DEG;
    scene.updateMatrixWorld(true);
    const p = new THREE.Vector3(...last).applyMatrix4(nodes.nacelle.matrixWorld);
    near(p, new THREE.Vector3(...CABLE_ROUTE.tower[0]), 1e-6);
  }
});

// ---------------- 第三階段 ----------------
test('第三階段：拆解模式時齒輪節點角度 = gearTrainAngles（高速軸用真實速比）', () => {
  const { nodes, sensorParts } = build();
  const store = createStore();
  store.set({ mode: 'explode' });
  const anim = createAnimator({ nodes, sensorParts, store });
  anim.update(0.7);
  const g = gearTrainAngles(nodes.lowSpeedShaft.rotation.z);
  assert.ok(Math.abs(nodes.sunShaft.rotation.z - g.sun) < 1e-9);
  assert.ok(Math.abs(nodes.intermediateShaft.rotation.z - g.intermediate) < 1e-9);
  assert.ok(Math.abs(nodes.highSpeedShaft.rotation.z - g.high) < 1e-9);
  assert.ok(Math.abs(nodes.planet0.rotation.z + nodes.lowSpeedShaft.rotation.z - g.planetAbs[0]) < 1e-9);
});

test('第三階段：拆解位移——會轉的節點底下只能沿 z 軸移動；合起來後回到原位', () => {
  const { scene, nodes } = build();
  const rotating = new Set(EXPLODE.rotatingNodes.map((id) => nodes[id]));
  scene.traverse((o) => {
    if (!o.isMesh) return;
    const off = EXPLODE.offsets[o.userData.explodeKey ?? o.userData.partId];
    if (!off) return;
    let underRotating = false;
    for (let p = o.parent; p; p = p.parent) if (rotating.has(p)) underRotating = true;
    if (underRotating) assert.ok(off[0] === 0 && off[1] === 0, `${o.name || o.userData.partId} 在轉動節點下卻有 x/y 位移`);
  });
  const ex = createExploder({ root: scene, nodes });
  assert.ok(ex.count() > 20);
  const housing = scene.getObjectByName('gearboxParallel');
  const y0 = housing.position.y, rz = nodes.rotor.position.z;
  ex.setInstant(1);
  assert.ok(Math.abs(housing.position.y - y0 - EXPLODE.offsets.gearbox[1]) < 1e-9);
  assert.ok(Math.abs(nodes.rotor.position.z - rz - EXPLODE.nodeOffsets.rotor[2]) < 1e-9);
  ex.setInstant(0);
  assert.equal(housing.position.y, y0);
  assert.equal(nodes.rotor.position.z, rz);
});

test('第三階段：齒輪只在拆解模式顯示；可隱藏零件與只看一個零件', () => {
  const { scene, mats } = build();
  const view = createViewController({ root: scene, mats });
  const base = { shellView: 'hidden', hiddenParts: [], soloPart: null };
  const vis = (name) => scene.getObjectByName(name).visible;
  view.apply({ ...base, mode: 'cutaway', shellView: 'transparent' });
  assert.equal(vis('sunGearMesh'), false);
  assert.equal(vis('gearboxParallel'), true);
  view.apply({ ...base, mode: 'explode' });
  assert.equal(vis('sunGearMesh'), true);
  assert.equal(vis('planetMesh1'), true);
  view.apply({ ...base, mode: 'explode', hiddenParts: ['gearbox'] });
  assert.equal(vis('gearboxParallel'), false);
  assert.equal(vis('sunGearMesh'), true);
  view.apply({ ...base, mode: 'explode', soloPart: 'generator' });
  assert.equal(vis('generatorStator'), true);
  assert.equal(vis('sunGearMesh'), false);
  assert.equal(vis('towerShell'), false);
  // 離開拆解模式：隱藏設定不再生效
  view.apply({ ...base, mode: 'exterior', shellView: 'solid', hiddenParts: ['tower'] });
  assert.equal(vis('towerShell'), true);
});

// ---------------- 物理合理性 ----------------
test('風速計：正轉時每個杯子都是圓頂（凸面）在前、杯口（凹面）在後', () => {
  const { sensorParts, nodes } = build();
  const head = sensorParts.anemometerHead;
  head.updateMatrixWorld(true);
  let cups = 0;
  head.traverse((o) => {
    if (!o.isMesh || o.geometry.type !== 'SphereGeometry') return;
    cups++;
    o.geometry.computeBoundingBox();
    const bb = o.geometry.boundingBox;
    // 圓頂方向（杯子局部）：bounding box 偏向哪一側
    const domeLocal = new THREE.Vector3(0, 0, Math.sign(bb.max.z + bb.min.z));
    const dome = domeLocal.transformDirection(o.matrixWorld);
    const p = o.getWorldPosition(new THREE.Vector3()).sub(head.getWorldPosition(new THREE.Vector3()));
    const motion = new THREE.Vector3(0, 1, 0).transformDirection(head.matrixWorld).cross(p); // 繞 +Y 正轉的移動方向
    assert.ok(dome.dot(motion) > 0, '杯子的圓頂應朝向移動方向');
  });
  assert.equal(cups, 3);
  assert.ok(nodes);
});

test('偏航：風向改變時機艙對準風（氣象慣例）', () => {
  const { nodes, sensorParts, scene } = build();
  const store = createStore();
  const anim = createAnimator({ nodes, sensorParts, store });
  for (const th of [0, 90, 200]) {
    store.set({ windAngleDeg: th });
    anim.update(0);
    scene.updateMatrixWorld(true);
    const face = new THREE.Vector3(0, 0, 1).transformDirection(nodes.nacelle.matrixWorld);
    const u = upwindVector(th);
    assert.ok(face.distanceTo(new THREE.Vector3(...u)) < 1e-9, `風向 ${th}° 時機艙沒有對準風`);
  }
});

test('樹與山丘不會擋在輸電線、變電所與鐵塔的走廊上', () => {
  const { scene } = build();
  const { along, across } = lineAxes();
  const trees = scene.getObjectByName('trees');
  const m = new THREE.Matrix4(), p = new THREE.Vector3();
  for (let i = 0; i < trees.count; i++) {
    trees.getMatrixAt(i, m);
    p.setFromMatrixPosition(m);
    const a = p.x * along[0] + p.z * along[2], c = Math.abs(p.x * across[0] + p.z * across[2]);
    assert.ok(!(a > -5 && a < 520 && c < 22), `第 ${i} 棵樹在線路走廊上`);
  }
  const hills = scene.getObjectByName('hills');
  for (const t of substationLayout().towers) {
    for (let i = 0; i < hills.count; i++) {
      hills.getMatrixAt(i, m);
      const s = new THREE.Vector3().setFromMatrixScale(m);
      p.setFromMatrixPosition(m);
      assert.ok(Math.hypot(p.x - t[0], p.z - t[2]) > Math.max(s.x, s.z), '高壓鐵塔埋在山丘裡');
    }
  }
});
