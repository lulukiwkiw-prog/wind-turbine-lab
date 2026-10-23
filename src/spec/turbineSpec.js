// =====================================================================
// turbineSpec.js — 風力發電機的「單一資料來源」
//
// 尺寸、座標、轉軸、父子群組、配色、齒輪、模擬參數、難度設定都在這裡。
// 其他模組（模型、動畫、互動、圖表產生器、測試）一律 import 這個檔案，
// 不得自行寫死座標或比例。
//
// 本檔不 import three.js，純資料與純數學，讓 Node 測試與 SVG 產生器也能使用。
//
// ⚠ 示意性質：尺寸是「具代表性的 2 MW 級陸域三葉片上風式風機」的示意比例，
//   不對應任何廠牌或型號，也不具工程精度。
// =====================================================================

const DEG = Math.PI / 180;

// ---------------------------------------------------------------------
// 1. 座標慣例
// ---------------------------------------------------------------------
// - 1 單位 = 1 公尺（示意比例）
// - 右手座標系，+Y 朝上
// - 世界原點：塔架中心軸與地面（y = 0）的交點
// - 偏航角 ψ = 0 時，葉輪正面（上風面）朝向世界 +Z
// - 方位：+Z = 北、−X = 東、−Z = 南、+X = 西（從上往下看，北朝上時東在右邊）
// - 風向角 θ（氣象慣例）：風「吹來」的方位角，從北方起算，從上往下看順時針為正。
//   θ = 0° 北風（從 +Z 吹來）、90° 東風（從 −X 吹來）、180° 南風、270° 西風。
//   上風方向單位向量 u(θ) = (−sin θ, 0, cos θ)；風的流動方向 = −u(θ)。
// - 偏航角 ψ 是節點繞 +Y 的旋轉（右手、從上往下看逆時針），ψ 時葉輪面朝 (sin ψ, 0, cos ψ)。
//   機艙對準風時：ψ = −θ
// - 葉輪轉向：從上風處看為順時針 → 繞葉輪軸（指向上風）的角速度為負
export const COORDS = {
  unit: 'm',
  up: [0, 1, 0],
  handedness: 'right',
  worldOrigin: '塔架中心軸與地面交點',
  rotorFacesAtYawZero: [0, 0, 1],
  compass: { north: [0, 0, 1], east: [-1, 0, 0], south: [0, 0, -1], west: [1, 0, 0] },
  windAngleDefinition: '氣象慣例：風吹來的方位角，從北方（+Z）起算，從上往下看順時針為正（東 = 90°）',
  rotorSpinSign: -1, // 從上風處看順時針
  pitchSign: -1, // 槳距角增加 → 前緣轉向上風（順槳方向），繞葉片局部 +Y 的旋轉角 = pitchSign × β
};

/** 風從哪個方向吹來（上風方向單位向量） */
export function upwindVector(windAngleDeg) {
  const a = windAngleDeg * DEG;
  return [-Math.sin(a), 0, Math.cos(a)];
}

/** 機艙正對風時的偏航角（度，節點繞 +Y 的右手旋轉角） */
export function yawForWind(windAngleDeg) {
  return -windAngleDeg;
}

/** 風向角 → 中文風名（八方位） */
export function windName(windAngleDeg) {
  const names = ['北', '東北', '東', '東南', '南', '西南', '西', '西北'];
  return `${names[Math.round((((windAngleDeg % 360) + 360) % 360) / 45) % 8]}風`;
}

// ---------------------------------------------------------------------
// 2. 主要尺寸（公尺，示意值）
// ---------------------------------------------------------------------
export const DIM = {
  foundation: { radius: 3.4, height: 0.6, buriedRadius: 8.0 }, // 露出地面的基座 y∈[0, 0.6]
  tower: {
    baseY: 0.6,
    topY: 78.0, // 偏航軸承頂面
    baseRadius: 2.1,
    topRadius: 1.3,
    flangeHeight: 0.25,
    door: { width: 1.0, height: 2.2, sillY: 1.0 }, // 門朝 +Z 側（世界座標）
  },
  // 機艙外殼（機艙局部座標，原點 = 偏航軸承頂面中心）
  nacelle: {
    min: [-1.9, 0.3, -7.0],
    max: [1.9, 4.3, 3.0],
    cornerRadius: 0.55,
    bedplate: { min: [-1.4, 0.0, -6.6], max: [1.4, 0.3, 2.6] },
  },
  // 傳動系統座標框架：位於機艙局部座標 origin，繞 X 傾斜 tiltDeg（葉輪端抬高）
  drivetrain: {
    origin: [0, 2.0, 0],
    tiltDeg: 5,
  },
  rotor: {
    centerOnAxis: 5.0, // 輪轂中心在傳動軸上的位置（傳動框架 z）
    radius: 45.0, // 葉輪半徑 R（葉尖到旋轉中心）
    coneDeg: 2.5, // 錐角：葉片往上風側微傾，增加與塔架的距離
    bladeCount: 3,
  },
  hub: { radius: 1.6, flangeZ: -1.3 }, // 輪轂（葉輪局部座標）
  spinner: { radius: 2.0, rearZ: -1.4, shoulderZ: -0.2, noseZ: 3.0 }, // 導流罩（葉輪局部座標）
  blade: {
    rootR: 1.6, // 葉根（變槳軸承）離旋轉中心的距離
    rootDiameter: 1.8,
    cylinderEndR: 3.0, // 葉根圓柱段結束
    maxChordR: 9.0, // 最大弦長位置
    maxChord: 3.4,
    tipChord: 0.9,
    pitchAxisChordFrac: 0.3, // 變槳軸在弦長 30%（自前緣算起）
    twistRootDeg: 13, // 最大弦長處扭轉角
    twistTipDeg: 0,
    thicknessMax: 0.40, // 最大弦長處相對厚度
    thicknessTip: 0.15,
    sections: 36,
    profilePoints: 28,
  },
  sensors: {
    mastHeight: 1.1,
    anemometer: { at: [0.6, 4.3, -6.2], cupRadius: 0.22 },
    windVane: { at: [-0.6, 4.3, -6.2], length: 0.9 },
  },
  site: {
    transformer: { at: [9, 0, 5], size: [2.4, 2.2, 1.8] }, // 箱型變壓器（世界座標）
    poles: [[22, 0, 14], [48, 0, 30], [76, 0, 46]], // 輸電桿（世界座標）
    poleHeight: 12,
    // 變電所：在最後一根電桿後方，沿線路方向（along／across 為沿線與垂直線路的長度）
    substation: { distanceAfterLastPole: 26, along: 18, across: 14, fenceHeight: 2.2, gantryHeight: 9, wireSpacing: 1.3 },
    // 變電所之後的高壓輸電鐵塔（距變電所中心的沿線距離），一路延伸到遠方
    hvLine: { distances: [40, 120, 210, 300, 390], towerHeight: 26, armSpan: 4 },
    groundRadius: 900,
  },
};

/** 輸電線路方向（第一根到最後一根電桿，水平單位向量）與垂直方向 */
export function lineAxes() {
  const p = DIM.site.poles;
  const dx = p[p.length - 1][0] - p[0][0], dz = p[p.length - 1][2] - p[0][2];
  const l = Math.hypot(dx, dz);
  return { along: [dx / l, 0, dz / l], across: [-dz / l, 0, dx / l] };
}

/** 變電所中心與進線／出線門型架位置（世界座標） */
export function substationLayout() {
  const s = DIM.site.substation;
  const { along } = lineAxes();
  const last = DIM.site.poles[DIM.site.poles.length - 1];
  const at = (base, d) => [base[0] + along[0] * d, 0, base[2] + along[2] * d];
  const center = at(last, s.distanceAfterLastPole + s.along / 2);
  return {
    center,
    gantryIn: at(center, -s.along / 2 + 1.5),
    gantryOut: at(center, s.along / 2 - 1.5),
    towers: DIM.site.hvLine.distances.map((d) => at(center, d)),
  };
}

// ---------------------------------------------------------------------
// 3. 傳動系統軸向配置（傳動框架 z，正值往葉輪/上風）
//    第一階段只做外觀；這些資料先定義好，給後續階段與一致性測試使用。
// ---------------------------------------------------------------------
export const DRIVETRAIN = {
  mainShaft: { z0: 0.6, z1: 3.6, radius: 0.38 }, // 主軸（低速軸）
  mainBearings: [ { z: 2.9, outerRadius: 0.7 }, { z: 1.3, outerRadius: 0.62 } ],
  gearbox: { z0: -1.9, z1: 0.6 }, // 齒輪箱外殼範圍
  gearboxHousing: { planetaryRadius: 1.08, parallelBox: { x: [-0.75, 1.05], y: [-0.72, 1.42], z: [-1.9, -0.35] } },
  highSpeedShaft: { z0: -3.4, z1: -1.9, radius: 0.09 },
  brake: { z: -2.3, discRadius: 0.42 },
  coupling: { z: -2.9, radius: 0.18 },
  generator: { z0: -6.0, z1: -3.5, radius: 0.72 },
  controller: { at: [1.1, 0.92, -6.3], size: [0.6, 1.2, 0.5] }, // 機艙局部座標（坐在機座上）
  shaftFlange: { z0: 3.5, z1: 3.7, radius: 0.75 }, // 主軸前端法蘭（接輪轂）
  brakeCaliper: { size: [0.16, 0.22, 0.2] },
  generatorRotorRadius: 0.46,
};

// ---------------------------------------------------------------------
// 3b. 其他內部系統（第二階段建模）
// ---------------------------------------------------------------------
export const INTERNALS = {
  // 偏航系統：塔頂內齒環 + 4 組偏航馬達（裝在機座上，隨機艙轉）
  yaw: {
    ringInnerRadius: 1.05, ringOuterRadius: 1.32, ringY: [-0.18, 0.0], // 機艙局部 y（塔頂之下）
    driveCount: 4, driveRadius: 0.93, driveAngleOffsetDeg: 45,
    motorRadius: 0.15, motorHeight: 0.55, // 馬達在機座上方 y∈[0.3, 0.85]
    pinionRadius: 0.11,
  },
  // 槳距系統：每片葉片一組變槳軸承 + 變槳馬達（裝在輪轂內）
  pitch: {
    bearingRadius: 0.95, bearingTube: 0.11, // 位於葉片節點 y = rootR
    motorRadius: 0.13, motorLength: 0.5, motorOffset: [0.55, 0.95, 0], // 葉片節點局部（不隨槳距轉）
  },
  hubBodyRadius: 1.45,
  cableRadius: 0.07,
};

// 電力路徑（教學示意）：發電機 → 機艙內 → 偏航中心往下 → 塔架內 → 塔底 → 地下 → 變壓器 → 地下 → 第一根電桿 → 往上接架空線
// 每一段的起點必須等於上一段的終點（測試會檢查），畫面上才會連續。
export const CABLE_ROUTE = {
  nacelle: [[0.6, 1.55, -5.2], [0.6, 0.4, -5.2], [0, 0.4, -5.2], [0, 0.4, 0], [0, -1.0, 0]], // 機艙局部
  tower: [[0, 77.0, 0], [0, 0.0, 0]], // 世界座標，沿塔架中心往下（77.0 = 塔頂 78.0 − 1.0）
  underground: [[0, 0, 0], [9, 0, 5], [22, 0, 14]], // 世界座標，地面下（畫成地面上的淡色埋線路徑）
  riser: [[22, 0, 14], [22, 11.4, 14]], // 世界座標，第一根電桿的引線（到橫擔高度）
  riserOffset: [-0.3, 0, 0.2], // 引線貼在電桿朝向風機的一側
};

// ---------------------------------------------------------------------
// 4. 齒輪參數（教學簡化）
//    真實 2 MW 級齒輪箱多為「1 級行星 + 2 級平行軸」，這裡沿用相同的級數與
//    總速比量級，但齒數、模數為教學示意值，不是真實設備的工程設計。
//    以「配置資料」描述，可日後新增其他配置。
// ---------------------------------------------------------------------
export const GEARBOX_CONFIGS = {
  'planetary-2parallel': {
    label: '行星齒輪 1 級 + 平行軸齒輪 2 級（教學示意）',
    isTeachingSimplification: true,
    stages: [
      {
        id: 'planetary',
        type: 'planetary',
        module: 0.02, // m，示意
        sunTeeth: 24,
        planetTeeth: 36,
        ringTeeth: 96,
        planetCount: 3,
        input: 'carrier', fixed: 'ring', output: 'sun',
        z: 0.0, faceWidth: 0.35,
      },
      {
        id: 'parallel-1',
        type: 'parallel',
        module: 0.016,
        driverTeeth: 80,
        drivenTeeth: 20,
        offsetAngleDeg: 90, // 輸出軸相對輸入軸的偏移方向（在傳動框架 XY 平面，0° = +X，90° = +Y）
        z: -0.8, faceWidth: 0.25,
      },
      {
        id: 'parallel-2',
        type: 'parallel',
        module: 0.012,
        driverTeeth: 84,
        drivenTeeth: 15,
        offsetAngleDeg: 0,
        z: -1.5, faceWidth: 0.2,
      },
    ],
  },
};
export const ACTIVE_GEARBOX = 'planetary-2parallel';

/** 單級速比（輸出轉速 / 輸入轉速） */
export function stageRatio(stage) {
  if (stage.type === 'planetary') {
    // 環齒輪固定、行星架輸入、太陽齒輪輸出：n_sun / n_carrier = 1 + Zr / Zs
    return 1 + stage.ringTeeth / stage.sunTeeth;
  }
  return stage.driverTeeth / stage.drivenTeeth;
}

/** 單級轉向（+1 同向，-1 反向） */
export function stageDirection(stage) {
  if (stage.type === 'planetary') return 1; // 行星架與太陽齒輪同向
  return -1; // 一對外嚙合齒輪反向
}

/** 中心距 = 模數 × (齒數1 + 齒數2) / 2 */
export function centerDistance(stage) {
  if (stage.type === 'planetary') return stage.module * (stage.sunTeeth + stage.planetTeeth) / 2;
  return stage.module * (stage.driverTeeth + stage.drivenTeeth) / 2;
}

export function gearboxRatio(configId = ACTIVE_GEARBOX) {
  return GEARBOX_CONFIGS[configId].stages.reduce((r, s) => r * stageRatio(s), 1);
}

/** 齒輪箱輸出相對輸入的轉向（+1 同向，-1 反向） */
export function gearboxDirection(configId = ACTIVE_GEARBOX) {
  return GEARBOX_CONFIGS[configId].stages.reduce((d, s) => d * stageDirection(s), 1);
}

/** 高速軸相對主軸中心線的偏移（傳動框架 x, y） */
export function highSpeedShaftOffset(configId = ACTIVE_GEARBOX) {
  let x = 0, y = 0;
  for (const s of GEARBOX_CONFIGS[configId].stages) {
    if (s.type !== 'parallel') continue;
    const a = s.offsetAngleDeg * DEG;
    x += centerDistance(s) * Math.cos(a);
    y += centerDistance(s) * Math.sin(a);
  }
  return [x, y];
}

/**
 * 齒輪組配置（傳動框架 xy，軸向 z）：各軸中心、行星位置。
 * 依序：行星架（= 主軸）→ 太陽齒輪軸 A → 中間軸 B → 高速軸 C。
 */
export function gearLayout(configId = ACTIVE_GEARBOX) {
  const stages = GEARBOX_CONFIGS[configId].stages;
  const pl = stages.find((st) => st.type === 'planetary');
  const par = stages.filter((st) => st.type === 'parallel');
  const shafts = [[0, 0]]; // A：與主軸同軸
  for (const st of par) {
    const a = st.offsetAngleDeg * DEG;
    const [x, y] = shafts[shafts.length - 1];
    shafts.push([x + centerDistance(st) * Math.cos(a), y + centerDistance(st) * Math.sin(a)]);
  }
  const planetRadius = centerDistance(pl);
  const planets = Array.from({ length: pl.planetCount }, (_, k) => (2 * Math.PI * k) / pl.planetCount);
  return { planetary: pl, parallel: par, shafts, planetRadius, planets };
}

/**
 * 齒輪組各節點的絕對角度（弧度，繞傳動框架 +Z），由行星架（主軸）角度 θc 推得。
 * 含「嚙合相位」：每個齒輪模型的第 0 齒朝局部 +X；相位讓相鄰齒輪在接觸線上齒對齒溝。
 *   太陽齒輪：θs = (1 + Zr/Zs)·θc（環固定）
 *   行星（自轉，絕對角）：θp = (1 − Zr/Zp)·θc + φk
 *   平行軸：θout = −θin·(Z1/Z2) + φ
 */
export function gearTrainAngles(thetaC, configId = ACTIVE_GEARBOX) {
  const { planetary: pl, parallel: par, planets } = gearLayout(configId);
  const sun = stageRatio(pl) * thetaC;
  const planetAbs = planets.map((b) => (1 - pl.ringTeeth / pl.planetTeeth) * thetaC + b + Math.PI - Math.PI / pl.planetTeeth);
  const shafts = [sun];
  for (const st of par) {
    const a = st.offsetAngleDeg * DEG;
    const z1 = st.driverTeeth, z2 = st.drivenTeeth;
    const phase = a + Math.PI - Math.PI / z2 + (a * z1) / z2;
    shafts.push(-shafts[shafts.length - 1] * (z1 / z2) + phase);
  }
  return { carrier: thetaC, sun, planetAbs, intermediate: shafts[1], high: shafts[shafts.length - 1], shafts };
}

// ---------------------------------------------------------------------
// 5. 模擬參數（教學示意值；第四階段使用）
// ---------------------------------------------------------------------
export const SIM = {
  cutInSpeed: 3.5, // m/s 切入風速
  ratedSpeed: 12.0, // m/s 額定風速
  cutOutSpeed: 25.0, // m/s 切出風速
  ratedPowerKW: 2000,
  rotorRatedRpm: 16.0,
  generatorRatedRpm: 1800, // 約略 60 Hz 四極發電機同步轉速
  maxYawRateDegPerSec: 0.5, // 真實偏航很慢（約 0.3–0.5 °/s）
  teachingYawRateDegPerSec: 6, // 教學動畫加速版，介面須標示「教學示意」
  pitchRange: [0, 90], // 度：0 = 工作位置，90 = 順槳
  maxPitchRateDegPerSec: 8,
  demoRotorRpm: 12, // 第一～三階段展示用的固定轉速：預設風速 8 m/s、葉尖速比約 7 時約 12 rpm（教學示意）
  visualMaxHighSpeedRps: 1.2,
  // 拆解模式要看齒輪「真的」咬合，所有齒輪依速比連動；為了不讓高速軸轉太快，葉輪放慢到 1.2 × 60 / 112 ≈ 0.64 rpm（教學示意） // 高速軸畫面最高每秒 1.2 圈（實際約為主軸 112 倍，太快會閃爍，因此放慢；教學示意）
  visualMaxRotorRpm: 20, // 動畫上限，避免畫面轉太快
};
// 拆解模式：齒輪依速比連動，葉輪放慢到讓高速軸剛好達到畫面上限（約 0.64 rpm，教學示意）
SIM.gearDemoRotorRpm = (SIM.visualMaxHighSpeedRps * 60) / gearboxRatio();


// ---------------------------------------------------------------------
// 6. 配色表 — 所有模組都從這裡取色
//    重要部件以「一致的顏色」區分：同一個零件在任何模式都用同一個顏色。
// ---------------------------------------------------------------------
export const PALETTE = {
  foundation: '#a9a39a',
  tower: '#e9ecef',
  towerFlange: '#c3c9cf',
  door: '#7f8a94',
  blade: '#f5f7f9',
  hub: '#cfd8e3',
  spinner: '#dfe7ef',
  nacelle: '#eef1f4',
  nacelleTrim: '#5aa0d6',
  sensor: '#f29f3d',
  mainShaft: '#3f7fd1', // 低速：藍
  bearing: '#7b8794',
  gearbox: '#3fae6a', // 齒輪：綠
  highSpeedShaft: '#9b59d0', // 高速：紫
  brake: '#e2463d', // 煞車：紅
  generatorStator: '#f2b632', // 發電機：黃
  generatorRotor: '#d98a1c',
  pitch: '#27b3a8', // 槳距：青
  yaw: '#d24f9b', // 偏航：洋紅
  controller: '#45525e',
  cable: '#ff7a1a', // 電力：亮橘
  transformer: '#8aa37b',
  soil: '#8a6a48',
  gearSun: '#2f9e5c', // 齒輪家族：深淺不同的綠
  gearPlanet: '#7fd19b',
  gearRing: '#1f7a45',
  gearCarrier: '#a7c4b2',
  gearParallel: '#56c27a',
  arrow: '#17324d', // 轉向箭頭：深藍黑，不與任何零件顏色混淆
  bedplate: '#8d98a3',
  hubBody: '#9fb0c2',
  substation: '#9aa7b3',
  fence: '#b9c2ca',
  pylon: '#7d8790',
  pole: '#8c6b4f',
  wire: '#444a50',
  ground: '#8fbf6a',
  groundFar: '#a6cf86',
  hill: '#7fb05c',
  tree: '#4e8f4a',
  trunk: '#7a5a3a',
  skyTop: '#7fb7ea',
  skyBottom: '#dcecf8',
  highlight: '#ffd400',
};

// ---------------------------------------------------------------------
// 7. 父子群組關係（場景圖）
//    world → foundation / tower / yaw → nacelle → drivetrain → rotor → blade_i → pitch_i
//    每個節點寫明父節點、局部位置、局部旋轉與（若會轉動）轉軸。
// ---------------------------------------------------------------------
export function rotorCenterLocal() {
  // 葉輪中心在機艙局部座標
  const t = DIM.drivetrain.tiltDeg * DEG;
  const [ox, oy, oz] = DIM.drivetrain.origin;
  const z = DIM.rotor.centerOnAxis;
  return [ox, oy + z * Math.sin(t), oz + z * Math.cos(t)];
}

/** 傳動框架座標 → 機艙局部座標 */
export function drivetrainToNacelle([x, y, z]) {
  const t = DIM.drivetrain.tiltDeg * DEG;
  const [ox, oy, oz] = DIM.drivetrain.origin;
  return [ox + x, oy + y * Math.cos(t) + z * Math.sin(t), oz - y * Math.sin(t) + z * Math.cos(t)];
}

/** 葉輪旋轉軸（機艙局部，指向上風，單位向量） */
export function rotorAxisLocal() {
  const t = DIM.drivetrain.tiltDeg * DEG;
  return [0, Math.sin(t), Math.cos(t)];
}

export const HIERARCHY = [
  { id: 'world', parent: null },
  { id: 'foundation', parent: 'world', position: [0, 0, 0] },
  { id: 'tower', parent: 'world', position: [0, 0, 0] },
  {
    id: 'yaw', parent: 'world', position: [0, DIM.tower.topY, 0],
    rotates: { axis: [0, 1, 0], what: '偏航角 ψ（度）' },
  },
  { id: 'nacelle', parent: 'yaw', position: [0, 0, 0] },
  {
    id: 'drivetrain', parent: 'nacelle', position: DIM.drivetrain.origin,
    rotation: [-DIM.drivetrain.tiltDeg, 0, 0], // 繞 X 轉 -tilt → 局部 +Z 往上翹
  },
  {
    id: 'lowSpeedShaft', parent: 'drivetrain', position: [0, 0, 0],
    rotates: { axis: [0, 0, 1], what: '與葉輪同角度旋轉（主軸）', sign: COORDS.rotorSpinSign },
  },
  {
    id: 'highSpeedShaft', parent: 'drivetrain', position: [...highSpeedShaftOffset(), 0],
    rotates: { axis: [0, 0, 1], what: '高速軸（含煞車盤、發電機轉子）', sign: COORDS.rotorSpinSign * gearboxDirection() },
  },
  // 齒輪組（第三階段）：行星掛在主軸（行星架）上；太陽齒輪軸、中間軸各自轉動；末級小齒輪在高速軸上
  {
    id: 'sunShaft', parent: 'drivetrain', position: [...gearLayout().shafts[0], 0],
    rotates: { axis: [0, 0, 1], what: '太陽齒輪 + 第一級平行軸大齒輪', sign: COORDS.rotorSpinSign },
  },
  {
    id: 'intermediateShaft', parent: 'drivetrain', position: [...gearLayout().shafts[1], 0],
    rotates: { axis: [0, 0, 1], what: '中間軸（第一級小齒輪 + 第二級大齒輪）', sign: -COORDS.rotorSpinSign },
  },
  ...gearLayout().planets.map((b, k) => ({
    id: `planet${k}`, parent: 'lowSpeedShaft',
    position: [gearLayout().planetRadius * Math.cos(b), gearLayout().planetRadius * Math.sin(b), gearLayout().planetary.z],
    rotates: { axis: [0, 0, 1], what: '行星齒輪自轉（並隨行星架公轉）' },
  })),
  {
    id: 'rotor', parent: 'drivetrain', position: [0, 0, DIM.rotor.centerOnAxis],
    rotates: { axis: [0, 0, 1], what: '葉輪方位角（從上風看順時針）', sign: COORDS.rotorSpinSign },
  },
  ...Array.from({ length: DIM.rotor.bladeCount }, (_, i) => ({
    id: `blade${i}`, parent: 'rotor', position: [0, 0, 0],
    // 先繞葉輪軸分配 0°/120°/240°，再繞局部 X 轉錐角（葉尖往上風）
    rotation: [DIM.rotor.coneDeg, 0, i * 360 / DIM.rotor.bladeCount],
    rotationOrder: 'ZXY',
  })),
  ...Array.from({ length: DIM.rotor.bladeCount }, (_, i) => ({
    id: `pitch${i}`, parent: `blade${i}`, position: [0, DIM.blade.rootR, 0],
    rotates: { axis: [0, 1, 0], what: '槳距角 β（度）', sign: COORDS.pitchSign },
  })),
];

export function hubHeight() {
  return DIM.tower.topY + rotorCenterLocal()[1];
}

// ---------------------------------------------------------------------
// 8. 零件清單（id 對應學習資料 src/learning/partsData.js 與配色）
//    stage：第幾階段開始出現在模型中
//    group：exterior / internal / electrical
// ---------------------------------------------------------------------
export const PARTS = [
  { id: 'foundation', colorKey: 'foundation', group: 'exterior', stage: 1, node: 'foundation' },
  { id: 'tower', colorKey: 'tower', group: 'exterior', stage: 1, node: 'tower' },
  { id: 'blade', colorKey: 'blade', group: 'exterior', stage: 1, node: 'pitch*' },
  { id: 'hub', colorKey: 'spinner', group: 'exterior', stage: 1, node: 'rotor' },
  { id: 'nacelle', colorKey: 'nacelle', group: 'exterior', stage: 1, node: 'nacelle' },
  { id: 'anemometer', colorKey: 'sensor', group: 'exterior', stage: 1, node: 'nacelle' },
  { id: 'windVane', colorKey: 'sensor', group: 'exterior', stage: 1, node: 'nacelle' },
  { id: 'transformer', colorKey: 'transformer', group: 'electrical', stage: 1, node: 'world' },
  { id: 'powerLine', colorKey: 'wire', group: 'electrical', stage: 1, node: 'world' },
  { id: 'substation', colorKey: 'substation', group: 'electrical', stage: 3, node: 'world' },
  // 以下第二階段起出現（資料先定義）
  { id: 'mainShaft', colorKey: 'mainShaft', group: 'internal', stage: 2, node: 'drivetrain' },
  { id: 'mainBearing', colorKey: 'bearing', group: 'internal', stage: 2, node: 'drivetrain' },
  { id: 'gearbox', colorKey: 'gearbox', group: 'internal', stage: 2, node: 'drivetrain' },
  { id: 'highSpeedShaft', colorKey: 'highSpeedShaft', group: 'internal', stage: 2, node: 'drivetrain' },
  { id: 'brake', colorKey: 'brake', group: 'internal', stage: 2, node: 'drivetrain' },
  { id: 'generator', colorKey: 'generatorStator', group: 'internal', stage: 2, node: 'drivetrain' },
  { id: 'pitchSystem', colorKey: 'pitch', group: 'internal', stage: 2, node: 'rotor' },
  { id: 'yawSystem', colorKey: 'yaw', group: 'internal', stage: 2, node: 'nacelle' },
  { id: 'controller', colorKey: 'controller', group: 'electrical', stage: 2, node: 'nacelle' },
  { id: 'powerCable', colorKey: 'cable', group: 'electrical', stage: 2, node: 'tower' },
  { id: 'undergroundCable', colorKey: 'cable', group: 'electrical', stage: 2, node: 'world' },
  // 第三階段：齒輪箱內部
  { id: 'sunGear', colorKey: 'gearSun', group: 'gears', stage: 3, node: 'sunShaft' },
  { id: 'planetGear', colorKey: 'gearPlanet', group: 'gears', stage: 3, node: 'planet*' },
  { id: 'ringGear', colorKey: 'gearRing', group: 'gears', stage: 3, node: 'drivetrain' },
  { id: 'carrier', colorKey: 'gearCarrier', group: 'gears', stage: 3, node: 'lowSpeedShaft' },
  { id: 'parallelGears', colorKey: 'gearParallel', group: 'gears', stage: 3, node: 'intermediateShaft' },
];

// 零件連接關係（給結構圖與測試）：a 帶動 / 連接 b
export const CONNECTIONS = [
  { from: 'blade', to: 'hub', kind: 'mech', label: '葉片固定在輪轂（經變槳軸承）' },
  { from: 'pitchSystem', to: 'blade', kind: 'control', label: '轉動葉片改變槳距' },
  { from: 'hub', to: 'mainShaft', kind: 'mech', label: '輪轂帶動主軸（低速）' },
  { from: 'mainBearing', to: 'mainShaft', kind: 'support', label: '軸承撐住主軸' },
  { from: 'mainShaft', to: 'gearbox', kind: 'mech', label: '低速輸入' },
  { from: 'mainShaft', to: 'carrier', kind: 'mech', label: '主軸帶動行星架' },
  { from: 'carrier', to: 'planetGear', kind: 'mech', label: '行星繞著轉' },
  { from: 'ringGear', to: 'planetGear', kind: 'mech', label: '環固定，行星沿著它滾' },
  { from: 'planetGear', to: 'sunGear', kind: 'mech', label: '×5' },
  { from: 'sunGear', to: 'parallelGears', kind: 'mech', label: '×4、×5.6' },
  { from: 'parallelGears', to: 'highSpeedShaft', kind: 'mech', label: '末級小齒輪' },
  { from: 'gearbox', to: 'highSpeedShaft', kind: 'mech', label: '加速約 112 倍（教學示意）' },
  { from: 'brake', to: 'highSpeedShaft', kind: 'control', label: '必要時煞住' },
  { from: 'highSpeedShaft', to: 'generator', kind: 'mech', label: '高速帶動轉子' },
  { from: 'generator', to: 'powerCable', kind: 'power', label: '電能' },
  { from: 'powerCable', to: 'undergroundCable', kind: 'power', label: '沿塔架往下到塔底' },
  { from: 'undergroundCable', to: 'transformer', kind: 'power', label: '埋在地下' },
  { from: 'transformer', to: 'powerLine', kind: 'power', label: '升壓後經地下電纜接上電桿' },
  { from: 'powerLine', to: 'substation', kind: 'power', label: '匯集後再升壓，經高壓鐵塔送往城市' },
  { from: 'anemometer', to: 'controller', kind: 'signal', label: '風速' },
  { from: 'windVane', to: 'controller', kind: 'signal', label: '風向' },
  { from: 'controller', to: 'pitchSystem', kind: 'signal', label: '調整槳距' },
  { from: 'controller', to: 'yawSystem', kind: 'signal', label: '轉向對風' },
  { from: 'controller', to: 'brake', kind: 'signal', label: '煞車指令' },
  { from: 'yawSystem', to: 'nacelle', kind: 'mech', label: '轉動整個機艙' },
  { from: 'nacelle', to: 'tower', kind: 'support', label: '架在塔架頂端（偏航軸承）' },
  { from: 'tower', to: 'foundation', kind: 'support', label: '固定在基礎上' },
];

// ---------------------------------------------------------------------
// 9. 難度設定（文字、學習資料、挑戰依難度分層；前五階段只填國小版）
// ---------------------------------------------------------------------
export const DIFFICULTIES = {
  elementary: { label: '國小探索', enabled: true },
  junior: { label: '國中挑戰', enabled: false }, // 第六階段開放
};
export const DEFAULT_DIFFICULTY = 'elementary';

// ---------------------------------------------------------------------
// 10. 互動模式
// ---------------------------------------------------------------------
export const MODES = {
  exterior: { label: '外觀探索', stage: 1 },
  cutaway: { label: '機艙剖視', stage: 2 },
  explode: { label: '機械拆解', stage: 3 },
  experiment: { label: '發電實驗', stage: 4 },
};
export const CURRENT_STAGE = 3;

// ---------------------------------------------------------------------
// 11. 視角與渲染
// ---------------------------------------------------------------------
export const VIEW = {
  fovDeg: 45,
  near: 0.3,
  far: 2500,
  maxPixelRatio: 2,
  defaultTarget: [0, 62, 0],
  defaultCamera: [-108, 74, 140],
  presets: {
    front: { target: [0, 62, 0], camera: [0, 66, 178] },
    side: { target: [0, 62, 0], camera: [178, 66, 4] },
    nacelle: { target: [0, 80, 0], camera: [-16, 86, 18] },
    cutaway: { target: [0, 80.4, -1.0], camera: [-11.5, 86, -4.5] },
    cable: { target: [11, 2, 8], camera: [-6, 15, 33] },
    grid: { target: [122, 8, 73], camera: [62, 34, 128] },
    explode: { target: [0, 81.2, -2.0], camera: [-15.5, 88.5, -7.5] },
  },
  fitHalfWidth: { full: 52, nacelle: 9, cutaway: 7, cable: 18, explode: 10, grid: 40 }, // 預設視角至少要看到的半寬（直式手機會自動拉遠）
  minDistance: 4,
  maxDistance: 340,
  focusDurationSec: 0.9,
};

// ---------------------------------------------------------------------
// 12. 機械拆解（爆炸圖）位移：鍵 = 網格的 explodeKey（預設為零件 id），值 = 在網格父節點座標中的位移（公尺）
//     在會轉動的節點（主軸、高速軸）底下的網格只能沿 z 軸移動，否則會跟著轉（測試檢查）。
// ---------------------------------------------------------------------
export const EXPLODE = {
  durationSec: 1.2,
  offsets: {
    gearbox: [0, 3.2, 0], // 齒輪箱外殼往上打開，露出齒輪
    mainBearing: [0, 1.8, 0],
    mainShaft: [0, 0, 2.4],
    highSpeedShaft: [0, 0, -0.9],
    brake: [0, 0, -1.5],
    generatorRotor: [0, 0, -2.3], // 轉子從定子裡滑出來
    generator: [0, 0, -3.8],
    controller: [0, 1.7, 0],
  },
  nodeOffsets: { rotor: [0, 0, 4.5] }, // 整個葉輪往前移開
  rotatingNodes: ['lowSpeedShaft', 'highSpeedShaft', 'sunShaft', 'intermediateShaft', 'rotor'],
  // 「看齒輪」：暫時藏起擋住齒輪的零件，並從前方斜上看（傳動框架方向，前方 = +z）
  gearView: { hide: ['gearbox', 'mainShaft', 'mainBearing', 'yawSystem'], dir: [-0.42, 0.42, 0.8] },
};

export const ANIMATION = {
  speeds: [1, 0.5, 0.25], // 正常 / 慢動作 / 超慢動作
};

export const RANDOM_SEED = 20261022; // 場景點綴（樹、小丘）使用固定種子

// ---------------------------------------------------------------------
// 葉片斷面函式（模型與測試共用）
// ---------------------------------------------------------------------
const smooth = (a, b, x) => {
  const t = Math.min(1, Math.max(0, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
};

/** 半徑 r（距旋轉中心）處的弦長、扭轉角、相對厚度、圓→翼型混合比 */
export function bladeSectionAt(r) {
  const b = DIM.blade;
  const R = DIM.rotor.radius;
  // 圓柱段 → 最大弦長：平滑過渡；最大弦長 → 葉尖：線性漸縮
  let chord;
  if (r <= b.cylinderEndR) chord = b.rootDiameter;
  else if (r <= b.maxChordR) chord = b.rootDiameter + (b.maxChord - b.rootDiameter) * smooth(b.cylinderEndR, b.maxChordR, r);
  else chord = b.maxChord + (b.tipChord - b.maxChord) * ((r - b.maxChordR) / (R - b.maxChordR));
  const twistDeg = r <= b.maxChordR
    ? b.twistRootDeg
    : b.twistRootDeg + (b.twistTipDeg - b.twistRootDeg) * Math.pow((r - b.maxChordR) / (R - b.maxChordR), 0.8);
  const blend = smooth(b.cylinderEndR, b.maxChordR, r); // 0 = 圓，1 = 翼型
  const thickness = r <= b.maxChordR
    ? 1 + (b.thicknessMax - 1) * blend
    : b.thicknessMax + (b.thicknessTip - b.thicknessMax) * Math.pow((r - b.maxChordR) / (R - b.maxChordR), 0.6);
  return { chord, twistDeg, thickness, blend };
}
