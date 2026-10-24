// 進入點：把模型、動畫、互動、學習資料與 UI 組合起來
import * as THREE from 'three';
import './ui/style.css';
import { VIEW, PALETTE, PARTS, EXPLODE, SIM } from './spec/turbineSpec.js';
import { store } from './state/store.js';
import { createMaterialRegistry } from './model/materials.js';
import { buildTurbine } from './model/turbine.js';
import { buildSite } from './model/site.js';
import { createAnimator } from './animation/animator.js';
import { createCameraRig } from './interaction/cameraRig.js';
import { createPicker } from './interaction/picking.js';
import { createUI } from './ui/ui.js';
import { createViewController } from './model/viewState.js';
import { createExploder } from './animation/exploder.js';
import { createFlows } from './animation/flows.js';
import { createExperimentPanel } from './ui/experimentPanel.js';
import { createLearnPanel } from './ui/learnPanel.js';
import { createGuidePanel } from './ui/guidePanel.js';
import { createGuideConfirm } from './ui/guideConfirm.js';
import { createGuidePlayer } from './learning/guide.js';
import { createSpeech } from './learning/speech.js';
import { missionsFor } from './learning/missions.js';
import { loadProgress, saveProgress, loadPanelPos, savePanelPos } from './learning/progress.js';

const canvas = document.getElementById('scene');
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' });
renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, VIEW.maxPixelRatio));

const scene = new THREE.Scene();
scene.background = new THREE.Color(PALETTE.skyBottom);
scene.fog = new THREE.Fog(PALETTE.skyBottom, 450, 1700);

scene.add(new THREE.HemisphereLight(0xeaf4ff, 0x5c7a45, 1.25));
const sun = new THREE.DirectionalLight(0xfff4e0, 2.0);
sun.position.set(-120, 200, 160);
scene.add(sun);

const mats = createMaterialRegistry();
const turbine = buildTurbine(mats);
scene.add(turbine.root);
scene.add(buildSite(mats));

const rig = createCameraRig(canvas, { yawAngle: () => turbine.nodes.yaw.rotation.y });
scene.userData.camera = rig.camera; // 測試用
const animator = createAnimator({ nodes: turbine.nodes, sensorParts: turbine.sensorParts, store });
const sim = animator.sim;
const flows = createFlows({ scene, nodes: turbine.nodes, sim, store });

// 零件 → 網格清單（初始化時建立一次）
const partMeshes = new Map();
scene.traverse((o) => {
  const id = o.userData.partId;
  if (o.isMesh && id) {
    if (!partMeshes.has(id)) partMeshes.set(id, []);
    partMeshes.get(id).push(o);
  }
});

function partBounds(id) {
  const box = new THREE.Box3();
  for (const m of partMeshes.get(id) ?? []) box.expandByObject(m);
  return box;
}

// 只能在剖視／拆解模式看到的零件（在外觀模式選到時自動切換）
const CUTAWAY_PARTS = new Set(PARTS.filter((p) => p.group === 'internal' || p.id === 'powerCable').map((p) => p.id));
const GEAR_PARTS = new Set(PARTS.filter((p) => p.group === 'gears').map((p) => p.id));
const INSIDE_PARTS = new Set([...CUTAWAY_PARTS, ...GEAR_PARTS]);

function focusBox(box, minR) {
  if (box.isEmpty()) return;
  const sphere = box.getBoundingSphere(new THREE.Sphere());
  rig.focusSphere(sphere.center, Math.max(sphere.radius, minR));
}

// 機艙附近的零件：葉片在機艙前面（上風側）轉，從原本的方向靠近常會被葉片擋住，
// 所以改從側後方（下風側）斜上方看；輪轂與變槳系統則從前方斜看。
const BEHIND_ROTOR_PARTS = new Set(['nacelle', 'anemometer', 'windVane', 'mainShaft', 'mainBearing', 'gearbox',
  'highSpeedShaft', 'brake', 'generator', 'controller', 'yawSystem']);
const FRONT_OF_ROTOR_PARTS = new Set(['hub', 'pitchSystem']);
function rotorSideView(id, minR) {
  const sphere = partBounds(id).getBoundingSphere(new THREE.Sphere());
  const up = new THREE.Vector3(0, 1, 0);
  const upwind = turbine.nodes.rotor.getWorldDirection(new THREE.Vector3()).setY(0).normalize();
  const side = new THREE.Vector3().crossVectors(upwind, up).normalize();
  // 挑相機目前所在的那一側，鏡頭移動比較少
  if (rig.camera.position.clone().sub(sphere.center).dot(side) < 0) side.negate();
  const along = FRONT_OF_ROTOR_PARTS.has(id) ? 0.8 : -0.55;
  const dir = upwind.multiplyScalar(along).addScaledVector(side, 0.75).addScaledVector(up, 0.4).normalize();
  rig.viewFrom(sphere.center, dir, Math.max(sphere.radius, minR));
}
function focusPart(id) {
  // 零件可能正在拆開移動中：以最終位置附近聚焦（先更新世界矩陣）
  scene.updateMatrixWorld(true);
  const minR = GEAR_PARTS.has(id) ? 0.7 : CUTAWAY_PARTS.has(id) ? 1.8 : 4;
  if (store.get().mode !== 'explode' && (BEHIND_ROTOR_PARTS.has(id) || FRONT_OF_ROTOR_PARTS.has(id))) rotorSideView(id, minR);
  else focusBox(partBounds(id), minR);
}

/** 看齒輪：藏起擋住齒輪的零件，從前方斜上看行星齒輪組（方向跟著機艙轉） */
function focusGears() {
  const s = store.get();
  const hide = EXPLODE.gearView.hide.filter((id) => !s.hiddenParts.includes(id));
  store.set({ mode: 'explode', soloPart: null, selectedPart: null, hiddenParts: [...s.hiddenParts, ...hide] });
  scene.updateMatrixWorld(true);
  const box = new THREE.Box3();
  for (const id of GEAR_PARTS) box.union(partBounds(id));
  const sphere = box.getBoundingSphere(new THREE.Sphere());
  const dir = new THREE.Vector3(...EXPLODE.gearView.dir).normalize().transformDirection(turbine.nodes.drivetrain.matrixWorld);
  rig.viewFrom(sphere.center, dir, sphere.radius * 0.8);
}

function selectPart(id) {
  const s = store.get();
  if (id === s.selectedPart) { focusPart(id); return; } // 再按一次：重新聚焦
  const patch = { selectedPart: id, openPanel: null };
  if (GEAR_PARTS.has(id) && s.mode !== 'explode') patch.mode = 'explode';
  else if (CUTAWAY_PARTS.has(id) && s.mode === 'exterior') patch.mode = 'cutaway';
  if (s.mode === 'explode' && s.hiddenParts.includes(id)) patch.hiddenParts = s.hiddenParts.filter((x) => x !== id);
  store.set(patch);
}

/**
 * 靠近看一片葉片：先把第 0 片葉片轉到水平，再從葉尖外側斜看回葉根，看得到翼型斷面。
 * 葉輪要先停住（由呼叫端暫停動畫），否則葉片會轉走。
 */
const BLADE_VIEW = { targetR: 16, camR: 51, upwind: 6, up: 2.5, lead: 0 }; // 公尺：看向半徑 targetR 處；相機在半徑 camR，往上風、上方、前緣方向偏移
function focusBlade(v = BLADE_VIEW) {
  const up = new THREE.Vector3(0, 1, 0);
  const dir = new THREE.Vector3();
  const upwind = new THREE.Vector3();
  const tip = (a) => {
    animator.setRotorAngleDeg(a);
    turbine.root.updateMatrixWorld(true);
    return dir.set(0, 1, 0).transformDirection(turbine.nodes.pitch0.matrixWorld);
  };
  turbine.root.updateMatrixWorld(true);
  turbine.nodes.rotor.getWorldDirection(upwind); // 葉輪局部 +Z = 上風
  const right = new THREE.Vector3().crossVectors(upwind, up); // 從上風看的左右，固定挑同一邊
  let best = 0, score = Infinity;
  for (let a = 0; a < 360; a += 1) {
    const d = tip(a);
    const sc = Math.abs(d.y) + (d.dot(right) < 0 ? 10 : 0);
    if (sc < score) { score = sc; best = a; }
  }
  const d = tip(best).clone();
  const lead = new THREE.Vector3(1, 0, 0).transformDirection(turbine.nodes.pitch0.matrixWorld); // 葉片前緣方向
  const hub = turbine.nodes.rotor.getWorldPosition(new THREE.Vector3());
  const target = hub.clone().addScaledVector(d, v.targetR);
  const pos = hub.clone().addScaledVector(d, v.camR).addScaledVector(upwind, v.upwind).addScaledVector(up, v.up).addScaledVector(lead, v.lead);
  rig.lookFrom(target, pos);
}

/**
 * 跟著電走：鏡頭從發電機沿著送電路徑（機艙 → 塔架裡 → 地下電纜）往下走到變壓器。
 * 鏡頭在「塔架 → 變壓器」這條線的側邊（挑下風那一側），塔架不會擋住變壓器，葉片也不會擋住鏡頭。
 */
const CABLE_FOLLOW = { durationSec: 10, side: 16, up: 4, minY: 10 };
function followCable() {
  turbine.root.updateMatrixWorld(true);
  const end = flows.transformerDistance(); // 走到變壓器
  const downwind = turbine.nodes.rotor.getWorldDirection(new THREE.Vector3()).negate().setY(0).normalize();
  const toTransformer = flows.pathPoint(end).setY(0).normalize();
  const side = new THREE.Vector3(0, 1, 0).cross(toTransformer).normalize();
  if (side.dot(downwind) < 0) side.negate();
  const target = new THREE.Vector3();
  const position = new THREE.Vector3();
  rig.followPath((u) => {
    flows.pathPoint(u * end, target);
    position.copy(target).addScaledVector(side, CABLE_FOLLOW.side);
    position.y = Math.max(target.y + CABLE_FOLLOW.up, CABLE_FOLLOW.minY); // 到地面時從斜上方看
    return { target, position };
  }, CABLE_FOLLOW.durationSec);
}

/** 地面上的零件（例如變壓器）：從塔架的另一邊看過去，塔架不會擋在中間 */
const GROUND_PARTS = new Set(['transformer', 'substation', 'undergroundCable']);
function focusAwayFromTower(id) {
  scene.updateMatrixWorld(true);
  const sphere = partBounds(id).getBoundingSphere(new THREE.Sphere());
  const dir = sphere.center.clone().setY(0);
  if (dir.lengthSq() < 1e-6) dir.set(1, 0, 0);
  dir.normalize().setY(0.45).normalize();
  rig.viewFrom(sphere.center, dir, Math.max(sphere.radius, 4));
}

const view = createViewController({ root: scene, mats });
view.apply(store.get());
const exploder = createExploder({ root: scene, nodes: turbine.nodes });

const speech = createSpeech();
const ui = createUI({
  root: document.getElementById('ui'),
  store,
  speech,
  actions: {
    resetView: () => rig.reset(),
    preset: (name) => rig.preset(name),
    selectPart,
    focusGears,
  },
});

createLearnPanel({ root: document.getElementById('ui'), store, speech });

// 學習進度：讀取這台裝置上次的進度；第一次來就顯示導覽
const saved = loadProgress();
store.set({ panelPos: loadPanelPos() }); // 使用者上次拖曳過的視窗位置
store.subscribe((s, prev, changed) => { if (changed.includes('panelPos')) savePanelPos(s.panelPos); });
let tourDone = saved.tourDone;
store.set({ missionsDone: saved.missionsDone, tourStep: tourDone || new URLSearchParams(location.search).has('notour') ? null : 0 });
store.subscribe((s, prev, changed) => {
  if (changed.includes('tourStep') && prev.tourStep !== null && s.tourStep === null) tourDone = true;
  if (changed.includes('missionsDone') || changed.includes('tourStep')) saveProgress({ missionsDone: s.missionsDone, tourDone });
});
function checkMissions() {
  const s = store.get();
  if (s.guideStep !== null) return; // 自動導覽時是導覽在操作，不替小朋友完成任務
  const ctx = { state: s, sim: sim.get() };
  const newly = missionsFor(s.difficulty).filter((m) => !s.missionsDone.includes(m.id) && m.check(ctx)).map((m) => m.id);
  if (newly.length) store.set({ missionsDone: [...s.missionsDone, ...newly] });
}

const panel = createExperimentPanel({
  root: document.getElementById('ui'),
  store,
  actions: { preset: (name) => rig.preset(name) },
});

// 自動導覽：每一段切換模式與相機，字幕＋語音說明
const guide = createGuidePlayer({
  store,
  speech,
  actions: {
    camera(spec) {
      if (spec === 'gears') focusGears();
      else if (spec === 'blade') focusBlade();
      else if (spec === 'cable') followCable();
      else if (spec.startsWith('part:') && GROUND_PARTS.has(spec.slice(5))) focusAwayFromTower(spec.slice(5));
      else if (spec.startsWith('part:')) focusPart(spec.slice(5));
      else rig.preset(spec.replace(/^preset:/, ''));
    },
    /** 快轉模擬（直接看到穩定後的樣子） */
    fastForward(sec) {
      for (let t = 0; t < sec; t += 0.1) sim.step(0.1);
    },
  },
});
const guidePanel = createGuidePanel({ root: document.getElementById('ui'), header: document.querySelector('#ui .top'), store, player: guide });
// 導覽中拖曳、縮放畫面可以照常轉；點一下畫面或其他按鈕，先暫停並問要不要停止導覽
const guideConfirm = createGuideConfirm({ root: document.getElementById('ui'), store, player: guide });

const picker = createPicker({
  canvas, camera: rig.camera, scene,
  onPick: (id) => {
    if (store.get().guideStep !== null) guideConfirm.ask(() => store.set({ selectedPart: id }));
    else store.set({ selectedPart: id });
  },
  skipShells: () => store.get().shellView !== 'solid',
});

// 模式／外殼／選取變化 → 顯示方式、標示與相機
store.subscribe((s, prev, changed) => {
  const modeChanged = changed.includes('mode');
  if (modeChanged) {
    const patch = { showSpeeds: false, showNote: false }; // 換模式時說明收起來
    if (prev.mode === 'explode') Object.assign(patch, { hiddenParts: [], soloPart: null });
    if (s.mode === 'cutaway') {
      if (s.shellView === 'solid') patch.shellView = 'transparent';
      if (GEAR_PARTS.has(s.selectedPart)) patch.selectedPart = null;
    }
    if (s.mode === 'explode') Object.assign(patch, { shellView: 'hidden', exploded: true });
    if (s.mode === 'exterior') {
      patch.shellView = 'solid';
      if (INSIDE_PARTS.has(s.selectedPart)) patch.selectedPart = null;
    }
    if (s.mode === 'experiment') {
      patch.shellView = 'solid';
      if (GEAR_PARTS.has(s.selectedPart) || CUTAWAY_PARTS.has(s.selectedPart)) patch.selectedPart = null;
    }
    store.set(patch);
  }
  if (modeChanged || changed.some((k) => ['shellView', 'hiddenParts', 'soloPart'].includes(k))) view.apply(s);
  if (changed.includes('towerXray')) mats.setPartOpacity('tower', s.towerXray ? 0.25 : 1);

  if (changed.includes('selectedPart')) {
    if (prev.selectedPart) mats.setHighlight(prev.selectedPart, 0);
    if (s.selectedPart) mats.setHighlight(s.selectedPart, 0.35);
  }
  // 相機：有新選取就聚焦它；否則切換模式時移到該模式的視角
  if (changed.includes('selectedPart') && s.selectedPart) focusPart(s.selectedPart);
  else if (modeChanged) {
    if (s.mode === 'cutaway') rig.preset('cutaway');
    else if (s.mode === 'explode') rig.preset('explode');
    else if (s.mode === 'experiment') rig.preset('experiment');
    else rig.reset();
  }
});

// 點內部零件：自動拿掉外殼，才看得到零件；取消選取（或改點外面的零件）時恢復成點之前的外殼與模式。
// 小朋友自己換模式或自己選外殼樣式，就以他的選擇為準，不再恢復。自動導覽時由導覽決定外殼。
store.subscribe((s, prev, changed) => {
  if (s.guideStep !== null) {
    if (s.peekRestore) store.set({ peekRestore: null });
    return;
  }
  const r = s.peekRestore;
  if (!changed.includes('selectedPart')) {
    const userShell = changed.includes('shellView') && !changed.includes('mode') && s.shellView !== 'hidden';
    if (r && (userShell || s.mode !== r.inMode)) store.set({ peekRestore: null });
    return;
  }
  if (CUTAWAY_PARTS.has(s.selectedPart) && s.mode !== 'explode') {
    store.set({ shellView: 'hidden', ...(r ? {} : { peekRestore: { mode: prev.mode, shellView: prev.shellView, inMode: s.mode } }) });
  } else if (r) {
    if (s.mode !== r.inMode) store.set({ peekRestore: null }); // 已經換到別的模式
    else store.set({ peekRestore: null, shellView: r.shellView, ...(r.mode !== s.mode ? { mode: r.mode } : {}) });
  }
});

function resize() {
  const w = window.innerWidth, h = window.innerHeight;
  renderer.setSize(w, h, false);
  rig.resize(w, h);
}
window.addEventListener('resize', resize);
resize();
rig.jump('default'); // 依螢幕比例調整初始視角

// 面板擋住畫面時，把 3D 畫面的中心移到「沒被擋住的區域」中央，必要時稍微縮小，讓整台風機看得到
// （手機：上方標題列與下方面板之間；桌面：左側面板右邊）。只改相機的投影位移，點選與標籤位置會跟著正確。
const xpEl = document.querySelector('.xp');
const headerEl = document.querySelector('#ui .top');
const viewShift = { cx: 0, cy: 0, scale: 1 }; // 相對螢幕中心的位移（px）與縮放
const guideEl = guidePanel.element;
function targetShift() {
  const w = window.innerWidth, h = window.innerHeight;
  if (store.get().guideStep !== null) { // 導覽字幕卡在下方：畫面中心移到標題列（和小圖）與字幕卡之間
    let top = headerEl ? headerEl.getBoundingClientRect().bottom : 0;
    let left = 0;
    // 使用者自己把字幕卡移走了：不再為它讓出下方空間
    const bottom = guideEl.dataset.moved ? h : guideEl.getBoundingClientRect().top;
    if (guidePanel.figure.classList.contains('open')) {
      const f = guidePanel.figure.getBoundingClientRect();
      if (f.width > w * 0.6) top = Math.max(top, f.bottom); // 手機：小圖在上方
      else left = f.right; // 桌面：小圖在左邊
    }
    const bandW = w - left, bandH = Math.max(80, bottom - top);
    const scale = Math.min(1, Math.max(0.5, Math.min(bandH / (h * 0.8), bandW / (w * 0.8))));
    return { cx: (left + w) / 2 - w / 2, cy: (top + bottom) / 2 - h / 2, scale };
  }
  // 使用者自己移動過發電實驗面板：照他放的位置，不再移動 3D 畫面
  if (store.get().mode !== 'experiment' || !xpEl || xpEl.hidden || xpEl.dataset.moved) return { cx: 0, cy: 0, scale: 1 };
  const r = xpEl.getBoundingClientRect();
  let left = 0, top = 0, bottom = h;
  if (r.width > w * 0.6) { // 下方面板（手機）
    bottom = r.top;
    top = headerEl ? headerEl.getBoundingClientRect().bottom : 0;
  } else {
    left = r.right; // 左側面板（桌面）
  }
  const bandW = w - left, bandH = Math.max(80, bottom - top);
  const scale = Math.min(1, Math.max(0.5, Math.min(bandH / (h * 0.8), bandW / (w * 0.8))));
  return { cx: (left + w) / 2 - w / 2, cy: (top + bottom) / 2 - h / 2, scale };
}
function updateViewShift(dt) {
  const t = targetShift();
  const k = Math.min(1, dt * 6); // 平滑移動，不突然跳
  for (const key of ['cx', 'cy', 'scale']) viewShift[key] += (t[key] - viewShift[key]) * k;
  const w = window.innerWidth, h = window.innerHeight;
  if (Math.abs(viewShift.cx) < 0.5 && Math.abs(viewShift.cy) < 0.5 && Math.abs(viewShift.scale - 1) < 0.002) {
    rig.camera.clearViewOffset();
    return;
  }
  // 完整影像縮成 scale 倍，並讓它的中心落在「沒被擋住區域」的中心
  const fw = w * viewShift.scale, fh = h * viewShift.scale;
  rig.camera.setViewOffset(fw, fh, fw / 2 - (w / 2 + viewShift.cx), fh / 2 - (h / 2 + viewShift.cy), w, h);
}

// 標籤位置：所選零件包圍盒的頂端中央
const tmp = new THREE.Vector3();
function markerScreen() {
  const id = store.get().selectedPart;
  if (!id) return null;
  const box = partBounds(id);
  if (box.isEmpty()) return null;
  box.getCenter(tmp);
  tmp.y = box.max.y;
  tmp.project(rig.camera);
  const visible = tmp.z < 1 && Math.abs(tmp.x) < 1.1 && Math.abs(tmp.y) < 1.1;
  return { visible, x: (tmp.x * 0.5 + 0.5) * window.innerWidth, y: (-tmp.y * 0.5 + 0.5) * window.innerHeight - 8 };
}

const clock = new THREE.Clock();
let frames = 0;
let fpsT = 0;
let fps = 0;
let readoutT = 1;
function frame() {
  const raw = clock.getDelta();
  const dt = Math.min(raw, 0.1); // 切換分頁回來時避免大跳
  animator.update(dt);
  const st = store.get();
  exploder.update(dt, st.mode === 'explode' && st.exploded ? 1 : 0);
  flows.update(st.paused ? 0 : dt * st.animSpeed, st.mode === 'experiment');
  readoutT += dt;
  guide.update(Math.min(raw, 1)); // 導覽計時用真實時間（不受慢動作與低幀率影響）
  if (readoutT > 0.2) {
    readoutT = 0;
    const now = sim.get();
    panel.update(now);
    guidePanel.update(now);
    checkMissions();
    // 導覽看風小、風大時：發電機發亮的程度表示發電量（教學示意）
    const scene = st.guideStep !== null ? guide.script[st.guideStep] : null;
    if (scene?.meter && st.selectedPart === 'generator') mats.setHighlight('generator', 0.05 + 0.6 * Math.min(1, Math.max(0, now.powerKW) / SIM.ratedPowerKW));
  }
  rig.update(Math.min(raw, 0.25)); // 相機移動用真實時間（低幀率時也跟得上導覽）
  updateViewShift(dt);
  renderer.render(scene, rig.camera);
  ui.placeMarker(markerScreen());
  frames++; fpsT += dt;
  if (fpsT >= 1) { fps = frames / fpsT; frames = 0; fpsT = 0; }
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);

// 測試與截圖用的介面（不影響一般使用）
window.__lab = {
  store,
  scene,
  nodes: turbine.nodes,
  jumpView: (name) => rig.jump(name),
  setRotorAngleDeg: (a) => animator.setRotorAngleDeg(a),
  selectPart,
  focusPart,
  focusGears,
  focusBlade,
  animator,
  exploder,
  sim,
  flows,
  speech,
  checkMissions,
  guide,
  viewShift: () => ({ ...viewShift }),
  stats: () => ({ fps, drawCalls: renderer.info.render.calls, triangles: renderer.info.render.triangles, pixelRatio: renderer.getPixelRatio() }),
  pickAt: (x, y) => picker.pickAt(x, y),
  /** 零件包圍盒中心在螢幕上的位置（檢查導覽時零件有沒有被字幕卡擋住） */
  partScreen: (id) => {
    const c = partBounds(id).getCenter(new THREE.Vector3()).project(rig.camera);
    return { x: (c.x * 0.5 + 0.5) * window.innerWidth, y: (-c.y * 0.5 + 0.5) * window.innerHeight, front: c.z < 1 };
  },
  partIds: () => PARTS.filter((p) => partMeshes.has(p.id)).map((p) => p.id),
  ready: true,
};
