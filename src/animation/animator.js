// 動畫：只改節點旋轉，不重建幾何。速度與暫停一律讀集中 store；轉速、偏航、槳距來自模擬。
import { COORDS, SIM, DIM, gearboxRatio, gearboxDirection, gearTrainAngles, gearLayout, yawForWind } from '../spec/turbineSpec.js';
import { createSim } from '../sim/turbineSim.js';

const DEG = Math.PI / 180;
const TAU = Math.PI * 2;
const wrap180 = (a) => ((((a + 180) % 360) + 360) % 360) - 180;

export function createAnimator({ nodes, sensorParts, store, sim = createSim(store) }) {
  // 動畫內部的「相位」不是可讓使用者切換的狀態，只是累積角度
  let rotorAngle = 0;
  let anemoAngle = 0;
  let highAngle = 0;
  const ratio = gearboxRatio();
  const hsDir = COORDS.rotorSpinSign * gearboxDirection();
  const planetCount = gearLayout().planets.length;
  const cupR = DIM.sensors.anemometer.cupRadius;

  function rotorRpm() {
    // 拆解模式：齒輪依真實速比連動，葉輪放慢（教學示意）；其他模式：由模擬決定
    if (store.get().mode === 'explode') return SIM.gearDemoRotorRpm;
    return Math.min(sim.get().rotorRpm, SIM.visualMaxRotorRpm);
  }

  /**
   * 高速軸畫面轉速（每秒圈數）：實際為主軸 × 速比，太快會閃爍，所以畫面依固定比例放慢（教學示意）：
   * 葉輪在額定轉速時，高速軸畫面每秒轉 visualMaxHighSpeedRps 圈；風小轉慢時也看得出比較慢。
   */
  const hsSlowdown = SIM.visualMaxHighSpeedRps / ((SIM.rotorRatedRpm / 60) * ratio);
  function highSpeedRps() {
    return Math.min((rotorRpm() / 60) * ratio * hsSlowdown, SIM.visualMaxHighSpeedRps);
  }

  /** 風速計：杯子中心的速度約為風速的 1/3 */
  function anemometerRps() {
    return Math.min(store.get().windSpeed / 3 / (TAU * cupR), SIM.visualMaxAnemometerRps);
  }

  function applyPose() {
    const s = store.get();
    const now = sim.get();
    nodes.yaw.rotation.y = now.yawDeg * DEG; // 偏航：模擬中的實際機艙方向（會慢慢追風）
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
      nodes[`pitch${i}`].rotation.y = COORDS.pitchSign * now.pitchDeg * DEG;
    }
    sensorParts.anemometerHead.rotation.y = anemoAngle;
    // 風向標指向真正的風向（機艙還在轉向時，兩者會有差距）
    sensorParts.windVaneHead.rotation.y = wrap180(yawForWind(s.windAngleDeg) - now.yawDeg) * DEG;
  }

  return {
    sim,
    update(dt) {
      const s = store.get();
      if (!s.paused) {
        const k = dt * s.animSpeed;
        sim.step(k);
        rotorAngle = (rotorAngle + COORDS.rotorSpinSign * (rotorRpm() / 60) * TAU * k) % TAU;
        anemoAngle = (anemoAngle + anemometerRps() * TAU * k) % TAU;
        highAngle = (highAngle + hsDir * highSpeedRps() * TAU * k) % TAU;
      }
      applyPose();
    },
    /** 截圖／測試用：設定固定的葉輪角度 */
    setRotorAngleDeg(a) { rotorAngle = a * DEG; applyPose(); },
    rotorAngleDeg: () => rotorAngle / DEG,
    highSpeedAngleDeg: () => highAngle / DEG,
    highSpeedRps,
    rotorRpm,
  };
}
