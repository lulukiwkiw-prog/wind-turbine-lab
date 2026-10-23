// 內部機械與電力路徑（第二階段）
//
// 掛載節點：
//   drivetrain     主軸承、齒輪箱外殼、煞車鉗、發電機定子（不轉）
//   lowSpeedShaft  主軸（與葉輪同角度轉）
//   highSpeedShaft 高速軸、聯軸器、煞車盤、發電機轉子（依速比轉，畫面放慢）
//   nacelle        機座、支架、控制器、偏航馬達、機艙內電纜
//   rotor／blade*  輪轂本體、變槳軸承、變槳馬達
//   tower／world   偏航齒環、塔內電纜、地下電纜、電桿引線
//
// userData.internal = true 的網格只在剖視模式顯示；
// userData.shell = 'see' 的網格在剖視時變透明（塔架、輪轂本體）。
import * as THREE from 'three';
import {
  DIM, DRIVETRAIN, INTERNALS, CABLE_ROUTE, GEARBOX_CONFIGS, ACTIVE_GEARBOX,
  highSpeedShaftOffset, drivetrainToNacelle,
} from '../spec/turbineSpec.js';

const DEG = Math.PI / 180;

/** 沿局部 Z 軸的圓柱（z0 → z1） */
function zCylinder(r0, r1, z0, z1, seg = 32, opts = {}) {
  const g = new THREE.CylinderGeometry(r1, r0, Math.abs(z1 - z0), seg, 1, opts.open ?? false, opts.thetaStart, opts.thetaLength);
  g.rotateX(Math.PI / 2); // 原本 +Y → +Z；radiusTop 對應 z1 端
  g.translate(0, 0, (z0 + z1) / 2);
  return g;
}

/** 由折線建立管狀電纜 */
function cableGeometry(points, radius) {
  const path = new THREE.CurvePath();
  for (let i = 0; i < points.length - 1; i++) {
    path.add(new THREE.LineCurve3(new THREE.Vector3(...points[i]), new THREE.Vector3(...points[i + 1])));
  }
  return new THREE.TubeGeometry(path, (points.length - 1) * 6, radius, 8, false);
}

export function buildInternals({ nodes, mats, add }) {
  const internal = (setup) => (m) => { m.userData.internal = true; if (setup) setup(m); };
  const d = DRIVETRAIN;
  const [hx, hy] = highSpeedShaftOffset();

  // 機艙局部的垂直支架：從機座頂面到傳動框架的某一點
  const bedTop = DIM.nacelle.bedplate.max[1];
  const supportTo = (dtPoint, width, depth, partId, colorKey) => {
    const [x, y, z] = drivetrainToNacelle(dtPoint);
    const h = y - bedTop;
    add(nodes.nacelle, new THREE.BoxGeometry(width, h, depth), mats.part(partId, colorKey, { roughness: 0.7 }), partId,
      internal((m) => { m.position.set(x, bedTop + h / 2, z); }));
  };

  // ---------- 機座（機艙底部的鋼構，從外面也看得到） ----------
  {
    const b = DIM.nacelle.bedplate;
    const size = b.max.map((v, i) => v - b.min[i]);
    // 剖視時變透明，才看得到下面的偏航齒環
    add(nodes.nacelle, new THREE.BoxGeometry(...size), mats.part('nacelle', 'bedplate', { roughness: 0.7, shell: true }), 'nacelle',
      (m) => { m.position.set(...b.max.map((v, i) => (v + b.min[i]) / 2)); m.name = 'bedplate'; m.userData.shell = 'see'; });
  }

  // ---------- 主軸（低速軸） ----------
  {
    const mat = mats.part('mainShaft', 'mainShaft', { roughness: 0.35, metalness: 0.3 });
    add(nodes.lowSpeedShaft, zCylinder(d.mainShaft.radius, d.mainShaft.radius * 0.85, d.mainShaft.z0, d.mainShaft.z1), mat, 'mainShaft',
      internal((m) => { m.name = 'mainShaftBody'; }));
    add(nodes.lowSpeedShaft, zCylinder(d.shaftFlange.radius, d.shaftFlange.radius, d.shaftFlange.z0, d.shaftFlange.z1), mat, 'mainShaft', internal());
    // 白色條紋：看得出軸在轉
    add(nodes.lowSpeedShaft, new THREE.BoxGeometry(0.1, 0.06, d.mainShaft.z1 - d.mainShaft.z0 - 0.2),
      mats.part('mainShaft', 'tower', { roughness: 0.5 }), 'mainShaft',
      internal((m) => { m.position.set(0, d.mainShaft.radius * 0.93, (d.mainShaft.z0 + d.mainShaft.z1) / 2); }));
  }

  // ---------- 主軸承（兩組）與軸承座 ----------
  {
    const mat = mats.part('mainBearing', 'bearing', { roughness: 0.5, metalness: 0.3 });
    for (const b of d.mainBearings) {
      add(nodes.drivetrain, zCylinder(b.outerRadius, b.outerRadius, b.z - 0.25, b.z + 0.25), mat, 'mainBearing', internal());
      supportTo([0, -b.outerRadius * 0.7, b.z], 1.5, 0.45, 'mainBearing', 'bearing');
    }
  }

  // ---------- 齒輪箱外殼（第三階段打開看齒輪） ----------
  {
    const stages = GEARBOX_CONFIGS[ACTIVE_GEARBOX].stages;
    const ring = stages[0];
    const R = (ring.module * ring.ringTeeth) / 2 + 0.12;
    const mat = mats.part('gearbox', 'gearbox', { roughness: 0.55, metalness: 0.15 });
    add(nodes.drivetrain, zCylinder(R, R, -0.35, 0.35, 40), mat, 'gearbox', internal((m) => { m.name = 'gearboxPlanetary'; }));
    add(nodes.drivetrain, zCylinder(R, d.mainShaft.radius + 0.12, 0.35, d.gearbox.z1, 40), mat, 'gearbox', internal());
    const x0 = -0.55, x1 = hx + 0.45, y0 = -0.7, y1 = hy + 0.45, z0 = d.gearbox.z0, z1 = -0.35;
    add(nodes.drivetrain, new THREE.BoxGeometry(x1 - x0, y1 - y0, z1 - z0), mat, 'gearbox',
      internal((m) => { m.position.set((x0 + x1) / 2, (y0 + y1) / 2, (z0 + z1) / 2); m.name = 'gearboxParallel'; }));
    for (const sx of [-1, 1]) supportTo([sx * 0.8, -0.6, 0], 0.35, 0.5, 'gearbox', 'gearbox');
  }

  // ---------- 高速軸、聯軸器 ----------
  {
    const mat = mats.part('highSpeedShaft', 'highSpeedShaft', { roughness: 0.35, metalness: 0.3 });
    const hs = d.highSpeedShaft;
    add(nodes.highSpeedShaft, zCylinder(hs.radius, hs.radius, d.generator.z1 - 0.1, hs.z1), mat, 'highSpeedShaft',
      internal((m) => { m.name = 'highSpeedShaftBody'; }));
    add(nodes.highSpeedShaft, zCylinder(d.coupling.radius, d.coupling.radius, d.coupling.z - 0.15, d.coupling.z + 0.15, 16), mat, 'highSpeedShaft', internal());
    add(nodes.highSpeedShaft, new THREE.BoxGeometry(0.06, 0.05, 0.28), mats.part('highSpeedShaft', 'tower'), 'highSpeedShaft',
      internal((m) => { m.position.set(0, d.coupling.radius, d.coupling.z); }));
  }

  // ---------- 煞車：煞車盤（隨高速軸轉）＋煞車鉗（固定） ----------
  {
    const mat = mats.part('brake', 'brake', { roughness: 0.4, metalness: 0.3 });
    add(nodes.highSpeedShaft, zCylinder(d.brake.discRadius, d.brake.discRadius, d.brake.z - 0.03, d.brake.z + 0.03, 32), mat, 'brake',
      internal((m) => { m.name = 'brakeDisc'; }));
    add(nodes.highSpeedShaft, new THREE.BoxGeometry(0.05, d.brake.discRadius * 0.7, 0.08), mats.part('brake', 'tower'), 'brake',
      internal((m) => { m.position.set(0, d.brake.discRadius * 0.55, d.brake.z); }));
    const c = d.brakeCaliper.size;
    add(nodes.drivetrain, new THREE.BoxGeometry(...c), mat, 'brake',
      internal((m) => { m.position.set(hx, hy + d.brake.discRadius - c[1] / 2 + 0.04, d.brake.z); }));
  }

  // ---------- 發電機：定子（固定，切開一角）＋轉子（隨高速軸轉） ----------
  {
    const g = d.generator;
    const statorMat = mats.part('generator', 'generatorStator', { roughness: 0.5, side: THREE.DoubleSide });
    // 缺口朝上（+Y），從上方可以看到裡面的轉子
    add(nodes.drivetrain, zCylinder(g.radius, g.radius, g.z0, g.z1, 40, { thetaStart: 1.25 * Math.PI, thetaLength: 1.5 * Math.PI }),
      statorMat, 'generator', internal((m) => { m.position.set(hx, hy, 0); m.name = 'generatorStator'; }));
    // 定子兩端的端蓋環
    for (const z of [g.z0, g.z1]) {
      add(nodes.drivetrain, new THREE.TorusGeometry(g.radius - 0.03, 0.05, 6, 40), statorMat, 'generator',
        internal((m) => { m.position.set(hx, hy, z); }));
    }
    const rotorMat = mats.part('generator', 'generatorRotor', { roughness: 0.4, metalness: 0.2 });
    const rr = d.generatorRotorRadius;
    add(nodes.highSpeedShaft, zCylinder(rr, rr, g.z0 + 0.2, g.z1 - 0.2, 32), rotorMat, 'generator', internal((m) => { m.name = 'generatorRotor'; }));
    const barGeo = new THREE.BoxGeometry(0.1, 0.06, g.z1 - g.z0 - 0.5);
    const barMat = mats.part('generator', 'generatorStator', { roughness: 0.4 });
    for (let i = 0; i < 6; i++) {
      const a = (i / 6) * Math.PI * 2;
      add(nodes.highSpeedShaft, barGeo, barMat, 'generator', internal((m) => {
        m.position.set(Math.cos(a) * rr, Math.sin(a) * rr, (g.z0 + g.z1) / 2);
        m.rotation.z = a + Math.PI / 2;
      }));
    }
    for (const z of [g.z0 + 0.4, g.z1 - 0.4]) supportTo([hx, hy - g.radius * 0.8, z], 0.9, 0.35, 'generator', 'generatorStator');
  }

  // ---------- 控制器 ----------
  {
    const c = d.controller;
    add(nodes.nacelle, new THREE.BoxGeometry(...c.size), mats.part('controller', 'controller', { roughness: 0.6 }), 'controller',
      internal((m) => { m.position.fromArray(c.at); m.name = 'controllerBox'; }));
    add(nodes.nacelle, new THREE.BoxGeometry(0.02, 0.3, 0.3), mats.part('controller', 'sensor', { roughness: 0.4 }), 'controller',
      internal((m) => { m.position.set(c.at[0] - c.size[0] / 2 - 0.01, c.at[1] + 0.25, c.at[2]); }));
  }

  // ---------- 輪轂本體（剖視時半透明）＋ 變槳系統 ----------
  {
    const p = INTERNALS.pitch;
    add(nodes.rotor, new THREE.SphereGeometry(INTERNALS.hubBodyRadius, 32, 20), mats.part('hub', 'hubBody', { roughness: 0.6, shell: true }), 'hub',
      internal((m) => { m.name = 'hubBody'; m.userData.shell = 'see'; }));
    const bearingGeo = new THREE.TorusGeometry(p.bearingRadius, p.bearingTube, 10, 40).rotateX(Math.PI / 2);
    const motorGeo = new THREE.CylinderGeometry(p.motorRadius, p.motorRadius, p.motorLength, 16);
    const pinionGeo = new THREE.CylinderGeometry(0.08, 0.08, 0.12, 12);
    const mat = mats.part('pitchSystem', 'pitch', { roughness: 0.45, metalness: 0.2 });
    for (let i = 0; i < DIM.rotor.bladeCount; i++) {
      const blade = nodes[`blade${i}`];
      add(blade, bearingGeo, mat, 'pitchSystem', internal((m) => { m.position.y = DIM.blade.rootR; }));
      add(blade, motorGeo, mat, 'pitchSystem', internal((m) => { m.position.fromArray(p.motorOffset); }));
      add(blade, pinionGeo, mat, 'pitchSystem', internal((m) => {
        m.position.set(p.motorOffset[0], p.motorOffset[1] + p.motorLength / 2 + 0.06, p.motorOffset[2]);
      }));
    }
  }

  // ---------- 偏航系統：塔頂齒環（固定）＋ 偏航馬達（隨機艙轉） ----------
  {
    const y = INTERNALS.yaw;
    const mat = mats.part('yawSystem', 'yaw', { roughness: 0.45, metalness: 0.2 });
    const ringProfile = [
      new THREE.Vector2(y.ringInnerRadius, y.ringY[0]), new THREE.Vector2(y.ringOuterRadius, y.ringY[0]),
      new THREE.Vector2(y.ringOuterRadius, y.ringY[1]), new THREE.Vector2(y.ringInnerRadius, y.ringY[1]),
      new THREE.Vector2(y.ringInnerRadius, y.ringY[0]),
    ];
    add(nodes.tower, new THREE.LatheGeometry(ringProfile, 48), mat, 'yawSystem',
      internal((m) => { m.position.y = DIM.tower.topY; m.name = 'yawRing'; }));
    // 內齒（InstancedMesh：一次繪製）
    const teeth = 60;
    const toothH = y.ringY[1] - y.ringY[0];
    const tooth = new THREE.InstancedMesh(new THREE.BoxGeometry(0.06, toothH, 0.05), mat, teeth);
    const mtx = new THREE.Matrix4();
    for (let i = 0; i < teeth; i++) {
      const a = (i / teeth) * Math.PI * 2;
      mtx.makeRotationY(-a).setPosition(Math.cos(a) * (y.ringInnerRadius - 0.025), DIM.tower.topY + (y.ringY[0] + y.ringY[1]) / 2, Math.sin(a) * (y.ringInnerRadius - 0.025));
      tooth.setMatrixAt(i, mtx);
    }
    tooth.userData.partId = 'yawSystem';
    tooth.userData.internal = true;
    nodes.tower.add(tooth);

    const motorGeo = new THREE.CylinderGeometry(y.motorRadius, y.motorRadius, y.motorHeight, 16);
    const shaftGeo = new THREE.CylinderGeometry(0.05, 0.05, bedTop - y.ringY[0], 8);
    const pinionGeo = new THREE.CylinderGeometry(y.pinionRadius, y.pinionRadius, toothH, 12);
    for (let i = 0; i < y.driveCount; i++) {
      const a = (y.driveAngleOffsetDeg + (i * 360) / y.driveCount) * DEG;
      const x = Math.cos(a) * y.driveRadius, z = Math.sin(a) * y.driveRadius;
      add(nodes.nacelle, motorGeo, mat, 'yawSystem', internal((m) => { m.position.set(x, bedTop + y.motorHeight / 2, z); m.name = `yawMotor${i}`; }));
      add(nodes.nacelle, shaftGeo, mat, 'yawSystem', internal((m) => { m.position.set(x, (bedTop + y.ringY[0]) / 2, z); }));
      add(nodes.nacelle, pinionGeo, mat, 'yawSystem', internal((m) => { m.position.set(x, (y.ringY[0] + y.ringY[1]) / 2, z); }));
    }
  }

  // ---------- 電力電纜：機艙內 → 塔架內 ----------
  {
    const mat = mats.part('powerCable', 'cable', { roughness: 0.5 });
    add(nodes.nacelle, cableGeometry(CABLE_ROUTE.nacelle, INTERNALS.cableRadius), mat, 'powerCable', internal((m) => { m.name = 'cableNacelle'; }));
    add(nodes.tower, cableGeometry(CABLE_ROUTE.tower, INTERNALS.cableRadius * 1.3), mat, 'powerCable', internal((m) => { m.name = 'cableTower'; }));
  }

  // ---------- 地下電纜（地面上的淡色埋線路徑，一直看得到）＋ 電桿引線 ----------
  {
    const soil = mats.part('undergroundCable', 'soil', { roughness: 0.95 });
    const line = mats.part('undergroundCable', 'cable', { roughness: 0.6 });
    const pts = CABLE_ROUTE.underground;
    for (let i = 0; i < pts.length - 1; i++) {
      const a = new THREE.Vector3(...pts[i]), b = new THREE.Vector3(...pts[i + 1]);
      const len = a.distanceTo(b);
      const mid = a.clone().lerp(b, 0.5);
      const yaw = Math.atan2(b.x - a.x, b.z - a.z);
      add(nodes.world, new THREE.BoxGeometry(1.4, 0.04, len + 1.4), soil, 'undergroundCable',
        (m) => { m.position.set(mid.x, 0.02, mid.z); m.rotation.y = yaw; m.name = `undergroundStrip${i}`; });
      // 虛線：表示電纜在地下
      const dashes = Math.max(2, Math.floor(len / 1.2));
      const dashGeo = new THREE.BoxGeometry(0.28, 0.05, (len / dashes) * 0.55);
      for (let k = 0; k < dashes; k++) {
        const p = a.clone().lerp(b, (k + 0.5) / dashes);
        add(nodes.world, dashGeo, line, 'undergroundCable', (m) => { m.position.set(p.x, 0.035, p.z); m.rotation.y = yaw; });
      }
    }
    const off = CABLE_ROUTE.riserOffset;
    const riser = CABLE_ROUTE.riser.map((p) => [p[0] + off[0], p[1] + off[1], p[2] + off[2]]);
    add(nodes.world, cableGeometry(riser, 0.09), line, 'undergroundCable', (m) => { m.name = 'cableRiser'; });
  }
}
