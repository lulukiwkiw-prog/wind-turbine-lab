// 可以拖曳移動的視窗：上方加一條「拖我移動」把手；移動後出現「歸位」按鈕。
// 位置（相對原本位置的位移，px）存在集中 store 的 panelPos，依「手機／桌面」版面分開記；
// 用 CSS translate 屬性位移，不影響各視窗原本的版面與 transform。視窗不會被拖出畫面。

const MIN_VISIBLE = 56; // 視窗至少留這麼高在畫面內（看得到把手）

export function makeDraggable(panel, { name, store }) {
  const handle = document.createElement('div');
  handle.className = 'drag-handle';
  handle.setAttribute('title', '按住拖曳，可以移動這個視窗');
  const grip = document.createElement('span');
  grip.className = 'drag-grip';
  grip.innerHTML = '<i aria-hidden="true">⠿</i>拖我移動';
  const reset = document.createElement('button');
  reset.type = 'button';
  reset.className = 'btn drag-reset';
  reset.textContent = '歸位';
  reset.setAttribute('aria-label', '把視窗移回原本的位置');
  handle.append(grip, reset);
  panel.prepend(handle);
  panel.classList.add('draggable');

  const keyFor = () => `${name}:${window.innerWidth <= 720 ? 'm' : 'd'}`;
  const saved = () => store.get().panelPos[keyFor()] ?? null;

  /** 把位移限制在畫面內（視窗沒顯示時不處理） */
  function clamp(off) {
    panel.style.translate = '0px 0px';
    const r = panel.getBoundingClientRect();
    if (!r.width) return off;
    const w = window.innerWidth, h = window.innerHeight;
    const x = Math.min(Math.max(off.x, -r.left), Math.max(-r.left, w - r.right));
    const y = Math.min(Math.max(off.y, -r.top), h - MIN_VISIBLE - r.top);
    return { x: Math.round(x), y: Math.round(y) };
  }

  function show(off) {
    panel.style.translate = off ? `${off.x}px ${off.y}px` : '';
    panel.dataset.moved = off ? '1' : '';
    reset.hidden = !off;
  }

  /** 依 store 套用位置；超出畫面（例如手機轉向）就拉回來並記住 */
  function apply() {
    const off = saved();
    if (!off) { show(null); return; }
    const c = clamp(off);
    show(c);
    if (c.x !== off.x || c.y !== off.y) store.set({ panelPos: { ...store.get().panelPos, [keyFor()]: c } });
  }

  let drag = null;
  handle.addEventListener('pointerdown', (e) => {
    if (e.target.closest('.drag-reset') || !e.isPrimary) return;
    e.preventDefault();
    handle.setPointerCapture(e.pointerId);
    drag = { id: e.pointerId, sx: e.clientX, sy: e.clientY, start: saved() ?? { x: 0, y: 0 }, cur: null };
    panel.classList.add('dragging');
  });
  handle.addEventListener('pointermove', (e) => {
    if (!drag || e.pointerId !== drag.id) return;
    drag.cur = clamp({ x: drag.start.x + e.clientX - drag.sx, y: drag.start.y + e.clientY - drag.sy });
    show(drag.cur);
  });
  const end = (e) => {
    if (!drag || e.pointerId !== drag.id) return;
    const moved = drag.cur && (Math.abs(drag.cur.x) > 2 || Math.abs(drag.cur.y) > 2);
    const cur = drag.cur;
    drag = null;
    panel.classList.remove('dragging');
    const pos = { ...store.get().panelPos };
    if (moved) pos[keyFor()] = cur;
    else if (cur) delete pos[keyFor()]; // 拖回原位附近：當成歸位
    store.set({ panelPos: pos });
    apply();
  };
  handle.addEventListener('pointerup', end);
  handle.addEventListener('pointercancel', end);
  reset.addEventListener('click', () => {
    const pos = { ...store.get().panelPos };
    delete pos[keyFor()];
    store.set({ panelPos: pos });
  });

  // 視窗打開、內容改變、畫面轉向時重新檢查位置
  let queued = false;
  const later = () => {
    if (queued) return;
    queued = true;
    requestAnimationFrame(() => { queued = false; if (!drag) apply(); });
  };
  store.subscribe(later);
  window.addEventListener('resize', later);
  later();
  return { handle, reset, apply };
}
