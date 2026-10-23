// 兒童介面：大按鈕、簡短繁體中文、不需輸入文字
// UI 只讀寫集中 store，不另外保存模式／速度／選取等狀態。
import { MODES, PARTS, PALETTE, CURRENT_STAGE, ANIMATION } from '../spec/turbineSpec.js';
import { partText } from '../learning/partsData.js';
import { ICONS } from './icons.js';

const el = (tag, attrs = {}, html = '') => {
  const e = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (k === 'class') e.className = v;
    else e.setAttribute(k, v);
  }
  if (html) e.innerHTML = html;
  return e;
};

const SPEED_LABEL = { 1: '正常', 0.5: '慢動作', 0.25: '超慢' };

export function createUI({ root, store, actions }) {
  // ---------- 標題 ----------
  const header = el('header', { class: 'top' });
  header.append(el('h1', {}, `${ICONS.turbine}<span>風力發電機探索實驗室</span>`));

  // ---------- 模式切換 ----------
  const modeBar = el('nav', { class: 'modes', 'aria-label': '模式' });
  const modeButtons = {};
  for (const [id, m] of Object.entries(MODES)) {
    const locked = m.stage > CURRENT_STAGE;
    const b = el('button', { class: 'btn mode', type: 'button', 'data-mode': id },
      `${locked ? ICONS.lock : ''}<span>${m.label}</span>${locked ? '<small>即將開放</small>' : ''}`);
    if (locked) { b.disabled = true; b.setAttribute('aria-disabled', 'true'); }
    b.addEventListener('click', () => store.set({ mode: id }));
    modeButtons[id] = b;
    modeBar.append(b);
  }
  header.append(modeBar);

  // ---------- 工具列 ----------
  const tools = el('div', { class: 'tools' });
  const mk = (id, icon, label, fn) => {
    const b = el('button', { class: 'btn tool', type: 'button', 'data-tool': id, 'aria-label': label },
      `${icon}<span class="lbl">${label}</span>`);
    b.addEventListener('click', fn);
    tools.append(b);
    return b;
  };
  mk('reset', ICONS.reset, '重設視角', () => { store.set({ selectedPart: null }); actions.resetView(); });
  const pauseBtn = mk('pause', ICONS.pause, '暫停', () => store.set({ paused: !store.get().paused }));
  const slowBtn = mk('slow', ICONS.slow, '正常', () => {
    const sp = ANIMATION.speeds;
    store.set({ animSpeed: sp[(sp.indexOf(store.get().animSpeed) + 1) % sp.length] });
  });
  mk('front', ICONS.front, '正面', () => actions.preset('front'));
  mk('side', ICONS.side, '側面', () => actions.preset('side'));
  mk('nacelle', ICONS.nacelle, '看機艙', () => actions.preset('nacelle'));
  const listBtn = mk('list', ICONS.list, '零件', () => store.set({ partListOpen: !store.get().partListOpen }));

  // ---------- 零件清單 ----------
  const list = el('div', { class: 'partlist', role: 'dialog', 'aria-label': '零件清單' });
  list.append(el('h2', {}, '點一個零件看看'));
  const grid = el('div', { class: 'grid' });
  const listButtons = {};
  for (const p of PARTS.filter((q) => q.stage <= CURRENT_STAGE)) {
    const t = partText(p.id, store.get().difficulty);
    const b = el('button', { class: 'btn chip', type: 'button', 'data-part': p.id },
      `<i class="dot" style="background:${PALETTE[p.colorKey]}"></i><span>${t.name}</span>`);
    b.addEventListener('click', () => store.set({ selectedPart: p.id, partListOpen: false }));
    listButtons[p.id] = b;
    grid.append(b);
  }
  list.append(grid);

  // ---------- 零件介紹卡 ----------
  const info = el('section', { class: 'info', 'aria-live': 'polite' });
  const infoHead = el('div', { class: 'info-head' });
  const infoDot = el('i', { class: 'dot big' });
  const infoName = el('h2');
  const closeBtn = el('button', { class: 'btn icon', type: 'button', 'aria-label': '關閉' }, ICONS.close);
  closeBtn.addEventListener('click', () => store.set({ selectedPart: null }));
  infoHead.append(infoDot, infoName, closeBtn);
  const infoShort = el('p', { class: 'short' });
  const moreBtn = el('button', { class: 'btn more', type: 'button' });
  moreBtn.addEventListener('click', () => store.set({ infoExpanded: !store.get().infoExpanded }));
  const infoMore = el('p', { class: 'more-text' });
  const infoNote = el('p', { class: 'note' });
  info.append(infoHead, infoShort, moreBtn, infoMore, infoNote);

  // ---------- 提示 ----------
  const hint = el('div', { class: 'hint' }, '用手指拖曳可以轉動，兩指可以放大縮小。點一下零件看看它是什麼！');

  // ---------- 零件標籤（跟著 3D 位置移動） ----------
  const marker = el('div', { class: 'marker' });

  root.append(header, tools, list, info, hint, marker);

  function render(s) {
    for (const [id, b] of Object.entries(modeButtons)) b.classList.toggle('active', id === s.mode);
    pauseBtn.innerHTML = `${s.paused ? ICONS.play : ICONS.pause}<span class="lbl">${s.paused ? '播放' : '暫停'}</span>`;
    pauseBtn.setAttribute('aria-label', s.paused ? '播放' : '暫停');
    pauseBtn.classList.toggle('on', s.paused);
    slowBtn.querySelector('.lbl').textContent = SPEED_LABEL[s.animSpeed];
    slowBtn.classList.toggle('on', s.animSpeed !== 1);
    listBtn.classList.toggle('on', s.partListOpen);
    list.classList.toggle('open', s.partListOpen);
    for (const [id, b] of Object.entries(listButtons)) b.classList.toggle('active', id === s.selectedPart);

    const t = s.selectedPart && partText(s.selectedPart, s.difficulty);
    info.classList.toggle('open', !!t);
    if (t) {
      const p = PARTS.find((q) => q.id === s.selectedPart);
      infoDot.style.background = PALETTE[p.colorKey];
      infoName.textContent = t.name;
      infoShort.textContent = t.short;
      infoMore.textContent = t.more;
      infoMore.hidden = !s.infoExpanded;
      infoNote.textContent = t.note ? `教學示意：${t.note}` : '';
      infoNote.hidden = !t.note || !s.infoExpanded;
      moreBtn.innerHTML = s.infoExpanded ? `${ICONS.less}<span>收起來</span>` : `${ICONS.more}<span>看更多</span>`;
      marker.textContent = t.name;
      hint.classList.add('gone');
    }
    marker.classList.toggle('show', !!t);
  }
  store.subscribe(render);
  render(store.get());

  return {
    /** 每幀更新零件標籤位置（screen 為 {x, y, visible}） */
    placeMarker(screen) {
      if (!screen || !screen.visible) { marker.style.opacity = '0'; return; }
      marker.style.opacity = '';
      marker.style.transform = `translate(${screen.x}px, ${screen.y}px) translate(-50%, -100%)`;
    },
  };
}
