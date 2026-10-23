// 場地：地面、天空、遠處小丘與樹（固定種子擺放）、箱型變壓器與輸電桿
import * as THREE from 'three';
import { DIM, PALETTE, RANDOM_SEED } from '../spec/turbineSpec.js';
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
    for (let i = 0; i < n; i++) {
      const a = rng.range(0, Math.PI * 2);
      const d = rng.range(420, 760);
      const r = rng.range(60, 140);
      m.compose(new THREE.Vector3(Math.cos(a) * d, 0, Math.sin(a) * d), new THREE.Quaternion(),
        new THREE.Vector3(r, rng.range(14, 38), r * rng.range(0.7, 1.2)));
      hills.setMatrixAt(i, m);
    }
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
      // 不擋住變壓器與輸電線走廊
      const along = (x * 0.85 + z * 0.52);
      const across = Math.abs(-x * 0.52 + z * 0.85);
      if (along > 0 && along < 120 && across < 18) continue;
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

  // ---------- 輸電桿與電線 ----------
  {
    const s = DIM.site;
    const poleMat = mats.part('powerLine', 'pole', { roughness: 0.8 });
    const wireMat = mats.part('powerLine', 'wire', { roughness: 0.7 });
    const poleGeo = new THREE.CylinderGeometry(0.18, 0.25, s.poleHeight, 8);
    const armGeo = new THREE.BoxGeometry(3.2, 0.18, 0.18);
    const g = new THREE.Group();
    g.name = 'powerLine';
    const tops = [];
    // 線路方向與垂直方向（橫擔沿垂直方向）
    const first = s.poles[0], last = s.poles[s.poles.length - 1];
    const line = new THREE.Vector3(last[0] - first[0], 0, last[2] - first[2]).normalize();
    const perp = new THREE.Vector3(-line.z, 0, line.x);
    const armYaw = Math.atan2(-perp.z, perp.x); // 使局部 +X 對齊 perp
    for (const p of s.poles) {
      const pole = new THREE.Mesh(poleGeo, poleMat);
      pole.position.set(p[0], s.poleHeight / 2, p[2]);
      const arm = new THREE.Mesh(armGeo, poleMat);
      arm.position.set(p[0], s.poleHeight - 0.6, p[2]);
      arm.rotation.y = armYaw;
      for (const m of [pole, arm]) { m.userData.partId = 'powerLine'; g.add(m); }
      tops.push([-1.3, 0, 1.3].map((o) => new THREE.Vector3(p[0], s.poleHeight - 0.45, p[2]).addScaledVector(perp, o)));
    }
    // 變壓器 → 第一根桿：地下電纜（不畫）；桿與桿之間：下垂電線
    for (let i = 0; i < tops.length - 1; i++) {
      for (let k = 0; k < 3; k++) {
        const a = tops[i][k], b = tops[i + 1][k];
        const mid = a.clone().lerp(b, 0.5);
        mid.y -= a.distanceTo(b) * 0.04;
        const curve = new THREE.QuadraticBezierCurve3(a, mid, b);
        const w = new THREE.Mesh(new THREE.TubeGeometry(curve, 16, 0.05, 4, false), wireMat);
        w.userData.partId = 'powerLine';
        g.add(w);
      }
    }
    site.add(g);
  }

  return site;
}
