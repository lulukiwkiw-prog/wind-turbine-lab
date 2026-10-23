// 兒童介面：大按鈕、簡短繁體中文、不需輸入文字
// UI 只讀寫集中 store，不另外保存模式／速度／選取等狀態。
import {
  MODES, PARTS, PALETTE, CURRENT_STAGE, ANIMATION, COORDS, GEARBOX_CONFIGS, ACTIVE_GEARBOX, gearboxRatio, stageRatio, stageDirection,
} from '../spec/turbineSpec.js';
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
const GROUP_TITLE = { exterior: '外觀', internal: '機艙裡面', gears: '齒輪箱裡面', electrical: '電力' };

export function createUI({ root, store, actions, speech }) {
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
  const toggle = (name) => store.set({ openPanel: store.get().openPanel === name ? null : name });
  const viewsBtn = mk('views', ICONS.views, '視角', () => toggle('views'));
  const listBtn = mk('list', ICONS.list, '零件', () => toggle('parts'));
  const learnBtn = mk('learn', ICONS.learn, '學習', () => toggle('learn'));

  // ---------- 視角選單 ----------
  const viewMenu = el('div', { class: 'partlist viewmenu', role: 'dialog', 'aria-label': '視角' });
  viewMenu.append(el('h2', {}, '從哪裡看？'));
  const viewGrid = el('div', { class: 'grid' });
  for (const [id, icon, label] of [['front', ICONS.front, '正面'], ['side', ICONS.side, '側面'], ['nacelle', ICONS.nacelle, '看機艙']]) {
    const b = el('button', { class: 'btn chip', type: 'button', 'data-view': id }, `${icon}<span>${label}</span>`);
    b.addEventListener('click', () => { store.set({ openPanel: null }); actions.preset(id); });
    viewGrid.append(b);
  }
  viewMenu.append(viewGrid);

  // ---------- 零件清單（依外觀／機艙內部／電力分組） ----------
  const list = el('div', { class: 'partlist', role: 'dialog', 'aria-label': '零件清單' });
  list.append(el('h2', {}, '點一個零件看看'));
  const listButtons = {};
  for (const [group, title] of Object.entries(GROUP_TITLE)) {
    const parts = PARTS.filter((q) => q.stage <= CURRENT_STAGE && q.group === group);
    if (!parts.length) continue;
    list.append(el('h3', {}, title));
    const grid = el('div', { class: 'grid' });
    for (const p of parts) {
      const t = partText(p.id, store.get().difficulty);
      const b = el('button', { class: 'btn chip', type: 'button', 'data-part': p.id },
        `<i class="dot" style="background:${PALETTE[p.colorKey]}"></i><span>${t.name}</span>`);
      b.addEventListener('click', () => actions.selectPart(p.id));
      listButtons[p.id] = b;
      grid.append(b);
    }
    list.append(grid);
  }

  // ---------- 剖視工具列 ----------
  const cutbar = el('div', { class: 'cutbar', role: 'toolbar', 'aria-label': '機艙剖視' });
  const cutBtn = (id, label, fn, cls = '') => {
    const b = el('button', { class: `btn cut ${cls}`, type: 'button', 'data-cut': id }, label);
    b.addEventListener('click', fn);
    cutbar.append(b);
    return b;
  };
  cutBtn('back', '返回外觀', () => store.set({ mode: 'exterior', selectedPart: null }), 'back');
  const seeBtn = cutBtn('transparent', '外殼透明', () => store.set({ shellView: 'transparent' }));
  const hideBtn = cutBtn('hidden', '拿掉外殼', () => store.set({ shellView: 'hidden' }));
  cutBtn('gearbox', '看齒輪箱', () => actions.selectPart('gearbox'));
  cutBtn('generator', '看發電機', () => actions.selectPart('generator'));
  cutBtn('pitch', '看輪轂裡面', () => actions.selectPart('pitchSystem'));
  // 說明預設收起來，避免擋住 3D 畫面；點了才展開
  const noteToggle = (bar) => {
    const b = el('button', { class: 'btn cut note-toggle', type: 'button', 'aria-expanded': 'false' }, 'ⓘ 教學示意');
    b.addEventListener('click', () => store.set({ showNote: !store.get().showNote }));
    bar.append(b);
    return b;
  };
  const cutNoteBtn = noteToggle(cutbar);
  const cutNote = el('p', { class: 'cutnote' },
    `教學示意：高速軸實際約比主軸快 ${Math.round(gearboxRatio())} 倍，畫面已經放慢。`);

  // ---------- 零件介紹卡 ----------
  const info = el('section', { class: 'info', 'aria-live': 'polite' });
  const infoHead = el('div', { class: 'info-head' });
  const infoDot = el('i', { class: 'dot big' });
  const infoName = el('h2');
  const closeBtn = el('button', { class: 'btn icon', type: 'button', 'aria-label': '關閉' }, ICONS.close);
  closeBtn.addEventListener('click', () => store.set({ selectedPart: null }));
  // 朗讀：唸名稱與簡短介紹（展開時連進階說明一起唸）；裝置沒有中文語音時不顯示
  const speakBtn = el('button', { class: 'btn icon speak', type: 'button', 'aria-label': '唸給我聽' }, ICONS.speaker);
  speakBtn.addEventListener('click', () => {
    const s = store.get();
    const t = s.selectedPart && partText(s.selectedPart, s.difficulty);
    if (!t) return;
    speech.speak(t.speak ?? `${t.name}。${t.short}${s.infoExpanded ? `。${t.more}` : ''}`);
  });
  speech.onChange((ok) => { speakBtn.hidden = !ok; });
  infoHead.append(infoDot, infoName, speakBtn, closeBtn);
  const infoShort = el('p', { class: 'short' });
  const moreBtn = el('button', { class: 'btn more', type: 'button' });
  moreBtn.addEventListener('click', () => store.set({ infoExpanded: !store.get().infoExpanded }));
  const infoMore = el('p', { class: 'more-text' });
  const infoNote = el('p', { class: 'note' });
  // 拆解模式：只看這個／藏起來
  const infoActions = el('div', { class: 'info-actions' });
  const soloBtn = el('button', { class: 'btn more', type: 'button' }, '只看這個');
  soloBtn.addEventListener('click', () => {
    const s = store.get();
    store.set({ soloPart: s.soloPart === s.selectedPart ? null : s.selectedPart });
  });
  const hideBtn2 = el('button', { class: 'btn more', type: 'button' }, '藏起來');
  hideBtn2.addEventListener('click', () => {
    const s = store.get();
    store.set({ hiddenParts: [...s.hiddenParts, s.selectedPart], selectedPart: null, soloPart: null });
  });
  infoActions.append(soloBtn, hideBtn2);
  info.append(infoHead, infoShort, moreBtn, infoMore, infoNote, infoActions);

  // ---------- 提示 ----------
  const hint = el('div', { class: 'hint' }, '用手指拖曳可以轉動，兩指可以放大縮小。點一下零件看看它是什麼！');

  // ---------- 零件標籤（跟著 3D 位置移動） ----------
  const marker = el('div', { class: 'marker' });

  // ---------- 拆解工具列 ----------
  const exbar = el('div', { class: 'cutbar', role: 'toolbar', 'aria-label': '機械拆解' });
  const exBtn = (id, label, fn, cls = '') => {
    const b = el('button', { class: `btn cut ${cls}`, type: 'button', 'data-ex': id }, label);
    b.addEventListener('click', fn);
    exbar.append(b);
    return b;
  };
  exBtn('back', '返回外觀', () => store.set({ mode: 'exterior', selectedPart: null }), 'back');
  const openBtn = exBtn('toggle', '合起來', () => store.set({ exploded: !store.get().exploded }));
  exBtn('gears', '看齒輪', () => actions.focusGears());
  const speedsBtn = exBtn('speeds', '轉速比較', () => store.set({ showSpeeds: !store.get().showSpeeds }));
  speedsBtn.setAttribute('aria-expanded', 'false');
  const exNoteBtn = noteToggle(exbar);
  const showAllBtn = exBtn('showall', '全部顯示', () => store.set({ hiddenParts: [], soloPart: null }));

  // 轉速比較：從葉輪前方（上風）看，每根軸轉幾倍、往哪個方向
  const speedRow = el('div', { class: 'speedrow', 'aria-label': '轉速比較' });
  {
    const stages = GEARBOX_CONFIGS[ACTIVE_GEARBOX].stages;
    const names = ['主軸', '太陽齒輪', '中間軸', '高速軸'];
    const colors = [PALETTE.mainShaft, PALETTE.gearSun, PALETTE.gearParallel, PALETTE.highSpeedShaft];
    let ratio = 1, dir = COORDS.rotorSpinSign;
    speedRow.append(el('span', { class: 'speed-title' }, '從前面看：'));
    names.forEach((n, i) => {
      if (i > 0) { ratio *= stageRatio(stages[i - 1]); dir *= stageDirection(stages[i - 1]); }
      const r = Math.round(ratio * 10) / 10;
      speedRow.append(el('span', { class: 'speed' },
        `<i class="dot" style="background:${colors[i]}"></i>${n}<b>×${r}</b>${dir < 0 ? ICONS.cw : ICONS.ccw}<small>${dir < 0 ? '順時針' : '逆時針'}</small>`));
    });
  }
  const exNote = el('p', { class: 'cutnote' }, '教學示意：齒數與齒形是簡化的；葉輪已放慢，讓高速軸每秒轉約 1 圈。');

  header.append(cutbar, cutNote, exbar, speedRow, exNote);
  root.append(header, tools, list, viewMenu, info, hint, marker);

  function render(s) {
    for (const [id, b] of Object.entries(modeButtons)) b.classList.toggle('active', id === s.mode);
    pauseBtn.innerHTML = `${s.paused ? ICONS.play : ICONS.pause}<span class="lbl">${s.paused ? '播放' : '暫停'}</span>`;
    pauseBtn.setAttribute('aria-label', s.paused ? '播放' : '暫停');
    pauseBtn.classList.toggle('on', s.paused);
    slowBtn.querySelector('.lbl').textContent = SPEED_LABEL[s.animSpeed];
    slowBtn.classList.toggle('on', s.animSpeed !== 1);
    listBtn.classList.toggle('on', s.openPanel === 'parts');
    list.classList.toggle('open', s.openPanel === 'parts');
    viewsBtn.classList.toggle('on', s.openPanel === 'views');
    viewMenu.classList.toggle('open', s.openPanel === 'views');
    learnBtn.classList.toggle('on', s.openPanel === 'learn');
    for (const [id, b] of Object.entries(listButtons)) b.classList.toggle('active', id === s.selectedPart);
    cutbar.classList.toggle('open', s.mode === 'cutaway');
    cutNote.hidden = s.mode !== 'cutaway' || !s.showNote;
    for (const b of [cutNoteBtn, exNoteBtn]) { b.classList.toggle('active', s.showNote); b.setAttribute('aria-expanded', String(s.showNote)); }
    speedsBtn.classList.toggle('active', s.showSpeeds);
    speedsBtn.setAttribute('aria-expanded', String(s.showSpeeds));
    const ex = s.mode === 'explode';
    exbar.classList.toggle('open', ex);
    speedRow.hidden = !ex || !s.showSpeeds;
    exNote.hidden = !ex || !s.showNote;
    openBtn.textContent = s.exploded ? '合起來' : '拆開';
    const nHidden = s.hiddenParts.length + (s.soloPart ? 1 : 0);
    showAllBtn.disabled = nHidden === 0;
    // 手機上只顯示數字，按鈕短一點
    showAllBtn.innerHTML = s.hiddenParts.length
      ? `全部顯示<span class="long">（藏了 ${s.hiddenParts.length} 個）</span><span class="short">（${s.hiddenParts.length}）</span>`
      : '全部顯示';
    infoActions.hidden = !ex;
    soloBtn.textContent = s.soloPart && s.soloPart === s.selectedPart ? '顯示全部零件' : '只看這個';
    seeBtn.classList.toggle('active', s.shellView === 'transparent');
    hideBtn.classList.toggle('active', s.shellView === 'hidden');

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
    if (changedPart(s)) speech.stop(); // 換零件或關閉時停止朗讀
    marker.classList.toggle('show', !!t);
  }
  let lastPart = null;
  function changedPart(s) { const c = s.selectedPart !== lastPart; lastPart = s.selectedPart; return c; }
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
