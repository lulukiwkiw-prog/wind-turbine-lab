// 進入點：把模型、動畫、互動、學習資料與 UI 組合起來
import * as THREE from 'three';
import './ui/style.css';
import { VIEW, PALETTE, PARTS, EXPLODE } from './spec/turbineSpec.js';
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

function focusPart(id) {
  // 零件可能正在拆開移動中：以最終位置附近聚焦（先更新世界矩陣）
  scene.updateMatrixWorld(true);
  focusBox(partBounds(id), GEAR_PARTS.has(id) ? 0.7 : CUTAWAY_PARTS.has(id) ? 1.8 : 4);
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
  const patch = { selectedPart: id, partListOpen: false };
  if (GEAR_PARTS.has(id) && s.mode !== 'explode') patch.mode = 'explode';
  else if (CUTAWAY_PARTS.has(id) && s.mode === 'exterior') patch.mode = 'cutaway';
  else if (CUTAWAY_PARTS.has(id) && s.mode === 'experiment' && s.shellView === 'solid') patch.shellView = 'transparent';
  if (s.mode === 'explode' && s.hiddenParts.includes(id)) patch.hiddenParts = s.hiddenParts.filter((x) => x !== id);
  store.set(patch);
}

const view = createViewController({ root: scene, mats });
view.apply(store.get());
const exploder = createExploder({ root: scene, nodes: turbine.nodes });

const ui = createUI({
  root: document.getElementById('ui'),
  store,
  actions: {
    resetView: () => rig.reset(),
    preset: (name) => rig.preset(name),
    selectPart,
    focusGears,
  },
});

const panel = createExperimentPanel({
  root: document.getElementById('ui'),
  store,
  actions: { preset: (name) => rig.preset(name) },
});

const picker = createPicker({
  canvas, camera: rig.camera, scene,
  onPick: (id) => store.set({ selectedPart: id }),
  skipShells: () => store.get().shellView !== 'solid',
});

// 模式／外殼／選取變化 → 顯示方式、標示與相機
store.subscribe((s, prev, changed) => {
  const modeChanged = changed.includes('mode');
  if (modeChanged) {
    const patch = {};
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

function resize() {
  const w = window.innerWidth, h = window.innerHeight;
  renderer.setSize(w, h, false);
  rig.resize(w, h);
}
window.addEventListener('resize', resize);
resize();
rig.jump('default'); // 依螢幕比例調整初始視角

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
  const dt = Math.min(clock.getDelta(), 0.1); // 切換分頁回來時避免大跳
  animator.update(dt);
  const st = store.get();
  exploder.update(dt, st.mode === 'explode' && st.exploded ? 1 : 0);
  flows.update(st.paused ? 0 : dt * st.animSpeed, st.mode === 'experiment');
  readoutT += dt;
  if (readoutT > 0.2) { readoutT = 0; panel.update(sim.get()); }
  rig.update(dt);
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
  animator,
  exploder,
  sim,
  flows,
  stats: () => ({ fps, drawCalls: renderer.info.render.calls, triangles: renderer.info.render.triangles, pixelRatio: renderer.getPixelRatio() }),
  pickAt: (x, y) => picker.pickAt(x, y),
  partIds: () => PARTS.filter((p) => partMeshes.has(p.id)).map((p) => p.id),
  ready: true,
};
