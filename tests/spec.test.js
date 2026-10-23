// turbineSpec.js 一致性測試（純資料，不需 three.js）
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  COORDS, DIM, DRIVETRAIN, HIERARCHY, PARTS, CONNECTIONS, PALETTE, SIM, VIEW,
  GEARBOX_CONFIGS, ACTIVE_GEARBOX, stageRatio, centerDistance, gearboxRatio, highSpeedShaftOffset,
  rotorCenterLocal, rotorAxisLocal, hubHeight, upwindVector, yawForWind, bladeSectionAt, MODES, DIFFICULTIES,
  CABLE_ROUTE, INTERNALS, gearboxDirection, gearLayout, gearTrainAngles, EXPLODE, CURRENT_STAGE,
  windName, lineAxes, substationLayout,
} from '../src/spec/turbineSpec.js';
import { PARTS_TEXT, partText } from '../src/learning/partsData.js';

const DEG = Math.PI / 180;
const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const len = (a) => Math.hypot(...a);
const close = (a, b, eps = 1e-9) => Math.abs(a - b) < eps;

test('父子關係：每個節點的父節點都存在，且沒有循環', () => {
  const ids = new Set(HIERARCHY.map((n) => n.id));
  assert.equal(ids.size, HIERARCHY.length, '節點 id 重複');
  for (const n of HIERARCHY) {
    if (n.parent === null) { assert.equal(n.id, 'world'); continue; }
    assert.ok(ids.has(n.parent), `${n.id} 的父節點 ${n.parent} 不存在`);
    // 往上追溯必須到達 world
    let cur = n, steps = 0;
    while (cur.parent && steps++ < 50) cur = HIERARCHY.find((m) => m.id === cur.parent);
    assert.equal(cur.id, 'world', `${n.id} 無法追溯到 world`);
  }
});

test('父子關係：偏航 → 機艙 → 傳動 → 葉輪 → 葉片 → 槳距', () => {
  const parentOf = Object.fromEntries(HIERARCHY.map((n) => [n.id, n.parent]));
  assert.equal(parentOf.yaw, 'world');
  assert.equal(parentOf.nacelle, 'yaw');
  assert.equal(parentOf.drivetrain, 'nacelle');
  assert.equal(parentOf.rotor, 'drivetrain');
  for (let i = 0; i < DIM.rotor.bladeCount; i++) {
    assert.equal(parentOf[`blade${i}`], 'rotor');
    assert.equal(parentOf[`pitch${i}`], `blade${i}`);
  }
});

test('轉軸：偏航繞 +Y、葉輪繞局部 +Z、槳距繞葉片局部 +Y，皆為單位向量', () => {
  const byId = Object.fromEntries(HIERARCHY.map((n) => [n.id, n]));
  assert.deepEqual(byId.yaw.rotates.axis, [0, 1, 0]);
  assert.deepEqual(byId.rotor.rotates.axis, [0, 0, 1]);
  for (let i = 0; i < DIM.rotor.bladeCount; i++) assert.deepEqual(byId[`pitch${i}`].rotates.axis, [0, 1, 0]);
  assert.ok(close(len(rotorAxisLocal()), 1));
});

test('葉輪軸指向上風（機艙局部 +Z）並往上傾斜 tilt 角', () => {
  const a = rotorAxisLocal();
  assert.ok(a[2] > 0.99);
  assert.ok(close(Math.asin(a[1]) / DEG, DIM.drivetrain.tiltDeg, 1e-6));
  // HIERARCHY 中 drivetrain 繞 X 轉 -tilt：把 (0,0,1) 轉到 (0, sin t, cos t)
  const rx = HIERARCHY.find((n) => n.id === 'drivetrain').rotation[0] * DEG;
  const z = [0, -Math.sin(rx), Math.cos(rx)];
  assert.ok(close(z[1], a[1], 1e-9) && close(z[2], a[2], 1e-9));
});

test('葉輪轉向：從上風處看為順時針', () => {
  // 從上風（+Z）看向 -Z，畫面右方 = +X。朝上的葉片若往 +X 移動 = 順時針。
  const omega = [0, 0, COORDS.rotorSpinSign];
  const v = cross(omega, [0, 1, 0]);
  assert.ok(v[0] > 0, '朝上的葉片應往 +X（從上風看的右方）移動');
});

test('槳距：角度增加時前緣轉向上風；90° 時弦線與葉輪軸平行（順槳）', () => {
  const rotY = (p, a) => [p[0] * Math.cos(a) + p[2] * Math.sin(a), p[1], -p[0] * Math.sin(a) + p[2] * Math.cos(a)];
  const le0 = [1, 0, 0]; // 槳距 0° 時前緣方向
  const le10 = rotY(le0, COORDS.pitchSign * 10 * DEG);
  assert.ok(le10[2] > 0, '槳距增加，前緣應轉往 +Z（上風）');
  const le90 = rotY(le0, COORDS.pitchSign * 90 * DEG);
  assert.ok(close(le90[2], 1, 1e-9), '90° 時前緣朝正上風');
});

test('風向定義（氣象慣例）：0° 北風從 +Z 吹來、90° 東風從 −X 吹來；機艙對風', () => {
  const u0 = upwindVector(0), u90 = upwindVector(90), u180 = upwindVector(180);
  assert.ok(close(u0[2], 1) && close(u0[0], 0));
  assert.ok(close(u90[0], COORDS.compass.east[0]) && close(u90[2], 0, 1e-12), '90° = 東風，從東方（−X）吹來');
  assert.ok(close(u180[2], -1), '180° = 南風');
  // 北朝上時東在右邊：從上往下看（看向 −Y、畫面上方 = 北），右方 = 前方 × 上方
  const right = cross([0, -1, 0], COORDS.compass.north);
  assert.deepEqual(right.map((v) => v + 0), COORDS.compass.east, '東方在北方的右邊（從上往下看）');
  // 偏航 ψ 時葉輪面朝 Ry(ψ)·(0,0,1) = (sin ψ, 0, cos ψ)，應等於上風方向
  for (const th of [0, 37, 90, 200, -45, 315]) {
    const psi = yawForWind(th) * DEG;
    const face = [Math.sin(psi), 0, Math.cos(psi)];
    const u = upwindVector(th);
    assert.ok(close(face[0], u[0], 1e-9) && close(face[2], u[2], 1e-9));
  }
  assert.equal(windName(0), '北風');
  assert.equal(windName(90), '東風');
  assert.equal(windName(225), '西南風');
  assert.equal(windName(-45), '西北風');
});

test('物理合理性：葉尖速比、Betz 極限、發電機同步轉速、展示轉速', () => {
  const R = DIM.rotor.radius, rho = 1.225;
  const omega = (rpm) => (rpm * 2 * Math.PI) / 60;
  const tsrRated = (omega(SIM.rotorRatedRpm) * R) / SIM.ratedSpeed;
  assert.ok(tsrRated > 5.5 && tsrRated < 9, `額定葉尖速比 ${tsrRated}`);
  assert.ok(omega(SIM.rotorRatedRpm) * R < 90, '葉尖速度 < 90 m/s（噪音與侵蝕限制）');
  const cp = (SIM.ratedPowerKW * 1000) / (0.5 * rho * Math.PI * R * R * SIM.ratedSpeed ** 3);
  assert.ok(cp > 0.2 && cp < 16 / 27, `額定 Cp ${cp} 必須低於 Betz 極限 0.593`);
  assert.ok(Math.abs(SIM.rotorRatedRpm * gearboxRatio() - 1800) / 1800 < 0.02, '60 Hz 四極發電機同步轉速 1800 rpm');
  const tsrDemo = (omega(SIM.demoRotorRpm) * R) / 8; // 預設風速 8 m/s
  assert.ok(tsrDemo > 6 && tsrDemo < 8, `展示轉速在預設風速下的葉尖速比 ${tsrDemo}`);
});

test('輸電路徑：電桿 → 變電所 → 高壓鐵塔一路往遠方，不會斷在半路', () => {
  const lay = substationLayout();
  const { along } = lineAxes();
  const last = DIM.site.poles[DIM.site.poles.length - 1];
  const proj = (p) => (p[0] - last[0]) * along[0] + (p[2] - last[2]) * along[2];
  assert.ok(proj(lay.gantryIn) > 5, '進線門型架在最後一根電桿之後');
  assert.ok(proj(lay.gantryOut) > proj(lay.gantryIn));
  let prev = proj(lay.gantryOut);
  for (const t of lay.towers) { assert.ok(proj(t) > prev, '鐵塔沿線路往外'); prev = proj(t); }
  assert.ok(Math.hypot(...lay.towers[lay.towers.length - 1]) > 450, '最後一座鐵塔遠到消失在霧裡，表示送往遠方');
});

test('尺寸：塔架、輪轂高度、葉尖離地與離塔架距離合理', () => {
  const t = DIM.tower;
  assert.ok(t.topY > t.baseY && t.baseRadius > t.topRadius);
  assert.equal(t.baseY, DIM.foundation.height, '塔架底部應坐在基座頂面');
  const H = hubHeight();
  assert.ok(H > 75 && H < 90, `輪轂高度 ${H}`);
  assert.ok(H - DIM.rotor.radius > 20, '葉尖離地至少 20 m');
  // 葉片朝下時，葉尖在機艙局部 z 的位置（含傾角與錐角）必須離塔架表面夠遠
  const c = rotorCenterLocal();
  const tilt = DIM.drivetrain.tiltDeg * DEG, cone = DIM.rotor.coneDeg * DEG;
  const R = DIM.rotor.radius;
  // 葉輪局部：朝下葉片葉尖 = (0, -R cos cone, R sin cone)；轉到機艙局部（繞 X 轉 -tilt）
  const ly = -R * Math.cos(cone), lz = R * Math.sin(cone);
  const tipY = c[1] + ly * Math.cos(tilt) + lz * Math.sin(tilt);
  const tipZ = c[2] - ly * Math.sin(tilt) + lz * Math.cos(tilt);
  const towerR = t.topRadius + (t.baseRadius - t.topRadius) * ((t.topY - (t.topY + tipY)) / (t.topY - t.baseY));
  const clearance = tipZ - towerR;
  assert.ok(clearance > 5, `葉尖與塔架距離 ${clearance.toFixed(2)} m 太小`);
});

test('導流罩與機艙外殼不重疊，葉輪中心在機艙前方', () => {
  const tilt = DIM.drivetrain.tiltDeg * DEG;
  const c = rotorCenterLocal();
  const s = DIM.spinner;
  // 導流罩後緣圓周上最靠後的點
  let minZ = Infinity;
  for (let a = 0; a < 360; a += 5) {
    const y = s.radius * Math.sin(a * DEG);
    minZ = Math.min(minZ, c[2] + s.rearZ * Math.cos(tilt) - y * Math.sin(tilt));
  }
  assert.ok(minZ > DIM.nacelle.max[2] + 0.1, `導流罩後緣 z=${minZ.toFixed(2)} 碰到機艙前緣 ${DIM.nacelle.max[2]}`);
});

test('傳動系統沿軸向排列：主軸 → 齒輪箱 → 高速軸 → 發電機，且都在機艙內', () => {
  const d = DRIVETRAIN;
  assert.ok(d.mainShaft.z0 >= d.gearbox.z1 - 1e-9, '主軸接到齒輪箱前端');
  assert.ok(close(d.highSpeedShaft.z1, d.gearbox.z0), '高速軸從齒輪箱後端出來');
  assert.ok(d.brake.z < d.highSpeedShaft.z1 && d.brake.z > d.highSpeedShaft.z0, '煞車在高速軸上');
  assert.ok(close(d.generator.z1, d.highSpeedShaft.z0, 0.11), '發電機接在高速軸後端');
  for (const b of d.mainBearings) assert.ok(b.z > d.mainShaft.z0 && b.z < d.mainShaft.z1, '主軸承在主軸上');
  assert.ok(d.mainShaft.z1 < DIM.rotor.centerOnAxis + DIM.hub.flangeZ + 1e-9, '主軸前端到輪轂法蘭為止');
  // 轉成機艙局部座標，檢查在外殼內
  const tilt = DIM.drivetrain.tiltDeg * DEG;
  const [ox, oy] = highSpeedShaftOffset();
  const toNacelle = (x, y, z) => [DIM.drivetrain.origin[0] + x, DIM.drivetrain.origin[1] + y * Math.cos(tilt) + z * Math.sin(tilt), DIM.drivetrain.origin[2] - y * Math.sin(tilt) + z * Math.cos(tilt)];
  const n = DIM.nacelle;
  const inside = (p, r) => p[0] - r > n.min[0] && p[0] + r < n.max[0] && p[1] - r > n.min[1] && p[1] + r < n.max[1] && p[2] > n.min[2] && p[2] < n.max[2];
  for (const z of [d.generator.z0, d.generator.z1]) assert.ok(inside(toNacelle(ox, oy, z), d.generator.radius), `發電機 z=${z} 超出機艙`);
  const ring = GEARBOX_CONFIGS[ACTIVE_GEARBOX].stages[0];
  assert.ok(inside(toNacelle(0, 0, ring.z), (ring.module * ring.ringTeeth) / 2 + 0.1), '行星齒輪環超出機艙');
  assert.ok(inside(toNacelle(0, 0, d.mainShaft.z0), d.mainShaft.radius));
});

test('齒輪：行星齒數關係、中心距、總速比與模擬參數一致', () => {
  for (const cfg of Object.values(GEARBOX_CONFIGS)) {
    for (const s of cfg.stages) {
      if (s.type === 'planetary') {
        assert.equal(s.ringTeeth, s.sunTeeth + 2 * s.planetTeeth, '環齒數 = 太陽 + 2 × 行星');
        assert.equal((s.sunTeeth + s.ringTeeth) % s.planetCount, 0, '行星可等距排列');
      }
      assert.ok(stageRatio(s) > 1, `${s.id} 應為增速`);
      assert.ok(centerDistance(s) > 0);
    }
  }
  const ratio = gearboxRatio();
  assert.ok(close(ratio, 112, 1e-9), `總速比 ${ratio}`);
  assert.ok(Math.abs(SIM.rotorRatedRpm * ratio - SIM.generatorRatedRpm) / SIM.generatorRatedRpm < 0.02, '額定轉速 × 速比 ≈ 發電機額定轉速');
});

test('模擬參數：切入 < 額定 < 切出，展示轉速不超過上限', () => {
  assert.ok(SIM.cutInSpeed < SIM.ratedSpeed && SIM.ratedSpeed < SIM.cutOutSpeed);
  assert.ok(SIM.demoRotorRpm <= SIM.visualMaxRotorRpm);
  assert.ok(SIM.teachingYawRateDegPerSec > SIM.maxYawRateDegPerSec, '教學版偏航較快，介面需標示「教學示意」');
});

test('葉片：漸縮、扭轉往葉尖遞減、葉根為圓形', () => {
  const root = bladeSectionAt(DIM.blade.rootR);
  const max = bladeSectionAt(DIM.blade.maxChordR);
  const mid = bladeSectionAt(25);
  const tip = bladeSectionAt(DIM.rotor.radius);
  assert.equal(root.blend, 0);
  assert.ok(close(max.chord, DIM.blade.maxChord, 1e-9));
  assert.ok(max.chord > mid.chord && mid.chord > tip.chord, '從最大弦長往葉尖漸縮');
  assert.ok(max.twistDeg > mid.twistDeg && mid.twistDeg > tip.twistDeg, '扭轉往葉尖遞減');
  assert.ok(close(tip.chord, DIM.blade.tipChord, 1e-9));
});

test('配色：每個零件的顏色都在配色表中，且格式正確', () => {
  for (const p of PARTS) assert.ok(p.colorKey in PALETTE, `${p.id} 的顏色 ${p.colorKey} 不存在`);
  for (const [k, v] of Object.entries(PALETTE)) assert.match(v, /^#[0-9a-f]{6}$/i, k);
});

test('學習資料：每個零件都有國小版名稱與說明；連接關係只引用存在的零件', () => {
  const ids = new Set(PARTS.map((p) => p.id));
  for (const p of PARTS) {
    const t = PARTS_TEXT.elementary[p.id];
    assert.ok(t && t.name && t.short && t.more, `${p.id} 缺國小版文字`);
    assert.equal(partText(p.id, 'junior'), t, '國中版未填時退回國小版');
  }
  for (const c of CONNECTIONS) {
    assert.ok(ids.has(c.from), `連接來源 ${c.from} 不存在`);
    assert.ok(ids.has(c.to), `連接目標 ${c.to} 不存在`);
  }
  assert.ok(DIFFICULTIES.elementary.enabled);
  assert.ok(Object.values(MODES).some((m) => m.stage === 1));
});

test('視角：預設與各預設視角都在允許的距離範圍內', () => {
  const all = [{ target: VIEW.defaultTarget, camera: VIEW.defaultCamera }, ...Object.values(VIEW.presets)];
  for (const p of all) {
    const d = Math.hypot(...p.camera.map((v, i) => v - p.target[i]));
    assert.ok(d >= VIEW.minDistance && d <= VIEW.maxDistance, `距離 ${d}`);
    assert.ok(p.camera[1] > 0, '相機在地面上方');
  }
});

test('第二階段：電力路徑每一段首尾相接（發電機 → 塔內 → 地下 → 變壓器 → 電桿）', () => {
  const r = CABLE_ROUTE;
  const nEnd = r.nacelle[r.nacelle.length - 1];
  assert.deepEqual([nEnd[0], nEnd[2]], [0, 0], '機艙內電纜要在偏航軸上往下，機艙轉向時才不會斷開');
  assert.ok(Math.abs(DIM.tower.topY + nEnd[1] - r.tower[0][1]) < 1e-9, '機艙電纜終點 = 塔內電纜起點');
  assert.deepEqual(r.tower[r.tower.length - 1], r.underground[0], '塔內電纜終點 = 地下電纜起點');
  assert.deepEqual(r.underground[1], DIM.site.transformer.at, '地下電纜經過變壓器');
  assert.deepEqual(r.underground[r.underground.length - 1], DIM.site.poles[0], '地下電纜接到第一根電桿');
  assert.deepEqual(r.riser[0], DIM.site.poles[0]);
  assert.ok(Math.abs(r.riser[1][1] - (DIM.site.poleHeight - 0.6)) < 1e-9, '引線接到橫擔高度');
  // 起點在發電機下方
  const [hx] = highSpeedShaftOffset();
  assert.ok(Math.abs(r.nacelle[0][0] - hx) < 0.05, '電纜起點在發電機正下方');
});

test('第二階段：高速軸轉向與主軸相同（1 級行星同向 × 2 級平行軸各反向一次）', () => {
  assert.equal(gearboxDirection(), 1);
  const byId = Object.fromEntries(HIERARCHY.map((n) => [n.id, n]));
  assert.equal(byId.highSpeedShaft.parent, 'drivetrain');
  assert.equal(byId.lowSpeedShaft.parent, 'drivetrain');
  assert.deepEqual(byId.highSpeedShaft.position.slice(0, 2), highSpeedShaftOffset());
  assert.equal(byId.highSpeedShaft.rotates.sign, COORDS.rotorSpinSign);
});

test('第二階段：偏航馬達的小齒輪剛好咬住塔頂內齒環', () => {
  const y = INTERNALS.yaw;
  assert.ok(Math.abs(y.driveRadius + y.pinionRadius - y.ringInnerRadius) < 0.02);
  assert.ok(y.ringOuterRadius >= DIM.tower.topRadius, '齒環坐在塔頂上');
});

test('第二階段：輪轂本體在導流罩內，變槳軸承在葉根', () => {
  assert.ok(INTERNALS.hubBodyRadius < DIM.spinner.radius);
  assert.ok(INTERNALS.pitch.bearingRadius > DIM.blade.rootDiameter / 2, '軸承包住葉根');
  assert.ok(Math.hypot(...INTERNALS.pitch.motorOffset) + INTERNALS.pitch.motorLength / 2 < INTERNALS.hubBodyRadius, '變槳馬達在輪轂內');
});

// ---------------- 第三階段：齒輪組 ----------------
const frac = (x) => ((x % 1) + 1) % 1;
const nearHalf = (x) => Math.abs(frac(x) - 0.5) < 1e-6;

test('第三階段：齒輪配置的末端軸位置 = 高速軸位置', () => {
  const { shafts } = gearLayout();
  const [hx, hy] = highSpeedShaftOffset();
  const last = shafts[shafts.length - 1];
  assert.ok(Math.abs(last[0] - hx) < 1e-9 && Math.abs(last[1] - hy) < 1e-9);
});

test('第三階段：各軸轉速比 主軸 1 : 太陽 5 : 中間軸 −20 : 高速軸 112', () => {
  const a = gearTrainAngles(0.1), b = gearTrainAngles(0.1 + 0.01);
  const d = (k) => (b[k] - a[k]) / 0.01;
  assert.ok(Math.abs(d('sun') - 5) < 1e-6);
  assert.ok(Math.abs(d('intermediate') + 20) < 1e-6, '中間軸反向');
  assert.ok(Math.abs(d('high') - 112) < 1e-6, '高速軸同向、112 倍');
  assert.ok(Math.abs((b.planetAbs[0] - a.planetAbs[0]) / 0.01 - (1 - 96 / 36)) < 1e-6, '行星自轉（絕對）');
});

test('第三階段：任何角度下，每一對齒輪都是「齒對齒溝」（嚙合相位）', () => {
  const { planetary: pl, parallel: par, shafts, planets } = gearLayout();
  const P = (z) => (2 * Math.PI) / z;
  for (const thetaC of [0, 0.37, -1.9, 5.5, 123.4]) {
    const g = gearTrainAngles(thetaC);
    planets.forEach((b0, k) => {
      const beta = thetaC + b0; // 行星中心方向（隨行星架轉）
      const sSun = (beta - g.sun) / P(pl.sunTeeth);
      const sPlanetIn = (beta + Math.PI - g.planetAbs[k]) / P(pl.planetTeeth);
      assert.ok(nearHalf(sSun + sPlanetIn), `太陽–行星${k} θc=${thetaC}`);
      const sPlanetOut = (beta - g.planetAbs[k]) / P(pl.planetTeeth);
      const sRing = beta / P(pl.ringTeeth); // 環固定
      assert.ok(nearHalf(sPlanetOut - sRing), `行星${k}–環 θc=${thetaC}`);
    });
    par.forEach((st, i) => {
      const [x0, y0] = shafts[i], [x1, y1] = shafts[i + 1];
      const alpha = Math.atan2(y1 - y0, x1 - x0);
      const sDriver = (alpha - g.shafts[i]) / P(st.driverTeeth);
      const sDriven = (alpha + Math.PI - g.shafts[i + 1]) / P(st.drivenTeeth);
      assert.ok(nearHalf(sDriver + sDriven), `平行軸第 ${i + 1} 級 θc=${thetaC}`);
    });
  }
});

test('第三階段：行星齒輪互不碰撞，所有齒輪都在齒輪箱外殼內', () => {
  const { planetary: pl, parallel: par, shafts, planetRadius, planets } = gearLayout();
  const tip = (m, z) => (m * z) / 2 + m;
  const gap = 2 * planetRadius * Math.sin(Math.PI / planets.length);
  assert.ok(gap > 2 * tip(pl.module, pl.planetTeeth) + 0.02, '相鄰行星的齒頂不碰');
  const ringOuter = (pl.module * pl.ringTeeth) / 2 + 2.3 * pl.module + 0.03;
  assert.ok(ringOuter < DRIVETRAIN.gearboxHousing.planetaryRadius, '環形齒輪在行星段外殼內');
  const box = DRIVETRAIN.gearboxHousing.parallelBox;
  par.forEach((st, i) => {
    for (const [c, r] of [[shafts[i], tip(st.module, st.driverTeeth)], [shafts[i + 1], tip(st.module, st.drivenTeeth)]]) {
      assert.ok(c[0] - r >= box.x[0] && c[0] + r <= box.x[1] && c[1] - r >= box.y[0] && c[1] + r <= box.y[1], `第 ${i + 1} 級齒輪超出外殼`);
    }
    assert.ok(st.z - st.faceWidth / 2 > box.z[0] && st.z + st.faceWidth / 2 < box.z[1], `第 ${i + 1} 級齒輪的軸向位置超出外殼`);
  });
  // 第一級大齒輪不能碰到中間軸以外的軸；第二級大齒輪不能碰到太陽齒輪軸（不同軸向位置即可）
  assert.ok(par[1].z < par[0].z - (par[0].faceWidth + par[1].faceWidth) / 2, '兩級平行軸齒輪在不同軸向位置');
});

test('第三階段：拆解位移表只引用存在的鍵，拆解模式已開放', () => {
  const keys = new Set([...PARTS.map((p) => p.id), 'generatorRotor']);
  for (const k of Object.keys(EXPLODE.offsets)) assert.ok(keys.has(k), `未知拆解鍵 ${k}`);
  assert.ok(MODES.explode.stage <= CURRENT_STAGE);
  assert.ok(Math.abs(SIM.gearDemoRotorRpm / 60 * gearboxRatio() - SIM.visualMaxHighSpeedRps) < 1e-9);
});
