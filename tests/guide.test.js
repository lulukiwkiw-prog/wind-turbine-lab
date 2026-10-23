// 自動導覽：劇本內容要對得上規格與模擬；播放器的換段、暫停、停止要正確
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  GUIDE, GUIDE_CHAPTERS, GUIDE_USER_KEYS, createGuidePlayer, readSeconds, maxSeconds, sentences, AFTER_SPEECH_SEC,
} from '../src/learning/guide.js';
import { PARTS, CURRENT_STAGE, MODES, VIEW, SIM, DIM, gearboxRatio } from '../src/spec/turbineSpec.js';
import { createSim } from '../src/sim/turbineSim.js';
import { createStore } from '../src/state/store.js';

test('導覽劇本：四個章節依序都有；零件、模式、視角都存在；設定值合法', () => {
  const chapters = [...new Set(GUIDE.map((g) => g.chapter))];
  assert.deepEqual(chapters, GUIDE_CHAPTERS.map((c) => c.id), '章節依序出現，而且每章都有內容');
  const parts = new Set(PARTS.filter((p) => p.stage <= CURRENT_STAGE).map((p) => p.id));
  const store = createStore();
  for (const g of GUIDE) {
    assert.ok(g.title && g.text.length >= 20, g.title);
    assert.ok(g.text.length <= 140, `一段不要太長（小朋友讀得完）：${g.title}`);
    assert.ok(g.minSec > 0);
    const { mode } = g.setup;
    assert.ok(MODES[mode] && MODES[mode].stage <= CURRENT_STAGE, `模式 ${mode}`);
    const [kind, arg] = g.camera.split(':');
    if (g.part) assert.ok(parts.has(g.part), `零件 ${g.part}`);
    if (kind === 'part') assert.equal(arg, g.part, '飛到的零件也要標示');
    else if (kind === 'preset') assert.ok(arg in VIEW.presets, `視角 ${arg}`);
    else assert.ok(['gears', 'blade', 'cable'].includes(g.camera), g.camera);
    if (g.camera === 'cable') assert.equal(g.setup.towerXray, true, '跟著電走時塔架要透明，看得到裡面的電纜');
    if (g.figure) assert.equal(g.figure, 'airfoil');
    if (g.camera === 'blade') assert.equal(g.setup.paused, true, '靠近看葉片時葉輪要停住，不然葉片會轉走');
    // 每個設定值都要通過 store 的檢查（不合法的值會被拒絕）
    for (const [k, v] of Object.entries(g.setup)) {
      if (k === 'mode') continue;
      store.set({ [k]: v });
      assert.deepEqual(store.get()[k], v, `${g.title}：${k}`);
    }
  }
});

test('導覽文字：數字取自規格，不寫死', () => {
  const all = GUIDE.map((g) => g.text).join('');
  assert.ok(all.includes(`${SIM.cutInSpeed} 公尺`));
  assert.ok(all.includes(`${SIM.ratedSpeed} 公尺`));
  assert.ok(all.includes(`${SIM.cutOutSpeed} 公尺`));
  assert.ok(all.includes(`${SIM.ratedPowerKW} kW`));
  assert.ok(all.includes(`${Math.round(gearboxRatio())} 倍`));
  assert.ok(all.includes(`${Math.round(DIM.rotor.radius - DIM.hub.radius)} 公尺長`));
  assert.ok(DIM.rotor.radius - DIM.hub.radius > 28, '葉片比籃球場（28 公尺）長');
});

/** 用真正的模擬跑一段時間 */
function run(store, sim, patch, seconds) {
  store.set(patch);
  for (let t = 0; t < seconds; t += 0.05) sim.step(0.05);
  return sim.get();
}

test('導覽說的物理現象：模擬真的會這樣', () => {
  const store = createStore();
  const sim = createSim(store);
  // 8 m/s：每分鐘約 10 圈；葉尖比高速公路上的汽車（110 km/h）快
  let now = run(store, sim, { windSpeed: 8, windAngleDeg: 0, pitchAuto: true }, 120);
  assert.ok(now.rotorRpm > 8.5 && now.rotorRpm < 12.5, `8 m/s 轉速 ${now.rotorRpm}`);
  const tipKmh = (now.rotorRpm / 60) * 2 * Math.PI * DIM.rotor.radius * 3.6;
  assert.ok(tipKmh > 110, `葉尖 ${tipKmh} km/h`);
  // 15 m/s：滿載而且已經變槳
  now = run(store, sim, { windSpeed: 15 }, 30);
  assert.ok(now.powerKW > SIM.ratedPowerKW * 0.97, `15 m/s 發電 ${now.powerKW}`);
  assert.ok(now.pitchDeg > 3, '風大時有變槳');
  // 27 m/s：在這一段停留的時間內就進入停機、葉片順槳
  const storm = GUIDE.find((g) => g.setup.windSpeed > SIM.cutOutSpeed);
  now = run(store, sim, { windSpeed: storm.setup.windSpeed }, storm.minSec);
  assert.equal(now.status, 'shutdown');
  assert.ok(now.pitchDeg > 60, `順槳 ${now.pitchDeg}°`);
  // 風太小（快轉後）：葉輪只是慢慢空轉、不發電
  const calm = GUIDE.find((g) => g.setup.windSpeed < SIM.cutInSpeed);
  run(store, sim, { windSpeed: 8 }, 120);
  now = run(store, sim, { windSpeed: calm.setup.windSpeed }, calm.fastForwardSec);
  assert.ok(now.powerKW <= 0.5, `風太小時發電 ${now.powerKW}`);
  assert.ok(now.rotorRpm > 0 && now.rotorRpm < SIM.rotorRatedRpm * 0.5, `風太小時空轉 ${now.rotorRpm}`);
  // 接著風大（快轉後）：已經滿載，轉速明顯比風小時快
  const strong = GUIDE.find((g) => g.setup.windSpeed > SIM.ratedSpeed && g.setup.windSpeed < SIM.cutOutSpeed);
  const calmRpm = now.rotorRpm;
  now = run(store, sim, { windSpeed: strong.setup.windSpeed }, strong.fastForwardSec);
  assert.ok(now.powerKW > SIM.ratedPowerKW * 0.97, `快轉後滿載 ${now.powerKW}`);
  assert.ok(now.rotorRpm > calmRpm * 2, '風大時轉速是風小時的兩倍以上');
  // 風向轉 90°：在這一段停留的時間內，機艙要轉到對準風
  const turn = GUIDE.find((g) => g.setup.windAngleDeg === 90);
  run(store, sim, { windSpeed: 10, windAngleDeg: 0 }, 60);
  now = run(store, sim, { windSpeed: turn.setup.windSpeed, windAngleDeg: 90 }, turn.minSec);
  assert.ok(Math.abs(now.yawErrorDeg) < 5, `偏航誤差 ${now.yawErrorDeg}°`);
});

test('朗讀分句：依句號、驚嘆號、問號切開，不漏字', () => {
  assert.deepEqual(sentences('你好。今天有風！會轉嗎？會'), ['你好。', '今天有風！', '會轉嗎？', '會']);
  for (const g of GUIDE) assert.equal(sentences(g.text).join(''), g.text.replace(/\s+(?=[。！？])/g, ''));
});

/** 假的語音：記錄唸了什麼，由測試決定什麼時候「唸完」 */
function fakeSpeech(available = true) {
  const calls = [];
  let stops = 0;
  return {
    calls,
    stops: () => stops,
    speak(text, { onEnd } = {}) { if (!available) return false; calls.push({ text, onEnd }); return true; },
    stop() { stops++; },
    finish(i = calls.length - 1) { calls[i].onEnd?.(); },
  };
}

function setup({ available = true } = {}) {
  const store = createStore();
  const speech = fakeSpeech(available);
  const cams = [];
  const ffs = [];
  const player = createGuidePlayer({ store, speech, actions: { camera: (c) => cams.push(c), fastForward: (sec) => ffs.push(sec) } });
  const tick = (sec) => { for (let t = 0; t < sec; t += 0.1) player.update(0.1); };
  return { store, speech, cams, ffs, player, tick };
}

test('播放器：開始、照語音換段、唸完前不換、語音沒回報也不會卡住', () => {
  const { store, speech, cams, player, tick } = setup();
  store.set({ paused: true });
  player.start();
  assert.equal(store.get().guideStep, 0);
  assert.equal(store.get().paused, false, '開始導覽時動畫要在播放');
  assert.equal(store.get().mode, GUIDE[0].setup.mode);
  assert.deepEqual(cams, [GUIDE[0].camera]);
  assert.deepEqual(speech.calls[0].text, sentences(`${GUIDE[0].title}。${GUIDE[0].text}`));
  // 還沒唸完：就算超過估計時間也不換
  tick(readSeconds(GUIDE[0]) + 1);
  assert.equal(store.get().guideStep, 0);
  // 唸完：停一下再換
  speech.finish();
  tick(AFTER_SPEECH_SEC - 0.3);
  assert.equal(store.get().guideStep, 0);
  tick(0.5);
  assert.equal(store.get().guideStep, 1);
  // 舊的「唸完」通知（被打斷時也會來）不影響下一段
  speech.finish(0);
  tick(AFTER_SPEECH_SEC + 0.5);
  assert.equal(store.get().guideStep, 1);
  // 語音一直沒回報：最多等 maxSeconds 就換
  tick(maxSeconds(GUIDE[1]) + 0.2);
  assert.equal(store.get().guideStep, 2);
});

test('播放器：沒有中文語音時依字數計時；至少停留 minSec', () => {
  const { store, player, tick } = setup({ available: false });
  player.start();
  tick(readSeconds(GUIDE[0]) - 0.3);
  assert.equal(store.get().guideStep, 0);
  tick(0.5);
  assert.equal(store.get().guideStep, 1);
  for (const g of GUIDE) assert.ok(readSeconds(g) >= g.minSec);
});

test('播放器：暫停不計時、繼續重唸這一段；上一段／下一段；最後一段結束就停止', () => {
  const { store, speech, player, tick } = setup();
  player.start(2);
  player.togglePause();
  assert.equal(store.get().guidePaused, true);
  assert.ok(speech.stops() > 0, '暫停時停止朗讀');
  tick(200);
  assert.equal(store.get().guideStep, 2, '暫停時不會換段');
  const n = speech.calls.length;
  player.togglePause();
  assert.equal(store.get().guidePaused, false);
  assert.equal(speech.calls.length, n + 1, '繼續時重唸');
  player.next();
  assert.equal(store.get().guideStep, 3);
  player.prev(); player.prev(); player.prev(); player.prev();
  assert.equal(store.get().guideStep, 0, '不會小於第一段');
  player.start(GUIDE.length - 1);
  player.next();
  assert.equal(store.get().guideStep, null, '最後一段之後就結束');
});

test('播放器：每一段的狀態都正確套用（外殼、選取、拆解模式、塔架透明、快轉）', () => {
  const { store, ffs, player } = setup();
  player.start();
  for (let i = 0; i < GUIDE.length; i++) {
    const g = GUIDE[i];
    const s = store.get();
    assert.equal(s.guideStep, i);
    assert.equal(s.mode, g.setup.mode, g.title);
    // 拆解模式的外殼由主程式切換模式時設定（瀏覽器截圖檢查）；導覽不能把它改回實心
    if (g.setup.mode === 'explode') assert.notEqual(s.shellView, 'solid');
    else assert.equal(s.shellView, g.setup.shellView ?? 'solid', g.title);
    assert.equal(s.selectedPart, g.part ?? null, g.title);
    for (const k of ['windSpeed', 'windAngleDeg']) if (k in g.setup) assert.equal(s[k], g.setup[k]);
    assert.equal(s.paused, g.setup.paused ?? false, `${g.title}：只有指定的段落暫停動畫`);
    assert.equal(s.towerXray, g.setup.towerXray ?? false, `${g.title}：只有指定的段落塔架透明`);
    if (g.fastForwardSec) assert.equal(ffs.at(-1), g.fastForwardSec);
    player.next();
  }
  assert.equal(store.get().guideStep, null);
  assert.equal(store.get().towerXray, false, '導覽結束後塔架恢復');
  assert.equal(ffs.length, GUIDE.filter((g) => g.fastForwardSec).length);
});

test('播放器：小朋友自己操作（換模式、點零件、調風速…）就停止導覽', () => {
  for (const patch of [{ mode: 'exterior' }, { selectedPart: 'tower' }, { openPanel: 'parts' }, { windSpeed: 20 }]) {
    const { store, speech, player } = setup();
    player.start(1);
    store.set(patch);
    assert.equal(store.get().guideStep, null, JSON.stringify(patch));
    assert.ok(speech.stops() > 0);
    if (patch.selectedPart) assert.equal(store.get().selectedPart, patch.selectedPart, '保留小朋友點的零件');
  }
  // 不是使用者操作的變化（例如完成任務）不會停止
  const { store, player } = setup();
  player.start(1);
  store.set({ missionsDone: ['x'], paused: true, animSpeed: 0.5 });
  assert.equal(store.get().guideStep, 1);
  assert.ok(GUIDE_USER_KEYS.every((k) => k in store.get()), '列出的狀態都存在');
});
