// 機械拆解（爆炸圖）：依 EXPLODE 表平滑移動零件，只改位置，不重建幾何
import * as THREE from 'three';
import { EXPLODE } from '../spec/turbineSpec.js';

const ease = (t) => (t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2);

export function createExploder({ root, nodes }) {
  const items = [];
  root.traverse((o) => {
    if (!o.isMesh) return;
    const key = o.userData.explodeKey ?? o.userData.partId;
    const off = key && EXPLODE.offsets[key];
    if (off) items.push({ obj: o, base: o.position.clone(), off: new THREE.Vector3(...off) });
  });
  for (const [id, off] of Object.entries(EXPLODE.nodeOffsets)) {
    items.push({ obj: nodes[id], base: nodes[id].position.clone(), off: new THREE.Vector3(...off) });
  }
  let t = 0;

  function apply() {
    const k = ease(t);
    for (const it of items) it.obj.position.copy(it.base).addScaledVector(it.off, k);
  }

  return {
    /** target：1 = 拆開，0 = 合起來（介面操作，不受動畫暫停影響） */
    update(dt, target) {
      if (t === target) return;
      const step = dt / EXPLODE.durationSec;
      t = target > t ? Math.min(target, t + step) : Math.max(target, t - step);
      apply();
    },
    setInstant(v) { t = v; apply(); },
    amount: () => t,
    count: () => items.length,
  };
}
