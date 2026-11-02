// 「世界風場」玩法：世界地圖＋說明卡。選到的風場在地圖上放大顯示，地標可以點，說明卡可以翻頁、唸出來。
// 狀態（選到哪一個、看過哪些、分類、是否看全世界）都在集中 store；這裡只負責畫面。
import { WORLD_FARMS, WORLD_CATEGORIES, toMapXY, googleMapsUrl } from '../learning/worldFarms.js';
import { WORLD_LAND, DETAIL_LAND } from '../data/worldMap.js';
import { sentences } from '../learning/guide.js';
import { ICONS } from './icons.js';
import { makeDraggable } from './draggable.js';

const SVG_NS = 'http://www.w3.org/2000/svg';
const el = (tag, attrs = {}, text = '') => {
  const e = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (k === 'class') e.className = v;
    else e.setAttribute(k, v);
  }
  if (text) e.textContent = text;
  return e;
};
const svgEl = (tag, attrs = {}) => {
  const e = document.createElementNS(SVG_NS, tag);
  for (const [k, v] of Object.entries(attrs)) e.setAttribute(k, v);
  return e;
};
const catOf = (id) => WORLD_CATEGORIES.find((c) => c.id === id);
const WORLD_VIEW = { x: 0, y: 2, w: 360, h: 170 }; // 全世界（南極只露出一部分）

/** 依分類篩選後的風場清單 */
export const farmsIn = (filter) => (filter === 'all' ? WORLD_FARMS : WORLD_FARMS.filter((f) => f.category === filter));

export function createWorldPanel({ root, store, speech }) {
  const panel = el('section', { class: 'world', 'aria-label': '世界風場' });
  const head = el('div', { class: 'world-head' });
  const h2 = el('h2', {}, '🌍 世界風場');
  const seenLabel = el('span', { class: 'world-seen' });
  head.append(h2, seenLabel);

  // 分類
  const chips = el('div', { class: 'world-chips', role: 'toolbar', 'aria-label': '風場分類' });
  const chipBtns = {};
  for (const c of [{ id: 'all', label: '全部' }, ...WORLD_CATEGORIES]) {
    const b = el('button', { class: 'btn chip world-chip', type: 'button', 'data-cat': c.id });
    if (c.color) b.append(el('i', { class: 'dot', style: `background:${c.color}` }));
    b.append(el('span', {}, c.label));
    b.addEventListener('click', () => {
      const list = farmsIn(c.id);
      const cur = store.get().worldFarm;
      store.set({ worldFilter: c.id, worldOverview: false, worldFarm: list.some((f) => f.id === cur) ? cur : list[0].id });
    });
    chipBtns[c.id] = b;
    chips.append(b);
  }

  // 地圖
  const map = el('div', { class: 'world-map' });
  const svg = svgEl('svg', { class: 'world-svg', role: 'img', 'aria-label': '世界地圖', preserveAspectRatio: 'xMidYMid slice' });
  const grid = svgEl('g', { class: 'world-grid' });
  for (let lon = -150; lon <= 150; lon += 30) grid.append(svgEl('line', { x1: lon + 180, y1: 0, x2: lon + 180, y2: 180 }));
  for (let lat = -60; lat <= 60; lat += 30) grid.append(svgEl('line', { x1: 0, y1: 90 - lat, x2: 360, y2: 90 - lat }));
  svg.append(grid, svgEl('path', { class: 'world-land', d: WORLD_LAND }));
  for (const r of Object.values(DETAIL_LAND)) svg.append(svgEl('path', { class: 'world-land', d: r.path }));
  const pins = el('div', { class: 'world-pins' });
  const pinBtns = {};
  for (const f of WORLD_FARMS) {
    const b = el('button', { class: 'world-pin', type: 'button', 'data-farm': f.id, 'aria-label': f.title });
    b.append(el('i', { style: `background:${catOf(f.category).color}` }));
    b.addEventListener('click', () => store.set({ worldFarm: f.id, worldOverview: false }));
    pinBtns[f.id] = b;
    pins.append(b);
  }
  const zoomBtn = el('button', { class: 'btn world-zoom', type: 'button' });
  zoomBtn.addEventListener('click', () => store.set({ worldOverview: !store.get().worldOverview }));
  const where = el('span', { class: 'world-where' });
  map.append(svg, pins, zoomBtn, where);

  // 說明卡
  const card = el('article', { class: 'world-card', 'aria-live': 'polite' });
  const cardHead = el('div', { class: 'world-card-head' });
  const icon = el('span', { class: 'world-icon', 'aria-hidden': 'true' });
  const titleBox = el('div', { class: 'world-title' });
  const title = el('h3');
  const meta = el('span', { class: 'world-meta' });
  titleBox.append(title, meta);
  const speakBtn = el('button', { class: 'btn icon speak', type: 'button', 'aria-label': '唸給我聽' });
  speakBtn.innerHTML = ICONS.speaker;
  speakBtn.addEventListener('click', () => {
    const f = current();
    speech.speak(sentences(`${f.title}。${f.headline}。${f.text}${f.compare}`));
  });
  speech.onChange((ok) => { speakBtn.hidden = !ok; });
  cardHead.append(icon, titleBox, speakBtn);
  // 照片（有自由授權照片的風場才顯示），下面一行標明作者與授權；點照片可以放大
  const photo = el('figure', { class: 'world-photo' });
  const photoBtn = el('button', { class: 'world-photo-btn', type: 'button', 'aria-label': '放大看照片' });
  const photoImg = el('img', { loading: 'lazy', decoding: 'async' });
  photoBtn.append(photoImg);
  const photoCredit = el('figcaption', { class: 'world-photo-credit' });
  photo.append(photoBtn, photoCredit);
  photoBtn.addEventListener('click', () => photo.classList.toggle('zoomed'));
  const headline = el('p', { class: 'world-headline' });
  const text = el('p', { class: 'world-text' });
  const compare = el('p', { class: 'world-compare' });
  const note = el('p', { class: 'world-note' });
  // 在 Google 地圖看衛星圖：只是連結（開新視窗），網站本身不載入 Google 的東西
  const mapLink = el('a', { class: 'btn world-maplink', target: '_blank', rel: 'noopener' }, '🛰️ 在 Google 地圖看衛星圖');
  const mapNote = el('p', { class: 'world-mapnote' });
  const src = el('details', { class: 'world-src' });
  const srcSum = el('summary');
  const srcList = el('ul');
  src.append(srcSum, srcList);
  const nav = el('div', { class: 'world-nav' });
  const prevBtn = el('button', { class: 'btn', type: 'button' });
  prevBtn.innerHTML = `${ICONS.prev}<span>上一個</span>`;
  const pos = el('span', { class: 'world-pos' });
  const nextBtn = el('button', { class: 'btn', type: 'button' });
  nextBtn.innerHTML = `<span>下一個</span>${ICONS.next}`;
  const step = (d) => {
    const s = store.get();
    const list = farmsIn(s.worldFilter);
    const i = Math.max(0, list.findIndex((f) => f.id === s.worldFarm));
    store.set({ worldFarm: list[(i + d + list.length) % list.length].id, worldOverview: false });
  };
  prevBtn.addEventListener('click', () => step(-1));
  nextBtn.addEventListener('click', () => step(1));
  nav.append(prevBtn, pos, nextBtn);
  card.append(cardHead, photo, headline, text, compare, note, mapLink, mapNote, src, nav);

  panel.append(head, chips, map, card);
  root.append(panel);
  makeDraggable(panel, { name: 'world', store });

  const current = () => WORLD_FARMS.find((f) => f.id === store.get().worldFarm) ?? WORLD_FARMS[0];

  // ---------- 地圖視窗：選到的風場放大置中；切換時平順移動 ----------
  const view = { ...WORLD_VIEW };
  let anim = null;
  function targetView(s) {
    const r = map.getBoundingClientRect();
    const aspect = r.width && r.height ? r.height / r.width : 0.5;
    if (s.worldOverview) return { x: 0, y: Math.max(0, 90 - 85), w: 360, h: Math.min(180, 360 * aspect) };
    const f = current();
    const c = f.center ?? f;
    const { x, y } = toMapXY(c.lat, c.lon);
    const w = f.zoom, h = w * aspect;
    return { x: x - w / 2, y: Math.min(Math.max(y - h / 2, 0), 180 - h), w, h };
  }
  function applyView() {
    svg.setAttribute('viewBox', `${view.x} ${view.y} ${view.w} ${view.h}`);
    const r = map.getBoundingClientRect();
    const k = r.width / view.w;
    for (const f of WORLD_FARMS) {
      const { x, y } = toMapXY(f.lat, f.lon);
      // 經度可能跨過 ±180°：取最接近畫面中心的那一份
      let px = x;
      const cx = view.x + view.w / 2;
      if (px - cx > 180) px -= 360;
      if (cx - px > 180) px += 360;
      const left = (px - view.x) * k, top = (y - view.y) * k;
      const b = pinBtns[f.id];
      const filter = store.get().worldFilter;
      const inside = left > -10 && left < r.width + 10 && top > -10 && top < r.height + 10;
      b.hidden = !inside || (filter !== 'all' && f.category !== filter);
      b.style.transform = `translate(${left}px, ${top}px)`;
    }
  }
  function animateTo(t) {
    const from = { ...view };
    const reduce = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
    if (anim) cancelAnimationFrame(anim);
    if (reduce) { Object.assign(view, t); applyView(); return; }
    const start = performance.now();
    const tick = (now) => {
      const u = Math.min(1, (now - start) / 600);
      const k = u < 0.5 ? 4 * u * u * u : 1 - Math.pow(-2 * u + 2, 3) / 2;
      for (const key of ['x', 'y', 'w', 'h']) view[key] = from[key] + (t[key] - from[key]) * k;
      applyView();
      anim = u < 1 ? requestAnimationFrame(tick) : null;
    };
    anim = requestAnimationFrame(tick);
  }

  // 桌面版（含橫拿的手機）：面板從標題列下面開始，不蓋住模式按鈕
  const header = root.querySelector('.top');
  function placeBelowHeader() {
    if (window.innerWidth > 720 && header) panel.style.top = `${Math.round(header.getBoundingClientRect().bottom + 10)}px`;
    else panel.style.top = '';
  }

  let lastKey = '';
  function render(s, prev) {
    const on = s.mode === 'world';
    panel.hidden = !on;
    root.classList.toggle('mode-world', on);
    if (!on) return;
    placeBelowHeader();
    // 剛進來還沒選：選第一個；看過的風場記下來（小任務用）
    if (!s.worldFarm) { store.set({ worldFarm: farmsIn(s.worldFilter)[0].id }); return; }
    if (!s.worldSeen.includes(s.worldFarm)) { store.set({ worldSeen: [...s.worldSeen, s.worldFarm] }); return; }
    const f = current();
    const c = catOf(f.category);
    const list = farmsIn(s.worldFilter);
    for (const [id, b] of Object.entries(chipBtns)) b.classList.toggle('active', id === s.worldFilter);
    for (const [id, b] of Object.entries(pinBtns)) {
      b.classList.toggle('active', id === f.id);
      b.setAttribute('aria-pressed', String(id === f.id));
    }
    seenLabel.textContent = `看過 ${s.worldSeen.length} / ${WORLD_FARMS.length}`;
    icon.textContent = f.icon;
    card.style.setProperty('--cat', c.color);
    title.textContent = f.title;
    meta.textContent = `${c.label}・${f.place}・${f.year}`;
    headline.textContent = f.headline;
    text.textContent = f.text;
    compare.textContent = `比一比：${f.compare}`;
    note.textContent = f.note ? `注意：${f.note}` : '';
    note.hidden = !f.note;
    photo.hidden = !f.photo;
    photo.classList.remove('zoomed');
    if (f.photo) {
      photoImg.src = `${import.meta.env.BASE_URL}world/${f.photo.file}`;
      photoImg.alt = f.photo.alt;
      photoCredit.replaceChildren(
        el('span', {}, `照片：${f.photo.credit}・`),
        el('a', { href: f.photo.licenseUrl, target: '_blank', rel: 'noopener' }, f.photo.license),
        el('span', {}, '・'),
        el('a', { href: f.photo.page, target: '_blank', rel: 'noopener' }, '維基共享資源'),
      );
    }
    mapLink.href = googleMapsUrl(f);
    mapNote.textContent = f.mapNote ? `${f.mapNote}（會開新視窗）` : '會開新視窗，可以自己放大找風機。';
    srcSum.textContent = `資料來源（資料至 ${f.asOf} 年）`;
    srcList.replaceChildren(...f.sources.map((x) => {
      const li = el('li');
      li.append(el('a', { href: x.url, target: '_blank', rel: 'noopener' }, x.title));
      return li;
    }));
    pos.textContent = `${Math.max(0, list.findIndex((x) => x.id === f.id)) + 1} / ${list.length}`;
    zoomBtn.textContent = s.worldOverview ? '🔍 放大看' : '🌍 看全世界';
    where.textContent = s.worldOverview ? '點地標看介紹' : f.place;
    applyView(); // 分類改變時，地標的顯示／隱藏立刻更新（不用等地圖動畫）
    const key = `${f.id}|${s.worldOverview}|${s.worldFilter}`;
    if (key !== lastKey || prev?.mode !== 'world') {
      const first = !lastKey || prev?.mode !== 'world';
      lastKey = key;
      requestAnimationFrame(() => (first ? (Object.assign(view, targetView(store.get())), applyView()) : animateTo(targetView(store.get()))));
    }
  }
  store.subscribe(render);
  render(store.get());
  window.addEventListener('resize', () => {
    if (store.get().mode !== 'world') return;
    placeBelowHeader();
    Object.assign(view, targetView(store.get()));
    applyView();
  });

  return { element: panel };
}
