// 進入點：把模型、動畫、互動、學習資料與 UI 組合起來
import * as THREE from 'three';
import './ui/style.css';
import { VIEW, PALETTE, PARTS } from './spec/turbineSpec.js';
import { store } from './state/store.js';
import { createMaterialRegistry } from './model/materials.js';
import { buildTurbine } from './model/turbine.js';
import { buildSite } from './model/site.js';
import { createAnimator } from './animation/animator.js';
import { createCameraRig } from './interaction/cameraRig.js';
import { createPicker } from './interaction/picking.js';
import { createUI } from './ui/ui.js';
import { createViewController } from './model/viewState.js';

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

const rig = createCameraRig(canvas);
scene.userData.camera = rig.camera; // 測試用
const animator = createAnimator({ nodes: turbine.nodes, sensorParts: turbine.sensorParts, store });

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

// 只能在剖視模式看到的零件（在外觀模式選到時自動切換到剖視）
const CUTAWAY_PARTS = new Set(PARTS.filter((p) => p.group === 'internal' || p.id === 'powerCable').map((p) => p.id));

function focusPart(id) {
  const box = partBounds(id);
  if (box.isEmpty()) return;
  const sphere = box.getBoundingSphere(new THREE.Sphere());
  rig.focusSphere(sphere.center, Math.max(sphere.radius, CUTAWAY_PARTS.has(id) ? 1.8 : 4));
}

function selectPart(id) {
  const s = store.get();
  if (id === s.selectedPart) { focusPart(id); return; } // 再按一次：重新聚焦
  const patch = { selectedPart: id, partListOpen: false };
  if (CUTAWAY_PARTS.has(id) && s.mode !== 'cutaway') patch.mode = 'cutaway';
  store.set(patch);
}

const view = createViewController({ root: scene, mats });
view.apply(store.get());

const ui = createUI({
  root: document.getElementById('ui'),
  store,
  actions: {
    resetView: () => rig.reset(),
    preset: (name) => rig.preset(name),
    selectPart,
  },
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
    if (s.mode === 'cutaway' && s.shellView === 'solid') store.set({ shellView: 'transparent' });
    if (s.mode === 'exterior') {
      const patch = { shellView: 'solid' };
      if (CUTAWAY_PARTS.has(s.selectedPart)) patch.selectedPart = null;
      store.set(patch);
    }
  }
  if (modeChanged || changed.includes('shellView')) view.apply(s);

  if (changed.includes('selectedPart')) {
    if (prev.selectedPart) mats.setHighlight(prev.selectedPart, 0);
    if (s.selectedPart) mats.setHighlight(s.selectedPart, 0.35);
  }
  // 相機：有新選取就聚焦它；否則切換模式時移到該模式的視角
  if (changed.includes('selectedPart') && s.selectedPart) focusPart(s.selectedPart);
  else if (modeChanged) {
    if (s.mode === 'cutaway') rig.preset('cutaway');
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
function frame() {
  const dt = Math.min(clock.getDelta(), 0.1); // 切換分頁回來時避免大跳
  animator.update(dt);
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
  animator,
  stats: () => ({ fps, drawCalls: renderer.info.render.calls, triangles: renderer.info.render.triangles, pixelRatio: renderer.getPixelRatio() }),
  pickAt: (x, y) => picker.pickAt(x, y),
  partIds: () => PARTS.filter((p) => partMeshes.has(p.id)).map((p) => p.id),
  ready: true,
};
