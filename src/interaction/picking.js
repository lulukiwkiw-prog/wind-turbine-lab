// 點選零件：區分「點一下」與「拖曳旋轉」，只有點一下才選取
import * as THREE from 'three';
import { isShown } from '../model/viewState.js';

const TAP_MAX_MOVE = 8; // px
const TAP_MAX_MS = 450;

export function createPicker({ canvas, camera, scene, onPick, skipShells }) {
  const ray = new THREE.Raycaster();
  const ndc = new THREE.Vector2();
  let down = null;

  function pickAt(clientX, clientY) {
    const rect = canvas.getBoundingClientRect();
    ndc.set(((clientX - rect.left) / rect.width) * 2 - 1, -((clientY - rect.top) / rect.height) * 2 + 1);
    ray.setFromCamera(ndc, camera);
    const hits = ray.intersectObjects(scene.children, true);
    for (const h of hits) {
      if (!isShown(h.object)) continue; // 隱藏的零件（例如外觀模式下的內部零件）不能點
      if (h.object.userData.shell && skipShells()) continue; // 剖視時點得到外殼後面的零件
      let o = h.object;
      while (o && !o.userData.partId) o = o.parent;
      if (o) return o.userData.partId;
      // 天空、地面等不可點選物件：繼續找後面的（天空會擋在最後面，因此若先碰到地面就停止）
      if (h.object.name === 'ground') return null;
    }
    return null;
  }

  canvas.addEventListener('pointerdown', (e) => {
    if (!e.isPrimary) { down = null; return; }
    down = { x: e.clientX, y: e.clientY, t: performance.now() };
  });
  canvas.addEventListener('pointerup', (e) => {
    if (!down || !e.isPrimary) return;
    const moved = Math.hypot(e.clientX - down.x, e.clientY - down.y);
    const quick = performance.now() - down.t < TAP_MAX_MS;
    down = null;
    if (moved <= TAP_MAX_MOVE && quick) onPick(pickAt(e.clientX, e.clientY));
  });
  canvas.addEventListener('pointercancel', () => { down = null; });

  return { pickAt };
}
