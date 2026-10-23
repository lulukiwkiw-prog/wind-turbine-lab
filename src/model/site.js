// 場地：地面、天空、遠處小丘與樹（固定種子擺放）、箱型變壓器與輸電桿
import * as THREE from 'three';
import { DIM, PALETTE, RANDOM_SEED, lineAxes, substationLayout } from '../spec/turbineSpec.js';
import { createRng } from '../spec/rng.js';

export function buildSite(mats) {
  const site = new THREE.Group();
  site.name = 'site';

  // 天空球（頂部→地平線漸層）
  {
    const geo = new THREE.SphereGeometry(DIM.site.groundRadius * 1.6, 24, 12);
    const top = new THREE.Color(PALETTE.skyTop);
    const bottom = new THREE.Color(PALETTE.skyBottom);
    const colors = [];
    const p = geo.attributes.position;
    const c = new THREE.Color();
    for (let i = 0; i < p.count; i++) {
      const t = Math.max(0, p.getY(i) / (DIM.site.groundRadius * 1.6));
      c.copy(bottom).lerp(top, Math.pow(t, 0.6));
      colors.push(c.r, c.g, c.b);
    }
    geo.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
    const sky = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ vertexColors: true, side: THREE.BackSide, fog: false, depthWrite: false }));
    sky.name = 'sky';
    sky.renderOrder = -1;
    site.add(sky);
  }

  // 地面
  {
    const g = new THREE.CircleGeometry(DIM.site.groundRadius, 64).rotateX(-Math.PI / 2);
    const ground = new THREE.Mesh(g, mats.scenery('ground'));
    ground.name = 'ground';
    site.add(ground);
  }

  const rng = createRng(RANDOM_SEED);

  // 遠處小丘（共用一個幾何的 InstancedMesh）
  {
    const n = 14;
    const hills = new THREE.InstancedMesh(new THREE.SphereGeometry(1, 20, 10, 0, Math.PI * 2, 0, Math.PI / 2), mats.scenery('hill'), n);
    const m = new THREE.Matrix4();
    const { along: la, across: lc } = lineAxes();
    let placed = 0;
    for (let guard = 0; placed < n && guard < 500; guard++) {
      const a = rng.range(0, Math.PI * 2);
      const d = rng.range(420, 760);
      const r = rng.range(60, 140);
      const x = Math.cos(a) * d, z = Math.sin(a) * d;
      // 不要把高壓鐵塔埋進山丘裡
      if (x * la[0] + z * la[2] > 0 && Math.abs(x * lc[0] + z * lc[2]) < r * 1.2 + 25) continue;
      m.compose(new THREE.Vector3(x, 0, z), new THREE.Quaternion(), new THREE.Vector3(r, rng.range(14, 38), r * rng.range(0.7, 1.2)));
      hills.setMatrixAt(placed++, m);
    }
    hills.count = placed;
    hills.name = 'hills';
    site.add(hills);
  }

  // 樹（樹冠 + 樹幹，兩個 InstancedMesh）
  {
    const n = 70;
    const crowns = new THREE.InstancedMesh(new THREE.ConeGeometry(1, 1, 8), mats.scenery('tree'), n);
    const trunks = new THREE.InstancedMesh(new THREE.CylinderGeometry(0.12, 0.16, 1, 6), mats.scenery('trunk'), n);
    const m = new THREE.Matrix4();
    const q = new THREE.Quaternion();
    let placed = 0;
    let guard = 0;
    while (placed < n && guard++ < 2000) {
      const a = rng.range(0, Math.PI * 2);
      const d = rng.range(40, 330);
      const x = Math.cos(a) * d, z = Math.sin(a) * d;
      // 不擋住變壓器、輸電線、變電所與高壓線走廊
      const { along: la, across: lc } = lineAxes();
      const along = x * la[0] + z * la[2];
      const across = Math.abs(x * lc[0] + z * lc[2]);
      if (along > -5 && along < 520 && across < 22) continue;
      const h = rng.range(5, 10);
      const w = h * rng.range(0.28, 0.4);
      m.compose(new THREE.Vector3(x, h * 0.25 + h * 0.375, z), q, new THREE.Vector3(w, h * 0.75, w));
      crowns.setMatrixAt(placed, m);
      m.compose(new THREE.Vector3(x, h * 0.15, z), q, new THREE.Vector3(1, h * 0.3, 1));
      trunks.setMatrixAt(placed, m);
      placed++;
    }
    crowns.count = trunks.count = placed;
    crowns.name = 'trees';
    site.add(crowns, trunks);
  }

  // ---------- 箱型變壓器 ----------
  {
    const t = DIM.site.transformer;
    const g = new THREE.Group();
    g.name = 'transformer';
    g.position.fromArray(t.at);
    g.rotation.y = Math.atan2(t.at[0], t.at[2]);
    const mat = mats.part('transformer', 'transformer', { roughness: 0.6 });
    const box = new THREE.Mesh(new THREE.BoxGeometry(...t.size), mat);
    box.position.y = t.size[1] / 2;
    box.userData.partId = 'transformer';
    g.add(box);
    const finGeo = new THREE.BoxGeometry(0.06, t.size[1] * 0.7, t.size[2] * 0.8);
    for (let i = 0; i < 6; i++) {
      const fin = new THREE.Mesh(finGeo, mat);
      fin.position.set(t.size[0] / 2 + 0.05, t.size[1] * 0.45, 0);
      fin.position.z = -t.size[2] * 0.3 + (i / 5) * t.size[2] * 0.6;
      fin.scale.z = 0.12;
      fin.userData.partId = 'transformer';
      g.add(fin);
    }
    site.add(g);
  }

  // ---------- 輸電桿、變電所、高壓鐵塔與電線 ----------
  {
    const s = DIM.site;
    const sub = s.substation;
    const lay = substationLayout();
    const { along, across } = lineAxes();
    const perp = new THREE.Vector3(...across);
    const yawAcross = Math.atan2(-perp.z, perp.x); // 讓局部 +X 對齊「垂直線路」方向
    const yawAlong = yawAcross + Math.PI / 2; // 讓局部 +X 對齊「沿線路」方向
    const poleMat = mats.part('powerLine', 'pole', { roughness: 0.8 });
    const wireMat = mats.part('powerLine', 'wire', { roughness: 0.7 });
    const pylonMat = mats.part('powerLine', 'pylon', { roughness: 0.6, metalness: 0.3 });
    const subMat = mats.part('substation', 'substation', { roughness: 0.6 });
    const fenceMat = mats.part('substation', 'fence', { roughness: 0.7 });
    const trMat = mats.part('substation', 'transformer', { roughness: 0.6 });
    const g = new THREE.Group();
    g.name = 'powerLine';
    const put = (mesh, partId, setup) => { mesh.userData.partId = partId; if (setup) setup(mesh); g.add(mesh); return mesh; };
    const P = (base, a = 0, c = 0, y = 0) => new THREE.Vector3(base[0], y, base[2]).addScaledVector(new THREE.Vector3(...along), a).addScaledVector(perp, c);
    // 三相三條線：兩端各 3 個掛點，畫成稍微下垂的電線
    const span = (from, to, sag, radius, partId = 'powerLine') => {
      for (let k = 0; k < 3; k++) {
        const a = from[k], b = to[k];
        const mid = a.clone().lerp(b, 0.5);
        mid.y -= a.distanceTo(b) * sag;
        put(new THREE.Mesh(new THREE.TubeGeometry(new THREE.QuadraticBezierCurve3(a, mid, b), 20, radius, 4, false), wireMat), partId);
      }
    };

    // 配電電桿（22 kV 級示意）
    const poleGeo = new THREE.CylinderGeometry(0.18, 0.25, s.poleHeight, 8);
    const armGeo = new THREE.BoxGeometry(3.2, 0.18, 0.18);
    const tops = s.poles.map((p) => {
      put(new THREE.Mesh(poleGeo, poleMat), 'powerLine', (m) => m.position.set(p[0], s.poleHeight / 2, p[2]));
      put(new THREE.Mesh(armGeo, poleMat), 'powerLine', (m) => { m.position.set(p[0], s.poleHeight - 0.6, p[2]); m.rotation.y = yawAcross; });
      return [-1, 0, 1].map((o) => P(p, 0, o * sub.wireSpacing, s.poleHeight - 0.45));
    });
    for (let i = 0; i < tops.length - 1; i++) span(tops[i], tops[i + 1], 0.04, 0.05);

    // 變電所：碎石地坪、圍籬（留一個門）、進線與出線門型架、主變壓器、控制室
    put(new THREE.Mesh(new THREE.BoxGeometry(sub.along, 0.12, sub.across), subMat), 'substation',
      (m) => { m.position.set(lay.center[0], 0.06, lay.center[2]); m.rotation.y = yawAlong; m.name = 'substationPad'; });
    const fenceSide = (len, a, c, rotAlong) => put(new THREE.Mesh(new THREE.BoxGeometry(len, sub.fenceHeight, 0.08), fenceMat), 'substation',
      (m) => { m.position.copy(P(lay.center, a, c, sub.fenceHeight / 2)); m.rotation.y = rotAlong ? yawAlong : yawAcross; });
    fenceSide(sub.along, 0, sub.across / 2, true);
    fenceSide(sub.along, 0, -sub.across / 2, true);
    fenceSide(sub.across, sub.along / 2, 0, false);
    fenceSide(sub.across / 2 - 2, -sub.along / 2, sub.across / 4 + 1, false); // 門的兩側
    fenceSide(sub.across / 2 - 2, -sub.along / 2, -sub.across / 4 - 1, false);
    const gantry = (base, width, h) => {
      for (const c of [-width / 2, width / 2]) {
        put(new THREE.Mesh(new THREE.CylinderGeometry(0.2, 0.25, h, 8), subMat), 'substation', (m) => m.position.copy(P(base, 0, c, h / 2)));
      }
      put(new THREE.Mesh(new THREE.BoxGeometry(width + 0.6, 0.35, 0.35), subMat), 'substation', (m) => { m.position.copy(P(base, 0, 0, h)); m.rotation.y = yawAcross; });
    };
    gantry(lay.gantryIn, 4.4, sub.gantryHeight);
    gantry(lay.gantryOut, 8.6, sub.gantryHeight + 3);
    for (const a of [-2.2, 2.2]) { // 兩台主變壓器（升到更高的電壓）
      put(new THREE.Mesh(new THREE.BoxGeometry(3.2, 3.0, 2.4), trMat), 'substation', (m) => { m.position.copy(P(lay.center, a, -2.5, 1.6)); m.rotation.y = yawAlong; });
      put(new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.12, 1.4, 8), fenceMat), 'substation', (m) => m.position.copy(P(lay.center, a, -2.5, 3.8)));
    }
    put(new THREE.Mesh(new THREE.BoxGeometry(4, 3, 3.4), fenceMat), 'substation', (m) => { m.position.copy(P(lay.center, 0, 4, 1.5)); m.rotation.y = yawAlong; m.name = 'substationHouse'; });
    // 最後一根電桿 → 進線門型架
    const gIn = [-1, 0, 1].map((o) => P(lay.gantryIn, 0, o * sub.wireSpacing, sub.gantryHeight - 0.2));
    span(tops[tops.length - 1], gIn, 0.03, 0.05);

    // 高壓輸電鐵塔：一路延伸到遠方（送往城市）
    const hv = s.hvLine;
    const towerGeo = new THREE.CylinderGeometry(0.5, 2.4, hv.towerHeight, 4, 1).rotateY(Math.PI / 4);
    const hvArmGeo = new THREE.BoxGeometry(hv.armSpan * 2 + 1, 0.4, 0.4);
    const hvPoints = (base) => [P(base, 0, -hv.armSpan, hv.towerHeight - 2.3), P(base, 0, 0, hv.towerHeight + 0.3), P(base, 0, hv.armSpan, hv.towerHeight - 2.3)];
    let prev = [P(lay.gantryOut, 0, -3, sub.gantryHeight + 2.8), P(lay.gantryOut, 0, 0, sub.gantryHeight + 3.2), P(lay.gantryOut, 0, 3, sub.gantryHeight + 2.8)];
    lay.towers.forEach((t, i) => {
      put(new THREE.Mesh(towerGeo, pylonMat), 'powerLine', (m) => { m.position.set(t[0], hv.towerHeight / 2, t[2]); m.rotation.y = yawAlong; m.name = `hvTower${i}`; });
      put(new THREE.Mesh(hvArmGeo, pylonMat), 'powerLine', (m) => { m.position.copy(P(t, 0, 0, hv.towerHeight - 2)); m.rotation.y = yawAcross; });
      const pts = hvPoints(t);
      span(prev, pts, 0.03, 0.08);
      prev = pts;
    });
    site.add(g);
  }

  return site;
}
