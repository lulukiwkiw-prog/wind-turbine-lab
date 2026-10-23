// 依集中狀態切換模型的顯示方式（只改 visible 與材質透明度，不重建幾何）
//   - 內部零件（userData.internal）只在剖視模式顯示
//   - 外殼（userData.shell）：實心／透明；「拿掉」時機艙外殼與導流罩隱藏，塔架與輪轂本體保持透明
export const SHELL_OPACITY = 0.2;

export function createViewController({ root, mats }) {
  const internals = [];
  const covers = [];
  root.traverse((o) => {
    if (!o.isMesh) return;
    if (o.userData.internal) internals.push(o);
    if (o.userData.shell === true) covers.push(o);
  });

  return {
    apply(state) {
      const cut = state.mode === 'cutaway';
      for (const m of internals) m.visible = cut;
      for (const m of covers) m.visible = !(cut && state.shellView === 'hidden');
      mats.setShellOpacity(state.shellView === 'solid' ? 1 : SHELL_OPACITY);
    },
    counts: () => ({ internals: internals.length, covers: covers.length }),
  };
}

/** 物件與所有祖先都可見才算看得到 */
export function isShown(o) {
  for (let p = o; p; p = p.parent) if (!p.visible) return false;
  return true;
}
