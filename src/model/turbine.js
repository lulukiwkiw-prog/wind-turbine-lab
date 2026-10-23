// 風力發電機模型（外觀）
//
// 依 turbineSpec.HIERARCHY 建立群組節點，再把網格掛到節點上。
// 所有幾何只在這裡建立一次；動畫只改節點的旋轉（見 animation/）。
// userData.shell：true = 剖視時可拿掉的外殼（機艙、導流罩）；'see' = 只會變透明（塔架）。
import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { DIM, HIERARCHY } from '../spec/turbineSpec.js';
import { createBladeGeometry } from './bladeGeometry.js';
import { buildInternals } from './internals.js';

const DEG = Math.PI / 180;

/** 依 HIERARCHY 建立節點；回傳 { root, nodes } */
export function buildHierarchy() {
  const nodes = {};
  for (const n of HIERARCHY) {
    const g = new THREE.Group();
    g.name = n.id;
    if (n.position) g.position.fromArray(n.position);
    if (n.rotation) {
      g.rotation.set(n.rotation[0] * DEG, n.rotation[1] * DEG, n.rotation[2] * DEG, n.rotationOrder ?? 'XYZ');
    }
    nodes[n.id] = g;
    if (n.parent) nodes[n.parent].add(g);
  }
  return { root: nodes.world, nodes };
}

function tag(mesh, partId) {
  mesh.userData.partId = partId;
  return mesh;
}

export function buildTurbine(mats) {
  const { root, nodes } = buildHierarchy();
  const add = (parent, geo, mat, partId, setup) => {
    const m = tag(new THREE.Mesh(geo, mat), partId);
    if (setup) setup(m);
    parent.add(m);
    return m;
  };

  // ---------- 基礎 ----------
  {
    const f = DIM.foundation;
    add(nodes.foundation, new THREE.CylinderGeometry(f.radius, f.radius * 1.08, f.height, 40),
      mats.part('foundation', 'foundation', { roughness: 0.95 }), 'foundation',
      (m) => { m.position.y = f.height / 2; });
  }

  // ---------- 塔架 ----------
  {
    const t = DIM.tower;
    const h = t.topY - t.baseY;
    const towerMat = mats.part('tower', 'tower', { roughness: 0.45, shell: true });
    add(nodes.tower, new THREE.CylinderGeometry(t.topRadius, t.baseRadius, h, 48, 1, true), towerMat, 'tower',
      (m) => { m.position.y = t.baseY + h / 2; m.userData.shell = 'see'; m.name = 'towerShell'; });
    // 法蘭（塔架分段接合處，示意）
    const flangeMat = mats.part('tower', 'towerFlange', { roughness: 0.5, shell: true });
    for (const frac of [0, 0.36, 0.68, 1]) {
      const y = t.baseY + h * frac;
      const r = t.baseRadius + (t.topRadius - t.baseRadius) * frac + 0.06;
      add(nodes.tower, new THREE.CylinderGeometry(r, r, t.flangeHeight, 48), flangeMat, 'tower',
        (m) => { m.position.y = Math.min(y, t.topY - t.flangeHeight / 2); m.userData.shell = 'see'; });
    }
    // 塔門（朝世界 +Z）
    const d = t.door;
    add(nodes.tower, new THREE.BoxGeometry(d.width, d.height, 0.3), mats.part('tower', 'door', { roughness: 0.5, shell: true }), 'tower',
      (m) => { m.position.set(0, d.sillY + d.height / 2, t.baseRadius - 0.07); m.userData.shell = 'see'; });
  }

  // ---------- 機艙外殼 ----------
  {
    const n = DIM.nacelle;
    const size = n.max.map((v, i) => v - n.min[i]);
    const center = n.max.map((v, i) => (v + n.min[i]) / 2);
    add(nodes.nacelle, new RoundedBoxGeometry(size[0], size[1], size[2], 4, n.cornerRadius),
      mats.part('nacelle', 'nacelle', { roughness: 0.4, shell: true }), 'nacelle',
      (m) => { m.position.fromArray(center); m.name = 'nacelleShell'; m.userData.shell = true; });
    // 兩側裝飾條
    const trimMat = mats.part('nacelle', 'nacelleTrim', { roughness: 0.4, shell: true });
    for (const sx of [-1, 1]) {
      add(nodes.nacelle, new THREE.BoxGeometry(0.04, 0.35, size[2] * 0.82), trimMat, 'nacelle',
        (m) => { m.position.set(sx * (size[0] / 2 + 0.01), center[1] - 0.6, center[2] - 0.3); m.userData.shell = true; });
    }
    // 機艙底部與塔頂之間的偏航軸承外圈（外觀可見的一圈）
    add(nodes.nacelle, new THREE.CylinderGeometry(DIM.tower.topRadius + 0.12, DIM.tower.topRadius + 0.12, 0.3, 48),
      mats.part('nacelle', 'towerFlange', { roughness: 0.5, shell: true }), 'nacelle', (m) => { m.position.y = 0.15; m.userData.shell = 'see'; });
  }

  // ---------- 導流罩（輪轂外罩） ----------
  {
    const s = DIM.spinner;
    const pts = [new THREE.Vector2(0.001, s.rearZ), new THREE.Vector2(s.radius, s.rearZ), new THREE.Vector2(s.radius, s.shoulderZ)];
    const a = s.noseZ - s.shoulderZ;
    for (let i = 1; i <= 16; i++) {
      const u = i / 16;
      const z = s.shoulderZ + a * u;
      pts.push(new THREE.Vector2(Math.max(0.001, s.radius * Math.sqrt(1 - u * u)), z));
    }
    const geo = new THREE.LatheGeometry(pts, 40);
    geo.rotateX(Math.PI / 2); // Lathe 繞 Y → 改成繞葉輪軸 Z
    add(nodes.rotor, geo, mats.part('hub', 'spinner', { roughness: 0.35, shell: true }), 'hub',
      (m) => { m.name = 'spinner'; m.userData.shell = true; });
  }

  // ---------- 葉片（三片共用同一個幾何與材質） ----------
  {
    const geo = createBladeGeometry();
    const mat = mats.part('blade', 'blade', { roughness: 0.45 });
    for (let i = 0; i < DIM.rotor.bladeCount; i++) {
      add(nodes[`pitch${i}`], geo, mat, 'blade', (m) => { m.name = `bladeMesh${i}`; });
    }
  }

  // ---------- 風速計與風向標（機艙頂部後方） ----------
  const sensorParts = {};
  {
    const s = DIM.sensors;
    const sensorMat = mats.part('anemometer', 'sensor', { roughness: 0.5 });
    const vaneMat = mats.part('windVane', 'sensor', { roughness: 0.5 });
    const mastGeo = new THREE.CylinderGeometry(0.05, 0.06, s.mastHeight, 10);

    // 風速計
    const anemo = new THREE.Group();
    anemo.name = 'anemometer';
    anemo.position.fromArray(s.anemometer.at);
    nodes.nacelle.add(anemo);
    add(anemo, mastGeo, sensorMat, 'anemometer', (m) => { m.position.y = s.mastHeight / 2; });
    const head = new THREE.Group();
    head.name = 'anemometerHead';
    head.position.y = s.mastHeight;
    anemo.add(head);
    const armGeo = new THREE.CylinderGeometry(0.015, 0.015, s.anemometer.cupRadius, 6);
    armGeo.rotateZ(Math.PI / 2);
    armGeo.translate(s.anemometer.cupRadius / 2, 0, 0);
    const cupGeo = new THREE.SphereGeometry(0.07, 12, 8, 0, Math.PI * 2, 0, Math.PI / 2);
    cupGeo.rotateX(Math.PI / 2); // 杯口朝 -Z（再隨臂旋轉）
    for (let i = 0; i < 3; i++) {
      const arm = new THREE.Group();
      arm.rotation.y = (i * 2 * Math.PI) / 3;
      head.add(arm);
      add(arm, armGeo, sensorMat, 'anemometer');
      add(arm, cupGeo, sensorMat, 'anemometer', (m) => { m.position.x = s.anemometer.cupRadius; });
    }
    sensorParts.anemometerHead = head;

    // 風向標：尾翼指向下風（機艙局部 -Z）
    const vane = new THREE.Group();
    vane.name = 'windVane';
    vane.position.fromArray(s.windVane.at);
    nodes.nacelle.add(vane);
    add(vane, mastGeo, vaneMat, 'windVane', (m) => { m.position.y = s.mastHeight / 2; });
    const vhead = new THREE.Group();
    vhead.name = 'windVaneHead';
    vhead.position.y = s.mastHeight;
    vane.add(vhead);
    add(vhead, new THREE.CylinderGeometry(0.025, 0.025, s.windVane.length, 6).rotateX(Math.PI / 2), vaneMat, 'windVane');
    add(vhead, new THREE.ConeGeometry(0.06, 0.16, 10).rotateX(Math.PI / 2), vaneMat, 'windVane',
      (m) => { m.position.z = s.windVane.length / 2 + 0.08; });
    add(vhead, new THREE.BoxGeometry(0.02, 0.28, 0.3), vaneMat, 'windVane',
      (m) => { m.position.z = -s.windVane.length / 2; });
    sensorParts.windVaneHead = vhead;
  }

  // ---------- 內部機械與電纜（第二階段） ----------
  buildInternals({ nodes, mats, add });

  return { root, nodes, sensorParts };
}
