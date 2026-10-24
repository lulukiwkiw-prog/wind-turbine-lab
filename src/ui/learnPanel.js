// 學習功能介面：小任務、考考你、操作說明（第一次打開時顯示）、完成提示
// 進度與答題狀態都在集中 store；這裡只負責畫面。
import { missionsFor } from '../learning/missions.js';
import { quizFor } from '../learning/quiz.js';
import { TOUR } from '../learning/tour.js';
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

export function createLearnPanel({ root, store, speech }) {
  const speakable = [];
  const speakBtn = (getText, label = '唸給我聽') => {
    const b = el('button', { class: 'btn icon speak', type: 'button', 'aria-label': label }, ICONS.speaker);
    b.addEventListener('click', (e) => { e.stopPropagation(); speech.speak(getText()); });
    speakable.push(b);
    return b;
  };

  // ---------- 學習面板（小任務 + 入口） ----------
  const panel = el('div', { class: 'partlist learn', role: 'dialog', 'aria-label': '學習' });
  const head = el('div', { class: 'learn-head' });
  const progress = el('span', { class: 'learn-progress' });
  head.append(el('h2', {}, '小任務'), progress);
  const list = el('ol', { class: 'missions' });
  const rows = new Map();
  const actions = el('div', { class: 'learn-actions' });
  const quizBtn = el('button', { class: 'btn', type: 'button' }, '考考你');
  quizBtn.addEventListener('click', () => store.set({ openPanel: null, quizIndex: 0, quizPicked: null, quizScore: 0 }));
  const tourBtn = el('button', { class: 'btn', type: 'button' }, '操作說明');
  tourBtn.addEventListener('click', () => store.set({ openPanel: null, tourStep: 0 }));
  actions.append(quizBtn, tourBtn);
  // 「考考你」「操作說明」放在最上面，不用捲動就按得到
  panel.append(head, actions, el('p', { class: 'learn-desc' }, '自己去探索，完成時會自動打勾。不用全部做完喔！'), list);

  function buildMissions(difficulty) {
    list.innerHTML = '';
    rows.clear();
    for (const m of missionsFor(difficulty)) {
      const li = el('li', { class: 'mission', 'data-mission': m.id });
      const mark = el('span', { class: 'mission-mark', 'aria-hidden': 'true' });
      const text = el('div', { class: 'mission-text' });
      text.append(el('b', {}, m.title), el('span', {}, m.hint));
      li.append(mark, text, speakBtn(() => `${m.title}。${m.hint}`, `唸出任務：${m.title}`));
      rows.set(m.id, { li, mark });
      list.append(li);
    }
  }
  buildMissions(store.get().difficulty);

  // ---------- 完成提示 ----------
  const toast = el('div', { class: 'toast', role: 'status', 'aria-live': 'polite' });
  let toastTimer = 0;
  function showToast(text) {
    toast.textContent = text;
    toast.classList.add('show');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => toast.classList.remove('show'), 3200);
  }

  // ---------- 考考你 ----------
  const quiz = el('div', { class: 'modal', role: 'dialog', 'aria-modal': 'true', 'aria-label': '考考你' });
  const quizCard = el('div', { class: 'modal-card' });
  const quizHead = el('div', { class: 'learn-head' });
  const quizCount = el('span', { class: 'learn-progress' });
  quizHead.append(el('h2', {}, '考考你'), quizCount);
  const qLine = el('div', { class: 'q-line' });
  const qText = el('p', { class: 'q-text' });
  qLine.append(qText, speakBtn(() => {
    const q = currentQuestion();
    return q ? `${q.q}。${q.options.map((o, i) => `第${i + 1}個，${o}`).join('。')}` : '';
  }, '唸出題目'));
  const options = el('div', { class: 'q-options' });
  const feedback = el('div', { class: 'q-feedback', 'aria-live': 'polite' });
  const qNav = el('div', { class: 'learn-actions' });
  const nextBtn = el('button', { class: 'btn primary', type: 'button' }, '下一題');
  const skipBtn = el('button', { class: 'btn', type: 'button' }, '跳過');
  const endBtn = el('button', { class: 'btn', type: 'button' }, '結束');
  nextBtn.addEventListener('click', () => advance());
  skipBtn.addEventListener('click', () => advance());
  endBtn.addEventListener('click', () => store.set({ quizIndex: null, quizPicked: null }));
  qNav.append(skipBtn, nextBtn, endBtn);
  quizCard.append(quizHead, qLine, options, feedback, qNav);
  quiz.append(quizCard);

  const questions = () => quizFor(store.get().difficulty);
  const currentQuestion = () => { const i = store.get().quizIndex; return i === null ? null : questions()[i] ?? null; };
  function advance() {
    const s = store.get();
    store.set({ quizIndex: s.quizIndex + 1, quizPicked: null });
  }

  // ---------- 操作說明 ----------
  const tour = el('div', { class: 'modal tour', role: 'dialog', 'aria-modal': 'true', 'aria-label': '操作說明' });
  const tourCard = el('div', { class: 'modal-card' });
  const tourStepLabel = el('span', { class: 'learn-progress' });
  const tourTitle = el('h2');
  const tourHead = el('div', { class: 'learn-head' });
  tourHead.append(tourTitle, tourStepLabel);
  const tourLine = el('div', { class: 'q-line' });
  const tourText = el('p', { class: 'q-text' });
  tourLine.append(tourText, speakBtn(() => { const t = TOUR[store.get().tourStep]; return t ? `${t.title}。${t.text}` : ''; }));
  const tourNav = el('div', { class: 'learn-actions' });
  const tourSkip = el('button', { class: 'btn', type: 'button' }, '跳過');
  const tourNext = el('button', { class: 'btn primary', type: 'button' });
  tourSkip.addEventListener('click', () => store.set({ tourStep: null }));
  tourNext.addEventListener('click', () => {
    const i = store.get().tourStep;
    store.set({ tourStep: i + 1 < TOUR.length ? i + 1 : null });
  });
  tourNav.append(tourSkip, tourNext);
  tourCard.append(tourHead, tourLine, tourNav);
  tour.append(tourCard);

  root.append(panel, toast, quiz, tour);
  speech.onChange((ok) => { for (const b of speakable) b.hidden = !ok; });

  let lastQuizKey = '';
  function render(s, prev) {
    panel.classList.toggle('open', s.openPanel === 'learn');
    const ms = missionsFor(s.difficulty);
    const done = new Set(s.missionsDone);
    progress.textContent = `完成 ${ms.filter((m) => done.has(m.id)).length} / ${ms.length}`;
    for (const [id, r] of rows) {
      r.li.classList.toggle('done', done.has(id));
      r.mark.innerHTML = done.has(id) ? ICONS.check : '';
    }
    if (prev) {
      for (const id of s.missionsDone) {
        if (!prev.missionsDone.includes(id)) {
          const m = ms.find((x) => x.id === id);
          if (m) showToast(`完成任務：${m.title}！`);
        }
      }
    }

    // 考考你
    const qs = questions();
    quiz.hidden = s.quizIndex === null;
    if (s.quizIndex !== null) {
      const key = `${s.quizIndex}|${s.quizPicked}`;
      if (key !== lastQuizKey) {
        lastQuizKey = key;
        if (s.quizIndex >= qs.length) {
          quizCount.textContent = '';
          qText.textContent = `答完了！答對 ${s.quizScore} 題，共 ${qs.length} 題。`;
          options.innerHTML = '';
          feedback.textContent = s.quizScore === qs.length ? '全部答對，太厲害了！' : '可以到各個模式再看看，答案都藏在裡面喔。';
          feedback.className = 'q-feedback';
          skipBtn.hidden = true; nextBtn.hidden = true;
          endBtn.textContent = '完成';
        } else {
          const q = qs[s.quizIndex];
          quizCount.textContent = `第 ${s.quizIndex + 1} / ${qs.length} 題`;
          qText.textContent = q.q;
          options.innerHTML = '';
          q.options.forEach((o, i) => {
            const b = el('button', { class: 'btn option', type: 'button' }, o);
            if (s.quizPicked !== null) {
              b.disabled = true;
              if (i === q.answer) b.classList.add('right');
              else if (i === s.quizPicked) b.classList.add('wrong');
            }
            b.addEventListener('click', () => {
              if (store.get().quizPicked !== null) return;
              store.set({ quizPicked: i, quizScore: store.get().quizScore + (i === q.answer ? 1 : 0) });
            });
            options.append(b);
          });
          if (s.quizPicked === null) {
            feedback.textContent = '';
            feedback.className = 'q-feedback';
          } else {
            const ok = s.quizPicked === q.answer;
            feedback.innerHTML = `<b>${ok ? '答對了！' : `正確答案是「${q.options[q.answer]}」`}</b><span>${q.explain}</span>`;
            feedback.className = `q-feedback ${ok ? 'right' : 'wrong'}`;
          }
          skipBtn.hidden = s.quizPicked !== null;
          nextBtn.hidden = s.quizPicked === null;
          nextBtn.textContent = s.quizIndex + 1 < qs.length ? '下一題' : '看結果';
          endBtn.textContent = '結束';
        }
      }
    } else {
      lastQuizKey = '';
    }

    // 導覽
    tour.hidden = s.tourStep === null;
    if (s.tourStep !== null) {
      const t = TOUR[s.tourStep];
      tourTitle.textContent = t.title;
      tourText.textContent = t.text;
      tourStepLabel.textContent = `${s.tourStep + 1} / ${TOUR.length}`;
      tourNext.textContent = s.tourStep + 1 < TOUR.length ? '下一步' : '開始探索';
    }
  }
  store.subscribe(render);
  render(store.get(), null);

  return { showToast };
}
