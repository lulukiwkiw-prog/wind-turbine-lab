// 發電實驗的模擬（第四階段）
//
// 物理部分（可在測試中檢查）：
//   風的功率   P_wind = ½ ρ A v³
//   葉輪接住   P_aero = P_wind · Cp(λ, β)，λ = ωR / v（葉尖速比），Cp 永遠低於 Betz 極限 16/27
//   發出的電   P_elec = η · P_aero（不超過額定功率）
//   偏航誤差 γ 時，有效風速 v·cos γ
//   尾流（風被葉輪「用掉」一部分）：Cp = 4a(1−a)²，遠處尾流風速 v(1−2a)
//
// 控制（真實風機的做法，簡化）：
//   自動：切入以下不發電；額定以下槳距 0、轉速追最佳葉尖速比；轉速到額定後維持；
//         功率到額定後轉動葉片（變槳）保持額定；切出以上順槳停機，降到重新啟動風速才再開。
//   手動：小朋友自己設定槳距；轉速由「風的力矩 = 發電機力矩」的平衡決定；
//         轉太快（超過額定 15%）時保護系統接手，自動變槳。
//
// 教學示意（非精確）：轉速與偏航的反應速度、待機時的慢轉、能量流動點。
import { DIM, SIM, yawForWind, gearboxRatio } from '../spec/turbineSpec.js';

const R = DIM.rotor.radius;
const AREA = Math.PI * R * R;
const OMEGA_RATED = (SIM.rotorRatedRpm * 2 * Math.PI) / 60;
const P_RATED = SIM.ratedPowerKW * 1000; // W（電）
const P_RATED_MECH = P_RATED / SIM.efficiency;
const T_RATED = P_RATED_MECH / OMEGA_RATED; // 發電機最大（額定）力矩，換算到主軸
const BETZ = 16 / 27;

const toRpm = (w) => (w * 60) / (2 * Math.PI);
const wrap180 = (a) => ((((a + 180) % 360) + 360) % 360) - 180;

/** 功率係數 Cp(λ, β)：經驗公式，負值取 0 */
export function cp(lambda, betaDeg) {
  if (!(lambda > 0)) return 0;
  const { c1, c2, c3, c4, c5 } = SIM.cpCoeffs;
  const b = betaDeg;
  const inv = 1 / (lambda + 0.08 * b) - 0.035 / (b ** 3 + 1);
  if (inv <= 0) return 0;
  const v = c1 * (c2 * inv - c3 * b - c4) * Math.exp(-c5 * inv);
  return Math.max(0, v);
}

/** 槳距 0 時的最佳葉尖速比與最大 Cp（數值搜尋，只算一次） */
export const OPTIMUM = (() => {
  let best = { lambda: 0, cp: 0 };
  for (let l = 1; l <= 14; l += 0.01) {
    const c = cp(l, 0);
    if (c > best.cp) best = { lambda: l, cp: c };
  }
  return best;
})();

// 發電機力矩規律：額定以下 T = kω²，讓轉速自然追到最佳葉尖速比（真實風機常用）
const K_OPT = (0.5 * SIM.airDensity * AREA * R ** 3 * OPTIMUM.cp) / OPTIMUM.lambda ** 3;
const genTorque = (w) => Math.min(K_OPT * w * w, T_RATED);

export const windPower = (v) => 0.5 * SIM.airDensity * AREA * v ** 3;

function aeroTorque(w, v, beta) {
  if (v <= 0 || w <= 1e-6) return 0;
  return (windPower(v) * cp((w * R) / v, beta)) / w;
}

/** 由 Cp 反求軸向誘導因子 a（0～1/3） */
export function axialInduction(c) {
  if (!(c > 0)) return 0;
  const target = Math.min(Math.max(c, 0), BETZ);
  let lo = 0, hi = 1 / 3;
  for (let i = 0; i < 40; i++) {
    const mid = (lo + hi) / 2;
    if (4 * mid * (1 - mid) ** 2 < target) lo = mid; else hi = mid;
  }
  return (lo + hi) / 2;
}

/** 自動控制的穩定運轉點（有效風速 v）：{ omega, beta, region } */
export function autoOperatingPoint(v) {
  if (v < SIM.cutInSpeed) return { omega: 0, beta: 0, region: 'tooLow' };
  const omega = Math.min((OPTIMUM.lambda * v) / R, OMEGA_RATED);
  const lambda = (omega * R) / v;
  if (SIM.efficiency * windPower(v) * cp(lambda, 0) <= P_RATED) {
    return { omega, beta: 0, region: omega < OMEGA_RATED - 1e-9 ? 'optimal' : 'speedLimit' };
  }
  // 功率超過額定：找出讓功率剛好等於額定的槳距角
  const need = P_RATED_MECH / windPower(v);
  let lo = 0, hi = 45;
  for (let i = 0; i < 50; i++) {
    const mid = (lo + hi) / 2;
    if (cp(lambda, mid) > need) lo = mid; else hi = mid;
  }
  return { omega, beta: (lo + hi) / 2, region: 'rated' };
}

/** 手動槳距時的力矩平衡轉速（穩定平衡點；沒有就代表會一直加速） */
export function manualEquilibrium(v, beta) {
  if (v <= 0) return 0;
  const wMax = OMEGA_RATED * 2.5;
  const n = 400;
  let eq = 0;
  let prev = aeroTorque(wMax / n, v, beta) - genTorque(wMax / n);
  for (let i = 2; i <= n; i++) {
    const w = (wMax * i) / n;
    const f = aeroTorque(w, v, beta) - genTorque(w);
    if (prev > 0 && f <= 0) eq = w; // 由正變負：穩定平衡（取最高的那一個）
    prev = f;
  }
  if (eq === 0 && prev > 0) return wMax; // 一路都是風的力矩比較大：會超速
  return eq;
}

/** 依目前（實際）轉速與槳距，算出各種功率 */
function powers(v, vEff, w, beta, generating, manual) {
  const pWind = windPower(v);
  const lambda = vEff > 0 ? (w * R) / vEff : 0;
  const c = vEff > 0 ? cp(lambda, beta) : 0;
  const pAero = windPower(vEff) * c;
  let pElec = 0;
  if (generating) pElec = manual ? SIM.efficiency * genTorque(w) * w : SIM.efficiency * pAero;
  pElec = Math.max(0, Math.min(pElec, P_RATED, SIM.efficiency * pAero + 1));
  return { pWind, pAero, pElec, cp: c, lambda };
}

/** 偏航：往目標轉最短的方向；若會讓電纜扭超過限制，就改走另一邊（解纜） */
export function yawStep(yaw, target, maxStep) {
  const limit = SIM.cableTwistLimitTurns * 360;
  let e = wrap180(target - yaw);
  let unwinding = false;
  if (Math.abs(yaw + e) > limit) { e -= Math.sign(e) * 360; unwinding = true; }
  if (Math.abs(e) <= SIM.yawDeadbandDeg) return { yaw, moving: false, unwinding: false };
  const step = Math.sign(e) * Math.min(Math.abs(e), maxStep);
  return { yaw: yaw + step, moving: true, unwinding };
}

export function createSim(store) {
  let s = null;

  function reset() {
    const st = store.get();
    const yaw = yawForWind(st.windAngleDeg);
    const op = autoOperatingPoint(st.windSpeed);
    s = {
      yaw, // 偏航節點角（度，未取模，可看出電纜扭了幾圈）
      omega: st.windSpeed < SIM.cutOutSpeed ? op.omega : 0,
      beta: st.windSpeed < SIM.cutOutSpeed ? op.beta : 90,
      shutdown: st.windSpeed >= SIM.cutOutSpeed,
      unwinding: false, yawing: false, overspeed: false,
    };
  }
  reset();

  /** 前進 dt 秒（已乘上慢動作倍率） */
  function step(dt) {
    if (dt <= 0) return;
    const st = store.get();
    const v = st.windSpeed;

    // 偏航（教學示意：比真實快）
    const y = yawStep(s.yaw, yawForWind(st.windAngleDeg), SIM.teachingYawRateDegPerSec * dt);
    s.yaw = y.yaw; s.yawing = y.moving; s.unwinding = y.unwinding;
    const gamma = wrap180(yawForWind(st.windAngleDeg) - s.yaw);
    const vEff = v * Math.max(0, Math.cos((gamma * Math.PI) / 180));

    // 停機保護（有遲滯）
    if (v >= SIM.cutOutSpeed) s.shutdown = true;
    else if (s.shutdown && v < SIM.restartSpeed) s.shutdown = false;

    let targetBeta, targetOmega;
    s.overspeed = false;
    if (s.shutdown) {
      targetBeta = 90; targetOmega = 0;
    } else if (st.pitchAuto) {
      const op = autoOperatingPoint(vEff);
      targetBeta = op.beta;
      targetOmega = op.region === 'tooLow' ? Math.min(vEff / SIM.cutInSpeed, 1) * (OMEGA_RATED * 0.12) : op.omega; // 待機慢轉（示意）
    } else {
      targetBeta = st.pitchDeg;
      targetOmega = manualEquilibrium(vEff, s.beta);
      // 用「小朋友設定的槳距」判斷安不安全（不是目前的槳距），保護才不會一開一關來回振盪
      if (manualEquilibrium(vEff, st.pitchDeg) > OMEGA_RATED * SIM.overspeedFactor) {
        // 超速保護：控制器接手變槳，直到設定變安全或風變小
        s.overspeed = true;
        const op = autoOperatingPoint(vEff);
        targetBeta = Math.max(op.beta, st.pitchDeg);
        targetOmega = Math.min(op.omega, manualEquilibrium(vEff, targetBeta));
      }
    }
    // 槳距：以最大變槳速率追目標
    const db = targetBeta - s.beta;
    s.beta += Math.sign(db) * Math.min(Math.abs(db), SIM.maxPitchRateDegPerSec * dt);
    // 轉速：一階追隨（教學示意）
    s.omega += (targetOmega - s.omega) * (1 - Math.exp(-dt / SIM.rotorTimeConstantSec));
    if (s.omega < 1e-4) s.omega = 0;
  }

  function get() {
    const st = store.get();
    const v = st.windSpeed;
    const gamma = wrap180(yawForWind(st.windAngleDeg) - s.yaw);
    const vEff = v * Math.max(0, Math.cos((gamma * Math.PI) / 180));
    const generating = !s.shutdown && vEff >= SIM.cutInSpeed;
    const p = powers(v, vEff, s.omega, s.beta, generating, !st.pitchAuto);
    const a = axialInduction(p.cp);
    let status = 'generating';
    if (s.shutdown) status = 'shutdown';
    else if (s.overspeed) status = 'overspeed';
    else if (s.unwinding) status = 'unwinding';
    else if (s.yawing && Math.abs(gamma) > 10 && v >= SIM.cutInSpeed) status = 'yawing';
    else if (vEff < SIM.cutInSpeed) status = 'tooLow';
    else if (p.pElec >= P_RATED * 0.99) status = 'rated';
    return {
      windSpeed: v,
      effectiveWind: vEff,
      yawDeg: s.yaw,
      yawErrorDeg: gamma,
      cableTurns: s.yaw / 360,
      pitchDeg: s.beta,
      rotorRpm: toRpm(s.omega),
      generatorRpm: toRpm(s.omega) * gearboxRatio(),
      windPowerKW: p.pWind / 1000,
      aeroPowerKW: p.pAero / 1000,
      powerKW: p.pElec / 1000,
      cp: p.cp,
      tipSpeedRatio: p.lambda,
      wakeSpeed: vEff * (1 - 2 * a),
      brake: s.shutdown && s.omega < OMEGA_RATED * 0.05,
      status,
    };
  }

  return { step, get, reset };
}

export const SIM_CONST = { OMEGA_RATED, P_RATED, T_RATED, AREA, BETZ, K_OPT };
