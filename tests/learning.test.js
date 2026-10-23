// 第五階段：學習功能與語音朗讀
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { speechText, pickVoice, PRONUNCIATION } from '../src/learning/speech.js';
import { MISSIONS, missionsFor } from '../src/learning/missions.js';
import { QUIZ, quizFor } from '../src/learning/quiz.js';
import { TOUR } from '../src/learning/tour.js';
import { PARTS_TEXT } from '../src/learning/partsData.js';
import { PARTS, CURRENT_STAGE } from '../src/spec/turbineSpec.js';
import { createStore } from '../src/state/store.js';

test('朗讀文字：難詞換成讀音正確的同音字，單位與百分比讀得出來', () => {
  assert.equal(speechText('槳距控制系統'), '獎句控制系統');
  assert.equal(speechText('偏航系統'), '篇杭系統');
  assert.equal(speechText('輪轂'), '輪鼓');
  assert.match(speechText('發電量 2000 kW'), /2000 千瓦/);
  assert.match(speechText('風速 8 m/s'), /8 公尺每秒/);
  assert.match(speechText('最多 59%'), /百分之59/);
  // 長詞先換，不會被短詞拆壞
  assert.equal(speechText('順槳'), '順獎');
  assert.ok(PRONUNCIATION.findIndex(([w]) => w === '槳距') < PRONUNCIATION.findIndex(([w]) => w === '槳'));
});

test('語音選擇：台灣華語優先；沒有就用其他華語；不用粵語；完全沒有中文時回傳 null', () => {
  const tw = { lang: 'zh-TW', name: 'Mei-Jia' };
  const cn = { lang: 'zh-CN', name: 'Ting-Ting' };
  const hk = { lang: 'zh-HK', name: 'Sin-ji' };
  const en = { lang: 'en-US', name: 'Samantha' };
  assert.equal(pickVoice([en, cn, hk, tw]), tw);
  assert.equal(pickVoice([en, hk, cn]), cn);
  assert.equal(pickVoice([en, hk]), null, '只有粵語時不朗讀');
  assert.equal(pickVoice([]), null);
  assert.equal(pickVoice([{ lang: 'zh_TW', name: 'Android' }]).lang, 'zh_TW', 'Android 的語言碼用底線');
});

test('小任務：每個任務都有標題與提示，只引用存在的零件；條件判斷正確', () => {
  const ids = new Set(PARTS.filter((p) => p.stage <= CURRENT_STAGE).map((p) => p.id));
  const ms = missionsFor('elementary');
  assert.ok(ms.length >= 6);
  assert.equal(new Set(ms.map((m) => m.id)).size, ms.length);
  for (const m of ms) assert.ok(m.title && m.hint && typeof m.check === 'function');
  const base = { state: { mode: 'exterior', selectedPart: null, windAngleDeg: 0, windSpeed: 8, pitchAuto: true }, sim: { powerKW: 0, status: 'tooLow', yawErrorDeg: 0, pitchDeg: 0, windSpeed: 8, rotorRpm: 10 } };
  const run = (id, patchState = {}, patchSim = {}) => ms.find((m) => m.id === id).check({ state: { ...base.state, ...patchState }, sim: { ...base.sim, ...patchSim } });
  assert.ok(run('find-generator', { selectedPart: 'generator' }) && ids.has('generator'));
  assert.ok(!run('find-generator'));
  assert.ok(run('find-sun-gear', { selectedPart: 'sunGear' }) && ids.has('sunGear'));
  assert.ok(run('full-power', { mode: 'experiment' }, { status: 'rated' }));
  assert.ok(!run('full-power', {}, { status: 'rated' }), '要在發電實驗模式');
  assert.ok(run('east-wind', { mode: 'experiment', windAngleDeg: 90 }, { yawErrorDeg: 1 }));
  assert.ok(!run('east-wind', { mode: 'experiment', windAngleDeg: 90 }, { yawErrorDeg: 40 }), '要等機艙轉過去');
  assert.ok(run('feather', { mode: 'experiment', pitchAuto: false }, { pitchDeg: 80, rotorRpm: 1 }));
  assert.equal(MISSIONS.junior.length, 0, '國中版在第六階段');
});

test('考考你：每題 3 個選項、答案在範圍內、都有說明；國中版退回國小版', () => {
  const qs = quizFor('elementary');
  assert.ok(qs.length >= 6);
  for (const q of qs) {
    assert.equal(q.options.length, 3);
    assert.ok(Number.isInteger(q.answer) && q.answer >= 0 && q.answer < q.options.length);
    assert.ok(q.q && q.explain && q.explain.length > 10);
  }
  // 正確答案不要老是同一個位置
  assert.ok(new Set(qs.map((q) => q.answer)).size >= 3);
  assert.equal(quizFor('junior'), QUIZ.elementary);
});

test('導覽與零件文字：每段都有內容；零件說明可朗讀', () => {
  assert.equal(TOUR.length, 4);
  for (const t of TOUR) assert.ok(t.title && t.text);
  for (const [id, t] of Object.entries(PARTS_TEXT.elementary)) assert.ok(speechText(t.speak ?? `${t.name}。${t.short}`).length > 2, id);
});

test('集中狀態：學習相關欄位的驗證', () => {
  const s = createStore();
  const warn = console.warn;
  console.warn = () => {};
  s.set({ openPanel: 'menu', quizIndex: -1, tourStep: 1.5, missionsDone: ['a', 'a'] });
  console.warn = warn;
  assert.equal(s.get().openPanel, null);
  assert.equal(s.get().quizIndex, null);
  assert.equal(s.get().tourStep, null);
  assert.deepEqual(s.get().missionsDone, []);
  s.set({ openPanel: 'learn', quizIndex: 2, quizPicked: 1, quizScore: 1, tourStep: 0, missionsDone: ['find-generator'] });
  assert.equal(s.get().openPanel, 'learn');
  assert.deepEqual(s.get().missionsDone, ['find-generator']);
});
