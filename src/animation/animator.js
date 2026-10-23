// 動畫：只改節點旋轉，不重建幾何。速度與暫停一律讀集中 store。
import { COORDS, SIM, DIM, gearboxRatio, gearboxDirection, gearTrainAngles, gearLayout, yawForWind } from '../spec/turbineSpec.js';

const DEG = Math.PI / 180;
const TAU = Math.PI * 2;

export function createAnimator({ nodes, sensorParts, store }) {
  // 動畫內部的「相位」不是可讓使用者切換的狀態，只是累積角度
  let rotorAngle = 0;
  let anemoAngle = 0;
  let highAngle = 0;
  const ratio = gearboxRatio();
  const hsDir = COORDS.rotorSpinSign * gearboxDirection();

  const planetCount = gearLayout().planets.length;

  function rotorRpm() {
    // 拆解模式：齒輪依真實速比連動，葉輪放慢；其他模式：固定展示轉速（教學示意）。第四階段改由模擬決定
    if (store.get().mode === 'explode') return SIM.gearDemoRotorRpm;
    return Math.min(SIM.demoRotorRpm, SIM.visualMaxRotorRpm);
  }

  /** 高速軸畫面轉速（每秒圈數）：實際為主軸 × 速比，但畫面上限放慢，避免閃爍（教學示意） */
  function highSpeedRps() {
    return Math.min((rotorRpm() / 60) * ratio, SIM.visualMaxHighSpeedRps);
  }

  function applyPose() {
    const s = store.get();
    nodes.yaw.rotation.y = yawForWind(s.windAngleDeg) * DEG; // 第一～三階段：機艙正對風向（氣象慣例）
    nodes.rotor.rotation.z = rotorAngle;
    nodes.lowSpeedShaft.rotation.z = rotorAngle; // 主軸與葉輪剛性連接，角度相同
    // 齒輪組：全部由主軸（行星架）角度推得，保證齒對齒溝
    const g = gearTrainAngles(rotorAngle);
    nodes.sunShaft.rotation.z = g.sun;
    nodes.intermediateShaft.rotation.z = g.intermediate;
    for (let k = 0; k < planetCount; k++) nodes[`planet${k}`].rotation.z = g.planetAbs[k] - rotorAngle; // 掛在行星架上，存相對角
    // 高速軸：拆解模式用真實速比（看得到末級齒輪咬合）；其他模式用放慢的展示角度
    nodes.highSpeedShaft.rotation.z = s.mode === 'explode' ? g.high : highAngle;
    for (let i = 0; i < DIM.rotor.bladeCount; i++) {
      nodes[`pitch${i}`].rotation.y = COORDS.pitchSign * s.pitchDeg * DEG;
    }
    sensorParts.anemometerHead.rotation.y = anemoAngle;
  }

  return {
    update(dt) {
      const s = store.get();
      if (!s.paused) {
        const k = dt * s.animSpeed;
        rotorAngle = (rotorAngle + COORDS.rotorSpinSign * (rotorRpm() / 60) * TAU * k) % TAU;
        anemoAngle = (anemoAngle + 1.2 * TAU * k) % TAU;
        highAngle = (highAngle + hsDir * highSpeedRps() * TAU * k) % TAU;
      }
      applyPose();
    },
    /** 截圖／測試用：設定固定的葉輪角度 */
    setRotorAngleDeg(a) { rotorAngle = a * DEG; applyPose(); },
    rotorAngleDeg: () => rotorAngle / DEG,
    highSpeedAngleDeg: () => highAngle / DEG,
    highSpeedRps,
  };
}
