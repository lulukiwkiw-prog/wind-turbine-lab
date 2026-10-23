// 發電實驗的模擬（第四階段；物理檢查後改為真正的轉動動力學）
//
// 物理部分（可在測試中檢查）：
//   風的功率   P_wind = ½ ρ A v³
//   葉輪接住   P_aero = P_wind · Cp(λ, β)，λ = ωR / v（葉尖速比），Cp 永遠低於 Betz 極限 16/27
//   轉動       J · dω/dt = 風的力矩 − 負載力矩（發電機或摩擦、煞車）
//              → 能量守恆：P_aero − 負載功率 = 葉輪動能的變化；轉速不變時，發出的電 = η · P_aero
//   發出的電   P_elec = η · 發電機力矩 · ω（發電機最多 2000 kW）
//   偏航誤差 γ 時，有效風速 v·cos γ
//   尾流（風被葉輪「用掉」一部分）：Cp = 4a(1−a)²，遠處尾流風速 v(1−2a)
//
// 控制（真實風機的做法，簡化）：
//   發電機力矩：額定以下 T = kω²（轉速自動追到最佳葉尖速比），到額定功率後改為定功率
//   自動變槳：額定以下 0°；功率到額定後轉開葉片，並依超速量再多轉一點，讓轉速維持額定
//   手動：小朋友自己設定槳距；若這個設定會讓轉速超過額定 15%，保護系統接手變槳
//   切入以下：發電機不出力，只剩摩擦；切出以上：順槳停機，轉慢後煞車；降到重新啟動風速才再開
//
// 教學示意（非精確）：葉輪慣量比真實小（反應較快）、偏航加速、啟動力矩的簡化、能量流動點。
import { DIM, SIM, yawForWind, gearboxRatio } from '../spec/turbineSpec.js';

const R = DIM.rotor.radius;
const AREA = Math.PI * R * R;
const OMEGA_RATED = (SIM.rotorRatedRpm * 2 * Math.PI) / 60;
const P_RATED = SIM.ratedPowerKW * 1000; // W（電）
const P_RATED_MECH = P_RATED / SIM.efficiency;
const T_RATED = P_RATED_MECH / OMEGA_RATED; // 發電機最大（額定）力矩，換算到主軸
const J = SIM.rotorInertia; // 葉輪 + 傳動系統的轉動慣量（換算到主軸，教學示意值）
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

// 發電機力矩規律：額定以下 T = kω²，讓轉速自然追到最佳葉尖速比（真實風機常用）；
// 到達額定功率後改成「定功率」T = P/ω，發電量剛好維持額定（不會只把數字截掉）
const K_OPT = (0.5 * SIM.airDensity * AREA * R ** 3 * OPTIMUM.cp) / OPTIMUM.lambda ** 3;
export const genTorque = (w) => Math.min(K_OPT * w * w, P_RATED_MECH / Math.max(w, 1e-6));
// 不發電時（低於切入），發電機不出力，只有軸承與齒輪的摩擦力矩（示意：額定力矩的 1%）
export const frictionTorque = () => 0.01 * T_RATED;
// 葉片在空氣中轉動的阻力（不發電時才另外計入；發電時已包含在 Cp 裡）
// 估算：3 片 × 平均弦長約 2 m、阻力係數 0.01，∫½ρC_d c (ωr)² r dr ≈ 3.8 × 10⁴ · ω²（N·m）
const K_DRAG = (3 * 0.5 * SIM.airDensity * 0.01 * 2 * R ** 4) / 4;
export const idleDragTorque = (w) => K_DRAG * w * w;

export const windPower = (v) => 0.5 * SIM.airDensity * AREA * v ** 3;

/**
 * 用於力矩與功率的 Cp：經驗公式 + 低轉速時的「啟動力矩」。
 * 經驗公式在葉尖速比很小時幾乎為 0，但真實葉片在靜止時也有啟動力矩，否則停下的葉輪永遠轉不起來。
 * 啟動項 Cq0·cos β·λ·(1 − λ/3)（λ < 3），最多只多 0.0075，總和仍低於 Betz 極限。
 */
const CQ0 = 0.01;
const CP_BRAKE_MIN = -0.03; // 負值 = 葉片產生阻力、讓葉輪變慢（順槳停機的主要方法）；經驗公式在極端值不準，限制在 −0.03

/** 有正負號的 Cp：正 = 風推葉輪，負 = 空氣阻力讓葉輪減速 */
export function cpSigned(lambda, betaDeg) {
  if (!(lambda > 0)) return 0;
  const { c1, c2, c3, c4, c5 } = SIM.cpCoeffs;
  const b = betaDeg;
  const inv = 1 / (lambda + 0.08 * b) - 0.035 / (b ** 3 + 1);
  // 功率 = 力矩 × 轉速，所以葉尖速比趨近 0 時 Cp 也必須趨近 0（否則靜止時會算出無限大的力矩）；
  // 經驗公式在大槳距、低葉尖速比時不符合這點，因此在 λ < 1 時線性收斂到 0
  const raw = (inv > 0 ? c1 * (c2 * inv - c3 * b - c4) * Math.exp(-c5 * inv) : 0) * Math.min(1, lambda);
  const start = lambda < 3 ? CQ0 * Math.cos((b * Math.PI) / 180) * lambda * (1 - lambda / 3) : 0;
  return Math.max(CP_BRAKE_MIN * Math.min(1, lambda), raw) + Math.max(0, start); // 煞車效果也隨轉速變慢而變小
}

/** 顯示用的 Cp（葉輪「接住」的比例，不小於 0） */
export function cpTotal(lambda, betaDeg) {
  return Math.max(0, cpSigned(lambda, betaDeg));
}

/** 風的力矩（N·m，換算到主軸，可為負＝氣動煞車）；ω → 0 時用啟動力矩的極限值 */
export function aeroTorque(w, v, beta) {
  if (v <= 0) return 0;
  if (w <= 1e-6) return 0.5 * SIM.airDensity * AREA * R * v * v * CQ0 * Math.cos((beta * Math.PI) / 180);
  return (windPower(v) * cpSigned((w * R) / v, beta)) / w;
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

const W_MAX = OMEGA_RATED * 2.5; // 搜尋上限（超過就視為超速）

/**
 * 力矩平衡：從目前轉速 w0 出發，風的力矩比較大就往上找、比較小就往下找，
 * 停在第一個「風的力矩 = 負載力矩」的穩定平衡點（就像真的葉輪會加速或減速到那裡）。
 * 一路找不到就代表會一直加速（回傳搜尋上限，觸發超速保護）。
 * w0 省略時，從最佳葉尖速比對應的轉速出發。
 */
export function manualEquilibrium(v, beta, w0 = null, load = genTorque) {
  if (v <= 0) return 0;
  const n = 500;
  const dw = W_MAX / n;
  const f = (w) => aeroTorque(w, v, beta) - load(w);
  // 找到平衡點所在的小區間後，用二分法求精確值
  const refine = (lo, hi) => {
    for (let i = 0; i < 40; i++) { const mid = (lo + hi) / 2; if (f(mid) > 0) lo = mid; else hi = mid; }
    return (lo + hi) / 2;
  };
  let w = Math.min(Math.max(w0 ?? (OPTIMUM.lambda * v) / R, dw), W_MAX);
  if (f(w) > 0) {
    for (; w < W_MAX; w += dw) if (f(w + dw) <= 0) return refine(w, w + dw);
    return W_MAX;
  }
  for (; w > dw; w -= dw) if (f(w - dw) > 0) return refine(w - dw, w);
  return 0;
}

/** 依目前（實際）轉速、槳距與負載，算出各種功率 */
function powers(v, vEff, w, beta, loadTorque, generating) {
  const pWind = windPower(v);
  const lambda = vEff > 0 ? (w * R) / vEff : 0;
  const c = vEff > 0 ? cpTotal(lambda, beta) : 0;
  const pAero = windPower(vEff) * c;
  const pLoad = loadTorque * w; // 負載吸收的機械功率
  const pElec = generating ? Math.min(SIM.efficiency * pLoad, P_RATED) : 0;
  return { pWind, pAero, pElec, pLoad, cp: c, lambda };
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

  /** 發電機有沒有接上：發電中，或停機時還轉得快（邊變槳邊用發電機減速，真實風機也是這樣） */
  function genConnected(w, vEff) {
    if (s.shutdown) return w > OMEGA_RATED * 0.3;
    return vEff >= SIM.cutInSpeed;
  }

  /** 目前的負載力矩（發電機、摩擦、葉片空氣阻力或煞車） */
  function load(w, vEff) {
    if (genConnected(w, vEff)) return genTorque(w) + (s.shutdown ? frictionTorque() : 0);
    const brake = s.shutdown ? SIM.brakeTorqueRatio * T_RATED : 0; // 停機且轉慢後：機械煞車
    return frictionTorque() + idleDragTorque(w) + brake;
  }

  // s.wind：模擬中「真正吹到的風速」，會以有限的速度追上滑桿的設定（空氣有質量，陣風也要幾秒才形成）
  function effectiveWind(st) {
    const gamma = wrap180(yawForWind(st.windAngleDeg) - s.yaw);
    return { gamma, vEff: s.wind * Math.max(0, Math.cos((gamma * Math.PI) / 180)) };
  }

  function reset() {
    const st = store.get();
    const v = st.windSpeed;
    const op = autoOperatingPoint(v);
    s = {
      wind: v,
      yaw: yawForWind(st.windAngleDeg), // 偏航節點角（度，未取模，可看出電纜扭了幾圈）
      omega: 0, beta: 0,
      shutdown: v >= SIM.cutOutSpeed,
      unwinding: false, yawing: false, overspeed: false,
    };
    // 從穩定狀態開始（不用等葉輪慢慢轉起來）
    if (s.shutdown) { s.beta = 90; s.omega = 0; }
    else if (v >= SIM.cutInSpeed) {
      const unsafe = !st.pitchAuto && manualEquilibrium(v, st.pitchDeg) > OMEGA_RATED * SIM.overspeedFactor;
      if (st.pitchAuto || unsafe) { // 自動，或手動設定會超速：從保護系統接手後的狀態開始
        s.beta = Math.max(op.beta, st.pitchAuto ? 0 : st.pitchDeg);
        s.omega = Math.min(op.omega, manualEquilibrium(v, s.beta));
      } else {
        s.beta = st.pitchDeg;
        s.omega = manualEquilibrium(v, s.beta);
      }
    } else {
      s.beta = st.pitchAuto ? 0 : st.pitchDeg;
      s.omega = manualEquilibrium(v, s.beta, 0, frictionTorque);
    }
  }
  reset();

  /** 前進 dt 秒（已乘上慢動作倍率）；內部切成小步，數值穩定 */
  function step(dt) {
    if (dt <= 0) return;
    const n = Math.max(1, Math.ceil(dt / 0.02));
    for (let i = 0; i < n; i++) substep(dt / n);
  }

  function substep(dt) {
    const st = store.get();
    const dv = st.windSpeed - s.wind;
    s.wind += Math.sign(dv) * Math.min(Math.abs(dv), SIM.windRampMps2 * dt);
    const v = s.wind;

    // 偏航（教學示意：比真實快）
    const y = yawStep(s.yaw, yawForWind(st.windAngleDeg), SIM.teachingYawRateDegPerSec * dt);
    s.yaw = y.yaw; s.yawing = y.moving; s.unwinding = y.unwinding;
    const { vEff } = effectiveWind(st);

    // 停機保護（有遲滯）
    if (v >= SIM.cutOutSpeed) s.shutdown = true;
    else if (s.shutdown && v < SIM.restartSpeed) s.shutdown = false;
    const generating = !s.shutdown && vEff >= SIM.cutInSpeed;

    // 槳距指令
    const overspeedCorr = Math.max(0, (s.omega - OMEGA_RATED) / OMEGA_RATED) * SIM.pitchGainDegPerUnit; // 轉太快就再多轉開一點
    let targetBeta;
    s.overspeed = false;
    if (s.shutdown) targetBeta = 90;
    else if (st.pitchAuto) targetBeta = generating ? autoOperatingPoint(vEff).beta + overspeedCorr : 0;
    else {
      targetBeta = st.pitchDeg;
      // 用「小朋友設定的槳距」預測會不會超速（不是看目前的槳距），保護才不會一開一關來回振盪
      if (generating && (manualEquilibrium(vEff, st.pitchDeg, s.omega) > OMEGA_RATED * SIM.overspeedFactor || s.omega > OMEGA_RATED * SIM.overspeedFactor)) {
        s.overspeed = true;
        targetBeta = Math.max(st.pitchDeg, autoOperatingPoint(vEff).beta + overspeedCorr);
      }
    }
    targetBeta = Math.min(90, Math.max(0, targetBeta));
    const db = targetBeta - s.beta;
    s.beta += Math.sign(db) * Math.min(Math.abs(db), SIM.maxPitchRateDegPerSec * dt);

    // 轉動：J·dω/dt = 風的力矩 − 負載力矩
    const net = aeroTorque(s.omega, vEff, s.beta) - load(s.omega, vEff);
    s.omega = Math.max(0, s.omega + (net / J) * dt);
    if (s.omega < 1e-4 && net <= 0) s.omega = 0;
  }

  function get() {
    const st = store.get();
    const v = s.wind;
    const { gamma, vEff } = effectiveWind(st);
    const connected = genConnected(s.omega, vEff);
    const p = powers(v, vEff, s.omega, s.beta, load(s.omega, vEff), connected);
    if (connected && s.shutdown) p.pElec = Math.min(SIM.efficiency * genTorque(s.omega) * s.omega, P_RATED); // 停機減速時發電機還在發一點電
    const a = axialInduction(p.cp);
    let status = 'generating';
    if (s.shutdown) status = 'shutdown';
    else if (s.overspeed) status = 'overspeed';
    else if (s.unwinding) status = 'unwinding';
    else if (s.yawing && Math.abs(gamma) > 10 && v >= SIM.cutInSpeed) status = 'yawing';
    else if (vEff < SIM.cutInSpeed) status = 'tooLow';
    else if (p.pElec >= P_RATED * 0.99) status = 'rated';
    return {
      windSpeed: v, // 現在真正吹到的風速
      targetWindSpeed: st.windSpeed, // 滑桿設定的風速
      effectiveWind: vEff,
      yawDeg: s.yaw,
      yawErrorDeg: gamma,
      cableTurns: s.yaw / 360,
      pitchDeg: s.beta,
      rotorRpm: toRpm(s.omega),
      generatorRpm: toRpm(s.omega) * gearboxRatio(),
      windPowerKW: p.pWind / 1000,
      aeroPowerKW: p.pAero / 1000,
      loadPowerKW: p.pLoad / 1000,
      powerKW: p.pElec / 1000,
      // 葉輪動能變化率（kW）：接住的比送出的多就加速，少就減速
      accelPowerKW: (p.pAero - p.pLoad) / 1000,
      cp: p.cp,
      tipSpeedRatio: p.lambda,
      wakeSpeed: vEff * (1 - 2 * a),
      brake: s.shutdown && s.omega < OMEGA_RATED * 0.3,
      pitchAuto: st.pitchAuto,
      status,
    };
  }

  return { step, get, reset };
}

export const SIM_CONST = { OMEGA_RATED, P_RATED, T_RATED, AREA, BETZ, K_OPT, J };
