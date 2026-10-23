// 材質登錄：顏色一律取自 PALETTE。
// 每個「零件」有自己的材質實例（只在初始化時建立），讓選取標示只影響該零件；
// 同一零件的多個網格共用同一個材質。
import * as THREE from 'three';
import { PALETTE } from '../spec/turbineSpec.js';

const HIGHLIGHT = new THREE.Color(PALETTE.highlight);

export function createMaterialRegistry() {
  const byPart = new Map(); // partId → Map(variantKey → material)
  const scenery = new Map(); // 不可點選的場景材質（可跨物件共用）

  function color(key) {
    if (!(key in PALETTE)) throw new Error(`PALETTE 沒有顏色：${key}`);
    return new THREE.Color(PALETTE[key]);
  }

  return {
    color,
    /** 取得零件材質；同一 partId + colorKey + 參數只建立一次 */
    part(partId, colorKey, opts = {}) {
      if (!byPart.has(partId)) byPart.set(partId, new Map());
      const variants = byPart.get(partId);
      const key = `${colorKey}|${opts.metalness ?? 0.1}|${opts.roughness ?? 0.6}|${opts.side ?? 0}`;
      if (!variants.has(key)) {
        variants.set(key, new THREE.MeshStandardMaterial({
          color: color(colorKey),
          metalness: opts.metalness ?? 0.1,
          roughness: opts.roughness ?? 0.6,
          side: opts.side ?? THREE.FrontSide,
          flatShading: opts.flatShading ?? false,
        }));
      }
      return variants.get(key);
    },
    scenery(colorKey, opts = {}) {
      const key = `${colorKey}|${JSON.stringify(opts)}`;
      if (!scenery.has(key)) {
        scenery.set(key, new THREE.MeshStandardMaterial({
          color: color(colorKey), roughness: 0.95, metalness: 0, ...opts,
        }));
      }
      return scenery.get(key);
    },
    /** 標示/取消標示零件（只改材質的 emissive，不重建任何東西） */
    setHighlight(partId, amount) {
      const variants = byPart.get(partId);
      if (!variants) return;
      for (const m of variants.values()) {
        m.emissive.copy(HIGHLIGHT);
        m.emissiveIntensity = amount;
      }
    },
    partIds: () => [...byPart.keys()],
  };
}
