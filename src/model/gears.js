// 齒輪箱內部（第三階段）：齒輪幾何（簡化齒形）、行星齒輪組、兩級平行軸齒輪、轉向箭頭
//
// ⚠ 教學簡化：齒形用梯形近似，不是漸開線；齒數與模數來自 turbineSpec 的示意配置。
// 每個齒輪模型的第 0 齒朝局部 +X，嚙合相位由 gearTrainAngles() 決定（見 animator）。
// userData.gear / userData.arrow 的網格只在拆解模式顯示。
import * as THREE from 'three';
import { DRIVETRAIN, highSpeedShaftOffset, gearLayout, COORDS } from '../spec/turbineSpec.js';

/** 一圈齒形的點（逆時針）；rootR > tipR 時為內齒（齒尖朝內） */
export function toothOutline(teeth, rootR, tipR) {
  const pts = [];
  const pa = (Math.PI * 2) / teeth;
  for (let i = 0; i < teeth; i++) {
    const c = i * pa;
    for (const [f, r] of [[-0.5, rootR], [-0.27, rootR], [-0.13, tipR], [0.13, tipR], [0.27, rootR]]) {
      pts.push(new THREE.Vector2(Math.cos(c + f * pa) * r, Math.sin(c + f * pa) * r));
    }
  }
  return pts;
}

function circle(r, n) {
  return Array.from({ length: n }, (_, i) => new THREE.Vector2(Math.cos((i / n) * Math.PI * 2) * r, Math.sin((i / n) * Math.PI * 2) * r));
}

function extrude(shape, depth) {
  const g = new THREE.ExtrudeGeometry(shape, { depth, bevelEnabled: false, curveSegments: 4 });
  g.translate(0, 0, -depth / 2);
  g.computeVertexNormals();
  return g;
}

/** 外齒輪：模數 m、齒數 z、齒寬、軸孔半徑 */
export function externalGearGeometry(m, z, width, bore) {
  const r = (m * z) / 2;
  const shape = new THREE.Shape(toothOutline(z, r - 1.25 * m, r + m));
  shape.holes.push(new THREE.Path(circle(bore, 20).reverse()));
  return extrude(shape, width);
}

/** 內齒輪（環形齒輪）：外圈為圓，內圈為朝內的齒 */
export function internalGearGeometry(m, z, width, outerR) {
  const r = (m * z) / 2;
  const shape = new THREE.Shape(circle(outerR, 96));
  shape.holes.push(new THREE.Path(toothOutline(z, r + 1.25 * m, r - m).reverse()));
  return extrude(shape, width);
}

/** 轉向箭頭：從前方（上風）看，dir = -1 順時針、+1 逆時針 */
function arrowGeometry(radius) {
  const arc = new THREE.TorusGeometry(radius, radius * 0.07, 6, 36, Math.PI * 1.5);
  const head = new THREE.ConeGeometry(radius * 0.2, radius * 0.4, 12);
  head.rotateZ(-Math.PI / 2); // 指向 +X（逆時針在 1.5π 處的切線方向）
  head.translate(radius * 0.15, -radius, 0);
  return [arc, head];
}

export function buildGears({ nodes, mats, add }) {
  const { planetary: pl, parallel: par, shafts, planets } = gearLayout();
  const gear = (setup) => (m) => { m.userData.gear = true; if (setup) setup(m); };
  const opts = { roughness: 0.4, metalness: 0.35 };

  // ---------- 行星齒輪組 ----------
  const m = pl.module;
  const sunMat = mats.part('sunGear', 'gearSun', opts);
  add(nodes.sunShaft, externalGearGeometry(m, pl.sunTeeth, pl.faceWidth, 0.1), sunMat, 'sunGear',
    gear((g) => { g.position.z = pl.z; g.name = 'sunGearMesh'; }));
  // 太陽齒輪軸 A：連到第一級平行軸大齒輪
  add(nodes.sunShaft, new THREE.CylinderGeometry(0.11, 0.11, pl.z - par[0].z + 0.3, 16).rotateX(Math.PI / 2), sunMat, 'sunGear',
    gear((g) => { g.position.z = (pl.z + par[0].z) / 2; }));

  const planetGeo = externalGearGeometry(m, pl.planetTeeth, pl.faceWidth * 0.95, 0.06);
  const planetMat = mats.part('planetGear', 'gearPlanet', opts);
  planets.forEach((_, k) => add(nodes[`planet${k}`], planetGeo, planetMat, 'planetGear', gear((g) => { g.name = `planetMesh${k}`; })));

  const ringR = (m * pl.ringTeeth) / 2;
  add(nodes.drivetrain, internalGearGeometry(m, pl.ringTeeth, pl.faceWidth, ringR + 2.3 * m + 0.03), mats.part('ringGear', 'gearRing', opts), 'ringGear',
    gear((g) => { g.position.z = pl.z; g.name = 'ringGearMesh'; }));

  // 行星架：做成三支手臂（教學模型常見樣式，才看得到後面的行星）+ 連到主軸的轂 + 3 根行星銷
  const carrierMat = mats.part('carrier', 'gearCarrier', opts);
  const plateZ = pl.z + pl.faceWidth / 2 + 0.06;
  const a = gearLayout().planetRadius;
  add(nodes.lowSpeedShaft, new THREE.CylinderGeometry(0.17, 0.17, 0.07, 24).rotateX(Math.PI / 2), carrierMat, 'carrier',
    gear((g) => { g.position.z = plateZ; g.name = 'carrierHub'; }));
  const armGeo = new THREE.BoxGeometry(a - 0.12, 0.12, 0.06).translate(0.12 + (a - 0.12) / 2, 0, 0);
  planets.forEach((b, k) => add(nodes.lowSpeedShaft, armGeo, carrierMat, 'carrier', gear((g) => {
    g.position.z = plateZ;
    g.rotation.z = b;
    g.name = `carrierArm${k}`;
  })));
  add(nodes.lowSpeedShaft, new THREE.CylinderGeometry(0.14, 0.14, DRIVETRAIN.mainShaft.z0 - plateZ, 20).rotateX(Math.PI / 2), carrierMat, 'carrier',
    gear((g) => { g.position.z = (plateZ + DRIVETRAIN.mainShaft.z0) / 2; }));
  const pinGeo = new THREE.CylinderGeometry(0.05, 0.05, pl.faceWidth + 0.14, 10).rotateX(Math.PI / 2);
  planets.forEach((b) => add(nodes.lowSpeedShaft, pinGeo, carrierMat, 'carrier', gear((g) => {
    g.position.set(Math.cos(b) * 0.6, Math.sin(b) * 0.6, pl.z + 0.05);
  })));

  // ---------- 平行軸齒輪（兩級） ----------
  const parMat = mats.part('parallelGears', 'gearParallel', opts);
  const shaftNodes = [nodes.sunShaft, nodes.intermediateShaft, nodes.highSpeedShaft];
  par.forEach((st, i) => {
    add(shaftNodes[i], externalGearGeometry(st.module, st.driverTeeth, st.faceWidth, 0.1), parMat, 'parallelGears',
      gear((g) => { g.position.z = st.z; g.name = `stage${i + 1}Driver`; }));
    add(shaftNodes[i + 1], externalGearGeometry(st.module, st.drivenTeeth, st.faceWidth, 0.05), parMat, 'parallelGears',
      gear((g) => { g.position.z = st.z; g.name = `stage${i + 1}Driven`; }));
  });
  // 中間軸 B
  add(nodes.intermediateShaft, new THREE.CylinderGeometry(0.09, 0.09, par[0].z - par[1].z + 0.35, 14).rotateX(Math.PI / 2), parMat, 'parallelGears',
    gear((g) => { g.position.z = (par[0].z + par[1].z) / 2; }));
  // 高速軸 C 的前段（接到末級小齒輪）
  const hsR = DRIVETRAIN.highSpeedShaft.radius;
  add(nodes.highSpeedShaft, new THREE.CylinderGeometry(hsR, hsR, DRIVETRAIN.highSpeedShaft.z1 - par[1].z, 14).rotateX(Math.PI / 2),
    mats.part('highSpeedShaft', 'highSpeedShaft', { roughness: 0.35, metalness: 0.3 }), 'highSpeedShaft',
    gear((g) => { g.position.z = (DRIVETRAIN.highSpeedShaft.z1 + par[1].z) / 2; }));

  // ---------- 轉向箭頭（固定不轉，只表示方向） ----------
  const arrowMat = new THREE.MeshStandardMaterial({ color: mats.color('arrow'), roughness: 0.5, side: THREE.DoubleSide });
  const [hx, hy] = highSpeedShaftOffset();
  const spin = COORDS.rotorSpinSign; // 從上風看順時針為 -1
  const arrows = [
    { at: [0, 0, DRIVETRAIN.mainShaft.z0 + 0.25], r: 0.55, dir: spin, name: 'arrowCarrier' },
    { at: [...shafts[0], (pl.z + par[0].z) / 2], r: 0.3, dir: spin, name: 'arrowSun' },
    { at: [...shafts[1], (par[0].z + par[1].z) / 2], r: 0.24, dir: -spin, name: 'arrowIntermediate' },
    { at: [hx, hy, DRIVETRAIN.highSpeedShaft.z1 - 0.15], r: 0.2, dir: spin, name: 'arrowHigh' },
  ];
  for (const a of arrows) {
    const grp = new THREE.Group();
    grp.name = a.name;
    grp.position.fromArray(a.at);
    if (a.dir < 0) grp.scale.x = -1; // 鏡像：逆時針箭頭 → 順時針
    for (const geo of arrowGeometry(a.r)) {
      const mesh = new THREE.Mesh(geo, arrowMat);
      mesh.userData.arrow = true;
      grp.add(mesh);
    }
    nodes.drivetrain.add(grp);
  }
}
