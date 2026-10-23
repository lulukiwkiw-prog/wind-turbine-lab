// 自動導覽介面：標題列旁的「自動導覽／停止導覽」按鈕，以及畫面下方的字幕卡（上一段、暫停、下一段、停止）。
// 播放狀態都在集中 store（guideStep、guidePaused）；這裡只負責畫面。
import { GUIDE_CHAPTERS } from '../learning/guide.js';
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

export function createGuidePanel({ root, header, store, player }) {
  const script = player.script;

  // ---------- 啟動／停止按鈕（放在標題旁邊，最醒目） ----------
  const startBtn = el('button', { class: 'btn guide-start', type: 'button' });
  startBtn.addEventListener('click', () => player.toggle());
  header.querySelector('h1').after(startBtn);

  // ---------- 字幕卡 ----------
  const card = el('section', { class: 'guide', 'aria-label': '自動導覽', 'aria-live': 'polite' });
  const top = el('div', { class: 'guide-top' });
  const chapter = el('span', { class: 'guide-chapter' });
  const count = el('span', { class: 'guide-count' });
  top.append(chapter, count);
  const title = el('h2');
  const text = el('p', { class: 'guide-text' });
  const live = el('p', { class: 'guide-live' });
  const bar = el('div', { class: 'guide-bar', 'aria-hidden': 'true' });
  const barFill = el('i');
  bar.append(barFill);

  const controls = el('div', { class: 'guide-controls' });
  const ctl = (cls, label, fn) => {
    const b = el('button', { class: `btn ${cls}`, type: 'button', 'aria-label': label });
    b.addEventListener('click', fn);
    controls.append(b);
    return b;
  };
  const prevBtn = ctl('guide-prev', '上一段', () => player.prev());
  const pauseBtn = ctl('guide-pause', '暫停', () => player.togglePause());
  const nextBtn = ctl('guide-next', '下一段', () => player.next());
  const stopBtn = ctl('guide-stop', '停止導覽', () => player.stop());
  prevBtn.innerHTML = `${ICONS.prev}<span>上一段</span>`;
  nextBtn.innerHTML = `${ICONS.next}<span>下一段</span>`;
  stopBtn.innerHTML = `${ICONS.stop}<span>停止</span>`;

  card.append(top, title, text, live, bar, controls);
  root.append(card);

  function render(s) {
    const on = s.guideStep !== null;
    root.classList.toggle('guide-on', on);
    card.classList.toggle('open', on);
    startBtn.classList.toggle('on', on);
    startBtn.innerHTML = on ? `${ICONS.stop}<span>停止導覽</span>` : `${ICONS.play}<span>自動導覽</span>`;
    startBtn.setAttribute('aria-pressed', String(on));
    if (!on) return;
    const scene = script[s.guideStep];
    const ci = GUIDE_CHAPTERS.findIndex((c) => c.id === scene.chapter);
    chapter.textContent = `第 ${ci + 1} 章・${GUIDE_CHAPTERS[ci].title}`;
    count.textContent = `${s.guideStep + 1} / ${script.length}`;
    title.textContent = scene.title;
    text.textContent = scene.text;
    prevBtn.disabled = s.guideStep === 0;
    nextBtn.querySelector('span').textContent = s.guideStep === script.length - 1 ? '結束' : '下一段';
    pauseBtn.innerHTML = s.guidePaused ? `${ICONS.play}<span>繼續</span>` : `${ICONS.pause}<span>暫停</span>`;
    pauseBtn.setAttribute('aria-label', s.guidePaused ? '繼續' : '暫停');
    pauseBtn.classList.toggle('on', s.guidePaused);
  }
  store.subscribe(render);
  render(store.get());

  return {
    element: card,
    /** 由主迴圈呼叫：即時讀數與這一段的進度 */
    update(now) {
      if (store.get().guideStep === null) return;
      live.textContent = `風速 ${now.windSpeed.toFixed(1)} m/s・葉輪每分鐘 ${now.rotorRpm.toFixed(1)} 圈・發電 ${Math.round(Math.max(0, now.powerKW)).toLocaleString('zh-TW')} kW`;
      barFill.style.width = `${Math.round(player.progress() * 100)}%`;
    },
  };
}
