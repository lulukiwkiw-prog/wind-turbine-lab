// 物理檢查（隨機情境）：每次修改都會自動跑，確認模擬不違反物理
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createSim, cpSigned, cpTotal, aeroTorque, SIM_CONST } from '../src/sim/turbineSim.js';
import { SIM, DIM } from '../src/spec/turbineSpec.js';
import { createStore } from '../src/state/store.js';
import { createRng } from '../src/spec/rng.js';

const BETZ = 16 / 27;
const R = DIM.rotor.radius;
const omega = (rpm) => (rpm * 2 * Math.PI) / 60;

test('Cp：葉尖速比趨近 0 時 Cp 也趨近 0（靜止時力矩有限）；任何情況都低於貝茲極限', () => {
  for (const b of [0, 10, 30, 52, 70, 90]) {
    assert.ok(Math.abs(cpSigned(1e-4, b)) < 1e-3, `β=${b}`);
    for (const w of [1e-5, 1e-3, 0.01]) assert.ok(Number.isFinite(aeroTorque(w, 10, b)) && Math.abs(aeroTorque(w, 10, b)) < 5e6, `力矩 β=${b} ω=${w}`);
    for (let l = 0.01; l < 20; l += 0.05) assert.ok(cpTotal(l, b) < BETZ, `Cp(${l.toFixed(2)}, ${b})`);
  }
  assert.ok(aeroTorque(0, 8, 0) > 0, '靜止時有啟動力矩');
  assert.ok(aeroTorque(0, 8, 90) < 1, '完全順槳時沒有啟動力矩');
  assert.ok(cpSigned(5, 90) < 0, '順槳的葉片在轉動時產生阻力（氣動煞車）');
});

test('隨機情境：功率、轉速、能量守恆、停機都合理（含中途改風速、亂切換自動／手動）', () => {
  const rng = createRng(2026);
  let maxRpm = 0, maxEnergyErr = 0;
  for (let n = 0; n < 250; n++) {
    const store = createStore();
    const v = Math.round(rng.range(0, 30) * 2) / 2, v2 = Math.round(rng.range(0, 30) * 2) / 2;
    store.set({ windSpeed: v, pitchAuto: rng.next() < 0.5, pitchDeg: Math.round(rng.range(0, 90)) });
    const sim = createSim(store);
    store.set({ windAngleDeg: [0, 45, 90, 135, 180, 225, 270, 315][Math.floor(rng.next() * 8)] });
    let prev = sim.get();
    const dt = 0.02; // 和模擬內部的積分步長相同，能量檢查才準確
    for (let t = 0; t < 60; t += dt) {
      if (Math.abs(t - 30) < dt / 2) store.set({ windSpeed: v2 });
      if (rng.next() < 0.003) store.set({ pitchAuto: !store.get().pitchAuto });
      if (rng.next() < 0.003) store.set({ pitchDeg: Math.round(rng.range(0, 90)) });
      sim.step(dt);
      const s = sim.get();
      const where = `情境 ${n}、t=${t.toFixed(2)}：${JSON.stringify({ v, v2, st: s.status, rpm: s.rotorRpm, kW: s.powerKW })}`;
      for (const [k, x] of Object.entries(s)) if (typeof x === 'number') assert.ok(Number.isFinite(x), `${k} 不是有限數字，${where}`);
      assert.ok(s.powerKW >= 0 && s.powerKW <= SIM.ratedPowerKW + 1e-6, `功率超出範圍，${where}`);
      assert.ok(s.powerKW <= SIM.efficiency * s.loadPowerKW + 1e-6, `電比發電機吸收的還多，${where}`);
      assert.ok(s.aeroPowerKW <= s.windPowerKW * BETZ + 1e-6, `超過貝茲極限，${where}`);
      assert.ok(s.pitchDeg >= 0 && s.pitchDeg <= 90, `槳距超出範圍，${where}`);
      assert.ok(s.wakeSpeed >= -1e-9, `尾流風速為負，${where}`);
      if (s.effectiveWind < SIM.cutInSpeed && s.status !== 'shutdown') assert.equal(s.powerKW, 0, `低於切入卻發電，${where}`);
      maxRpm = Math.max(maxRpm, s.rotorRpm);
      // 能量守恆：葉輪動能的變化 = (風的力矩 − 負載力矩) × 轉過的角度
      // 跳過負載切換的那一步（發電機接上／放開、煞車作用），以及風速、方向正在變的時候
      const sameRegime = s.status === prev.status && s.brake === prev.brake && Math.abs(s.loadPowerKW - prev.loadPowerKW) < 0.2 * Math.max(10, prev.loadPowerKW);
      if (sameRegime && t > 0.5 && prev.rotorRpm > 0.05 && s.rotorRpm > 0.05 && s.windSpeed === prev.windSpeed && s.yawErrorDeg === prev.yawErrorDeg && s.effectiveWind > 0) {
        const w0 = omega(prev.rotorRpm), w1 = omega(s.rotorRpm);
        const aero = 0.5 * SIM.airDensity * SIM_CONST.AREA * s.effectiveWind ** 3 * cpSigned((w0 * R) / s.effectiveWind, s.pitchDeg);
        const pred = (aero - prev.loadPowerKW * 1000) * dt * (w0 + w1) / (2 * w0);
        const dE = 0.5 * SIM_CONST.J * (w1 * w1 - w0 * w0);
        const err = Math.abs(dE - pred) / Math.max(1, Math.abs(aero * dt) + prev.loadPowerKW * 1000 * dt);
        maxEnergyErr = Math.max(maxEnergyErr, err);
      }
      prev = s;
    }
    if (v2 >= SIM.cutOutSpeed) assert.equal(sim.get().status, 'shutdown', `切出以上沒有停機：情境 ${n}`);
  }
  assert.ok(maxRpm <= SIM.rotorRatedRpm * SIM.overspeedFactor + 0.2, `最高轉速 ${maxRpm.toFixed(2)} rpm 超過保護值`);
  assert.ok(maxEnergyErr < 0.02, `能量守恆誤差 ${(maxEnergyErr * 100).toFixed(2)}%`);
});

test('能量去哪裡：轉速不變時，發出的電 = 效率 × 葉輪接住；加速時，多出來的能量存成葉輪的動能', () => {
  const store = createStore();
  store.set({ windSpeed: 7 });
  const sim = createSim(store);
  for (let t = 0; t < 20; t += 0.05) sim.step(0.05);
  let s = sim.get();
  assert.ok(Math.abs(s.powerKW - SIM.efficiency * s.aeroPowerKW) < 1, '穩態：電 = η × 接住');
  store.set({ windSpeed: 10 });
  sim.step(1); // 風變大的瞬間：葉輪還沒追上
  s = sim.get();
  assert.ok(s.accelPowerKW > 0, '接住的比送出去的多 → 葉輪加速（動能增加）');
  assert.ok(s.windSpeed < s.targetWindSpeed, '風速要幾秒才會從 7 變到 10 m/s');
});

test('沒有風時，葉輪靠摩擦與空氣阻力慢慢停下（不會一直轉，也不會突然停）', () => {
  const store = createStore();
  store.set({ windSpeed: 8 });
  const sim = createSim(store);
  store.set({ windSpeed: 0 });
  const r = [sim.get().rotorRpm];
  for (let i = 1; i <= 2400; i++) { sim.step(0.05); if (i % 600 === 0) r.push(sim.get().rotorRpm); } // 每 30 秒記一次，共 120 秒
  for (let i = 1; i < r.length; i++) assert.ok(r[i] < r[i - 1] || r[i] === 0, '轉速一直變慢');
  assert.ok(r[1] > 1, '不會一下子停住（葉輪很重）');
  assert.ok(r[r.length - 1] < 3, '兩分鐘後幾乎停下');
});
