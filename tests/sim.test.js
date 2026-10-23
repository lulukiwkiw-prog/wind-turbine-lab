// 發電實驗模擬（第四階段）：檢查是否符合物理與真實風機的控制方式
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { SIM, DIM, yawForWind } from '../src/spec/turbineSpec.js';
import {
  cp, OPTIMUM, autoOperatingPoint, manualEquilibrium, windPower, axialInduction, yawStep, createSim, SIM_CONST,
} from '../src/sim/turbineSim.js';
import { createStore } from '../src/state/store.js';

const BETZ = 16 / 27;
const R = DIM.rotor.radius;
const elecPower = (v) => {
  const op = autoOperatingPoint(v);
  return op.region === 'tooLow' ? 0 : Math.min(SIM.efficiency * windPower(v) * cp((op.omega * R) / v, op.beta), SIM.ratedPowerKW * 1000);
};
function run(store, sim, seconds, dt = 0.05) { for (let t = 0; t < seconds; t += dt) sim.step(dt); return sim.get(); }

test('Cp：任何葉尖速比與槳距都不超過 Betz 極限；最佳值約 0.44（λ≈6.3、槳距 0）', () => {
  for (let l = 0.5; l <= 16; l += 0.25) for (let b = 0; b <= 90; b += 2.5) {
    const c = cp(l, b);
    assert.ok(c >= 0 && c < BETZ, `Cp(${l}, ${b}) = ${c}`);
  }
  assert.ok(OPTIMUM.cp > 0.4 && OPTIMUM.cp < 0.5);
  assert.ok(OPTIMUM.lambda > 5.5 && OPTIMUM.lambda < 8);
  assert.ok(cp(OPTIMUM.lambda, 20) < cp(OPTIMUM.lambda, 0) * 0.5, '槳距加大，接住的風變少');
});

test('功率曲線：切入前 0、之後隨風速增加、在約 11 m/s 滿載、到切出前維持額定', () => {
  assert.equal(elecPower(SIM.cutInSpeed - 0.1), 0);
  let prev = 0;
  for (let v = SIM.cutInSpeed; v < SIM.cutOutSpeed; v += 0.25) {
    const p = elecPower(v);
    assert.ok(p >= prev - 1e-6, `功率在 ${v} m/s 下降了`);
    prev = p;
  }
  // 低於額定時，功率約與風速三次方成正比（風速兩倍 → 約 8 倍）
  const ratio = elecPower(8) / elecPower(4);
  assert.ok(ratio > 7 && ratio < 9, `P(8)/P(4) = ${ratio}`);
  // 找出實際滿載風速，必須和規格的額定風速一致
  let vr = SIM.cutInSpeed;
  while (elecPower(vr) < SIM.ratedPowerKW * 1000 * 0.999) vr += 0.01;
  assert.ok(Math.abs(vr - SIM.ratedSpeed) < 0.5, `模型滿載風速 ${vr.toFixed(2)}、規格 ${SIM.ratedSpeed}`);
  for (const v of [13, 18, 24]) assert.ok(Math.abs(elecPower(v) - SIM.ratedPowerKW * 1000) < 1, `${v} m/s 應維持額定`);
});

test('自動控制：額定以下槳距 0、轉速追最佳葉尖速比；額定以上變槳、轉速不超過額定', () => {
  for (const v of [5, 7, 9]) {
    const op = autoOperatingPoint(v);
    assert.equal(op.beta, 0);
    assert.ok(Math.abs((op.omega * R) / v - OPTIMUM.lambda) < 1e-9);
  }
  let prevBeta = 0;
  for (const v of [12, 15, 20, 24]) {
    const op = autoOperatingPoint(v);
    assert.ok(op.omega <= SIM_CONST.OMEGA_RATED + 1e-9);
    assert.ok(op.beta > prevBeta, '風越大，葉片轉開越多');
    prevBeta = op.beta;
  }
});

test('手動槳距：力矩平衡的轉速與自動控制一致（槳距 0、額定以下）；槳距越大轉越慢', () => {
  for (const v of [5, 8]) {
    const auto = autoOperatingPoint(v).omega;
    assert.ok(Math.abs(manualEquilibrium(v, 0) - auto) / auto < 0.03, `${v} m/s`);
    assert.ok(manualEquilibrium(v, 25) < manualEquilibrium(v, 0));
  }
  assert.ok(manualEquilibrium(8, 90) < 0.05 * SIM_CONST.OMEGA_RATED, '完全順槳幾乎不轉');
});

test('尾流：葉輪接住越多，後面的風越慢；Betz 時尾流風速約為 1/3', () => {
  assert.equal(axialInduction(0), 0);
  assert.ok(Math.abs(axialInduction(BETZ) - 1 / 3) < 1e-6);
  const a = axialInduction(OPTIMUM.cp);
  assert.ok(a > 0 && a < 1 / 3 && 1 - 2 * a > 0);
});

test('偏航：速率受限、走最短方向；電纜扭超過限制時改走另一邊（解纜）', () => {
  const r = yawStep(0, 30, 6);
  assert.equal(r.yaw, 6);
  assert.equal(yawStep(0, -30, 6).yaw, -6);
  assert.equal(yawStep(0, 1, 6).moving, false, '小於死區不轉');
  const limit = SIM.cableTwistLimitTurns * 360;
  const u = yawStep(limit - 10, limit + 40, 6); // 最短路徑會超過限制
  assert.ok(u.unwinding && u.yaw < limit - 10, '改往反方向繞回去');
});

test('模擬：滿載、停機保護（有遲滯）、超速保護、偏航時功率下降、不違反能量守恆', () => {
  const store = createStore();
  store.set({ windSpeed: 15 });
  const sim = createSim(store);
  let s = run(store, sim, 20);
  assert.equal(s.status, 'rated');
  assert.ok(Math.abs(s.powerKW - SIM.ratedPowerKW) < 5);
  assert.ok(s.powerKW <= s.aeroPowerKW && s.aeroPowerKW <= s.windPowerKW * BETZ, '電 ≤ 葉輪接住 ≤ 風的 59%');

  store.set({ windSpeed: 27 });
  s = run(store, sim, 30);
  assert.equal(s.status, 'shutdown');
  assert.ok(s.pitchDeg > 85 && s.rotorRpm < 0.5 && s.powerKW === 0 && s.brake);
  store.set({ windSpeed: 22 });
  assert.equal(run(store, sim, 5).status, 'shutdown', '降到 22 m/s 仍停機（要低於重新啟動風速）');
  store.set({ windSpeed: 18 });
  assert.notEqual(run(store, sim, 30).status, 'shutdown');

  store.set({ pitchAuto: false, pitchDeg: 0, windSpeed: 18 });
  s = run(store, sim, 30);
  assert.equal(s.status, 'overspeed');
  assert.ok(s.rotorRpm < SIM.rotorRatedRpm * (SIM.overspeedFactor + 0.05), '保護系統把轉速壓住');

  store.set({ pitchAuto: true, windSpeed: 8, windAngleDeg: 0 });
  const aligned = run(store, sim, 60).powerKW;
  store.set({ windAngleDeg: 60 });
  sim.step(0.05);
  s = sim.get();
  assert.ok(s.status === 'yawing' && s.powerKW < aligned, '風向改變、還沒對準時功率較低');
  s = run(store, sim, 60);
  assert.ok(Math.abs(s.yawErrorDeg) <= SIM.yawDeadbandDeg + 1e-9);
  assert.ok(Math.abs(s.yawDeg - yawForWind(60)) <= SIM.yawDeadbandDeg + 1e-9);
});

test('模擬：風速 0 時葉輪停下、沒有電；風速計與發電機轉速同步主軸 × 速比', () => {
  const store = createStore();
  store.set({ windSpeed: 0 });
  const sim = createSim(store);
  const s = run(store, sim, 30);
  assert.ok(s.rotorRpm < 0.01 && s.powerKW === 0);
  store.set({ windSpeed: 8 });
  const t = run(store, sim, 30);
  assert.ok(Math.abs(t.generatorRpm / t.rotorRpm - 112) < 1e-9);
});
