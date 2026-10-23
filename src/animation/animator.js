// 動畫：只改節點旋轉，不重建幾何。速度與暫停一律讀集中 store。
import { COORDS, SIM, DIM } from '../spec/turbineSpec.js';

const DEG = Math.PI / 180;
const TAU = Math.PI * 2;

export function createAnimator({ nodes, sensorParts, store }) {
  // 動畫內部的「相位」不是可讓使用者切換的狀態，只是累積角度
  let rotorAngle = 0;
  let anemoAngle = 0;

  function rotorRpm() {
    // 第一階段：固定的展示轉速（教學示意）；第四階段改由模擬決定
    return Math.min(SIM.demoRotorRpm, SIM.visualMaxRotorRpm);
  }

  function applyPose() {
    const s = store.get();
    nodes.yaw.rotation.y = s.windAngleDeg * DEG; // 第一階段：機艙正對預設風向
    nodes.rotor.rotation.z = rotorAngle;
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
      }
      applyPose();
    },
    /** 截圖／測試用：設定固定的葉輪角度 */
    setRotorAngleDeg(a) { rotorAngle = a * DEG; applyPose(); },
    rotorAngleDeg: () => rotorAngle / DEG,
  };
}
