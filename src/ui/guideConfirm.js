// 自動導覽播放中，小朋友點了畫面或其他按鈕：先暫停導覽，跳出「要停止自動導覽嗎？」確認。
// 選「停止，我自己玩」才停止導覽，並接著做剛剛點的動作；選「繼續導覽」就從這一段接著播。
// 拖曳轉動、縮放畫面不會打斷導覽（不經過這裡）。視窗開著與否放在集中 store 的 guideAsk。

// 這些按鈕不會打斷導覽：字幕卡與小圖本身、導覽開始／停止鈕、暫停動畫與慢動作、確認視窗
const ALLOWED = '.guide, .guide-figure, .guide-start, .guide-ask, [data-tool="pause"], [data-tool="slow"]';

const el = (tag, attrs = {}, text = '') => {
  const e = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (k === 'class') e.className = v;
    else e.setAttribute(k, v);
  }
  if (text) e.textContent = text;
  return e;
};

export function createGuideConfirm({ root, store, player }) {
  const modal = el('div', { class: 'modal guide-ask', role: 'dialog', 'aria-modal': 'true', 'aria-label': '要停止自動導覽嗎？' });
  const card = el('div', { class: 'modal-card' });
  const title = el('h2', {}, '要停止自動導覽嗎？');
  const text = el('p', { class: 'q-text' }, '停止以後，你就可以自己點零件、換玩法。');
  const nav = el('div', { class: 'learn-actions' });
  const keepBtn = el('button', { class: 'btn primary', type: 'button' }, '繼續導覽');
  const stopBtn = el('button', { class: 'btn', type: 'button' }, '停止，我自己玩');
  nav.append(keepBtn, stopBtn);
  card.append(title, text, nav);
  modal.append(card);
  modal.hidden = true;
  root.append(modal);

  let pending = null; // 停止後要接著做的動作
  let wasPaused = false;
  let bypass = false; // 停止後重新觸發剛剛點的按鈕時，不要再攔下來

  const active = () => store.get().guideStep !== null;

  /** 先暫停導覽並詢問；action：選「停止」後要做的事 */
  function ask(action) {
    if (!active()) { action?.(); return; }
    pending = action;
    if (!store.get().guideAsk) {
      wasPaused = store.get().guidePaused;
      if (!wasPaused) player.togglePause();
      store.set({ guideAsk: true });
    }
  }

  keepBtn.addEventListener('click', () => {
    pending = null;
    store.set({ guideAsk: false });
    if (!wasPaused && store.get().guidePaused) player.togglePause();
  });
  stopBtn.addEventListener('click', () => {
    const action = pending;
    pending = null;
    store.set({ guideAsk: false });
    player.stop();
    action?.();
  });

  // 介面上其他按鈕：在按鈕自己的處理之前先攔下來
  root.addEventListener('click', (e) => {
    if (bypass || !active()) return;
    const btn = e.target.closest('button');
    if (!btn || btn.closest(ALLOWED)) return;
    e.preventDefault();
    e.stopPropagation();
    ask(() => { bypass = true; try { btn.click(); } finally { bypass = false; } });
  }, true);

  store.subscribe((s) => {
    modal.hidden = !s.guideAsk;
    if (s.guideAsk && s.guideStep === null) store.set({ guideAsk: false }); // 導覽已經結束
  });

  return { ask };
}
