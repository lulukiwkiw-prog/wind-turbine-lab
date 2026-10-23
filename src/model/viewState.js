// 依集中狀態切換模型的顯示方式（只改 visible 與材質透明度，不重建幾何）
//   - 內部零件（userData.internal）在剖視與拆解模式顯示
//   - 齒輪與轉向箭頭（userData.gear / arrow）只在拆解模式顯示
//   - 外殼（userData.shell）：實心／透明；「拿掉」時機艙外殼與導流罩隱藏，塔架等保持透明
//   - 拆解模式可隱藏個別零件（hiddenParts）或只看一個零件（soloPart）
export const SHELL_OPACITY = 0.2;

export function createViewController({ root, mats }) {
  const meshes = [];
  root.traverse((o) => {
    if (o.isMesh && (o.userData.partId || o.userData.arrow)) meshes.push(o);
  });

  return {
    apply(state) {
      const explode = state.mode === 'explode';
      const inside = state.mode === 'cutaway' || explode;
      const hidden = new Set(explode ? state.hiddenParts : []);
      const solo = explode ? state.soloPart : null;
      for (const m of meshes) {
        const u = m.userData;
        let v = true;
        if (u.internal) v = inside;
        if (u.gear) v = explode;
        if (u.arrow) v = explode && !solo;
        if (u.shell === true && inside && state.shellView === 'hidden') v = false;
        if (u.partId && (hidden.has(u.partId) || (solo && u.partId !== solo))) v = false;
        m.visible = v;
      }
      mats.setShellOpacity(state.shellView === 'solid' ? 1 : SHELL_OPACITY);
    },
  };
}

/** 物件與所有祖先都可見才算看得到 */
export function isShown(o) {
  for (let p = o; p; p = p.parent) if (!p.visible) return false;
  return true;
}
