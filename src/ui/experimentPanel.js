// 發電實驗控制面板：風速、風向（八方位）、葉片角度（自動／手動）、讀數與能量轉換
// 輸入只寫進集中 store；讀數來自模擬（每秒更新數次）。
import { SIM, windName } from '../spec/turbineSpec.js';

const el = (tag, attrs = {}, html = '') => {
  const e = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (k === 'class') e.className = v;
    else e.setAttribute(k, v);
  }
  if (html) e.innerHTML = html;
  return e;
};

/** 給小朋友看的風的描述 */
function windWords(v) {
  if (v === 0) return '沒有風';
  if (v < SIM.cutInSpeed) return '微風：還不夠發電';
  if (v < 8) return '和風：開始發電';
  if (v < SIM.ratedSpeed) return '強風：發電越來越多';
  if (v < 17) return '很強的風：滿載發電';
  if (v < SIM.cutOutSpeed) return '大風：葉片轉開，維持滿載';
  return '暴風：停機保護';
}

// 狀態：文字 + 圖示 + 狀態色（不只靠顏色表達）
const STATUS = {
  generating: { text: '發電中', icon: '●', tone: 'good' },
  rated: { text: '滿載！控制器把葉片轉開一點，保持 2000 kW', icon: '●', tone: 'good' },
  tooLow: { text: '風太小，葉輪慢慢轉，還不能發電', icon: '○', tone: 'idle' },
  yawing: { text: '機艙正在轉向，對準風', icon: '↻', tone: 'warning' },
  unwinding: { text: '電纜扭太多圈了，機艙繞回去「解纜」', icon: '↺', tone: 'warning' },
  overspeed: { text: '轉太快了！保護系統自動把葉片轉開', icon: '▲', tone: 'serious' },
  shutdown: { text: '風太大了！葉片順槳、煞車停機保護', icon: '■', tone: 'critical' },
};

// 八方位按鈕（北在上、東在右）
const COMPASS = [
  ['西北', 315], ['北', 0], ['東北', 45],
  ['西', 270], null, ['東', 90],
  ['西南', 225], ['南', 180], ['東南', 135],
];

export function createExperimentPanel({ root, store, actions }) {
  const panel = el('section', { class: 'xp', 'aria-label': '發電實驗' });
  const head = el('div', { class: 'xp-head' });
  const title = el('h2', {}, '發電實驗');
  // 收起時只留一行摘要（狀態、發電量、風速），手機上才看得到風機
  const summary = el('div', { class: 'xp-summary', 'aria-hidden': 'true' });
  const fold = el('button', { class: 'btn icon xp-fold', type: 'button', 'aria-expanded': 'true' }, '收起');
  fold.addEventListener('click', () => store.set({ xpFolded: !store.get().xpFolded }));
  head.append(title, summary, fold);

  const body = el('div', { class: 'xp-body' });

  // ---------- 風速 ----------
  const windBox = el('div', { class: 'xp-group' });
  const windLabel = el('label', { for: 'xp-wind', class: 'xp-label' }, '風速');
  const windValue = el('span', { class: 'xp-big' });
  const windDesc = el('span', { class: 'xp-desc' });
  const windRow = el('div', { class: 'xp-row' });
  const minus = el('button', { class: 'btn step', type: 'button', 'aria-label': '風小一點' }, '－');
  const plus = el('button', { class: 'btn step', type: 'button', 'aria-label': '風大一點' }, '＋');
  const slider = el('input', { id: 'xp-wind', type: 'range', min: '0', max: '30', step: '0.5', class: 'xp-range' });
  const setWind = (v) => store.set({ windSpeed: Math.min(30, Math.max(0, Math.round(v * 2) / 2)) });
  slider.addEventListener('input', () => setWind(Number(slider.value)));
  minus.addEventListener('click', () => setWind(store.get().windSpeed - 1));
  plus.addEventListener('click', () => setWind(store.get().windSpeed + 1));
  windRow.append(minus, slider, plus);
  const ticks = el('div', { class: 'xp-ticks', 'aria-hidden': 'true' });
  for (const [v, t] of [[SIM.cutInSpeed, '開始發電'], [SIM.ratedSpeed, '滿載'], [SIM.cutOutSpeed, '停機']]) {
    ticks.append(el('span', { style: `left:${(v / 30) * 100}%` }, `${t}<br>${v}`));
  }
  windBox.append(el('div', { class: 'xp-line' }), windRow, ticks);
  windBox.firstChild.append(windLabel, windValue, windDesc);

  // ---------- 風向 ----------
  const dirBox = el('div', { class: 'xp-group' });
  dirBox.append(el('div', { class: 'xp-label' }, '風從哪裡吹來'));
  const compass = el('div', { class: 'xp-compass', role: 'group', 'aria-label': '風向' });
  const dirButtons = [];
  let center = null;
  for (const c of COMPASS) {
    if (!c) { center = el('div', { class: 'xp-center' }); compass.append(center); continue; }
    const b = el('button', { class: 'btn dir', type: 'button', 'data-angle': String(c[1]) }, c[0]);
    b.addEventListener('click', () => store.set({ windAngleDeg: c[1] }));
    dirButtons.push(b);
    compass.append(b);
  }
  dirBox.append(compass);

  // ---------- 葉片角度 ----------
  const pitchBox = el('div', { class: 'xp-group' });
  const pitchLine = el('div', { class: 'xp-line' });
  const pitchValue = el('span', { class: 'xp-big' });
  pitchLine.append(el('label', { for: 'xp-pitch', class: 'xp-label' }, '葉片角度（槳距）'), pitchValue);
  const seg = el('div', { class: 'xp-seg', role: 'group', 'aria-label': '槳距控制' });
  const autoBtn = el('button', { class: 'btn', type: 'button' }, '自動控制');
  const manBtn = el('button', { class: 'btn', type: 'button' }, '我來調整');
  autoBtn.addEventListener('click', () => store.set({ pitchAuto: true }));
  manBtn.addEventListener('click', () => store.set({ pitchAuto: false, pitchDeg: Math.round(store.get().pitchDeg) }));
  seg.append(autoBtn, manBtn);
  const pitchSlider = el('input', { id: 'xp-pitch', type: 'range', min: '0', max: '90', step: '1', class: 'xp-range' });
  pitchSlider.addEventListener('input', () => store.set({ pitchDeg: Number(pitchSlider.value) }));
  const pitchHint = el('div', { class: 'xp-desc' }, '0° 葉片正面接風；90° 葉片側面對風（順槳），幾乎接不到風');
  pitchBox.append(pitchLine, seg, pitchSlider, pitchHint);

  // ---------- 讀數 ----------
  const status = el('div', { class: 'xp-status', role: 'status' });
  const tiles = el('div', { class: 'xp-tiles' });
  const tile = (label) => {
    const t = el('div', { class: 'xp-tile' });
    const v = el('b');
    t.append(el('span', {}, label), v);
    tiles.append(t);
    return v;
  };
  const tRotor = tile('葉輪轉速');
  const tGen = tile('發電機轉速');
  const tTsr = tile('葉尖速度是風的');
  const tTwist = tile('電纜扭轉');
  const meter = el('div', { class: 'xp-meter' });
  const meterHead = el('div', { class: 'xp-line' });
  const powerValue = el('span', { class: 'xp-big' });
  meterHead.append(el('span', { class: 'xp-label' }, '發電量'), powerValue);
  const bar = el('div', { class: 'xp-bar', role: 'meter', 'aria-valuemin': '0', 'aria-valuemax': String(SIM.ratedPowerKW) });
  const fill = el('i');
  bar.append(fill);
  meter.append(meterHead, bar, el('div', { class: 'xp-scale' }, `<span>0</span><span>滿載 ${SIM.ratedPowerKW} kW</span>`));

  // ---------- 能量轉換 ----------
  const chain = el('div', { class: 'xp-chain', 'aria-label': '能量轉換' });
  const step = (name) => {
    const d = el('div', { class: 'xp-step' });
    const v = el('b');
    d.append(el('span', {}, name), v);
    chain.append(d);
    return v;
  };
  const cWind = step('風的能量');
  chain.append(el('i', { class: 'xp-arrow', 'aria-hidden': 'true' }, '→'));
  const cRotor = step('葉輪接住');
  chain.append(el('i', { class: 'xp-arrow', 'aria-hidden': 'true' }, '→'));
  const cElec = step('變成電');
  const cNote = el('div', { class: 'xp-desc' });

  // ---------- 看哪裡 ----------
  const views = el('div', { class: 'xp-views' });
  const insideBtn = el('button', { class: 'btn', type: 'button' }, '看機艙裡面');
  insideBtn.addEventListener('click', () => store.set({ shellView: store.get().shellView === 'solid' ? 'transparent' : 'solid' }));
  const gridBtn = el('button', { class: 'btn', type: 'button' }, '看送電路線');
  gridBtn.addEventListener('click', () => actions.preset('grid'));
  const allBtn = el('button', { class: 'btn', type: 'button' }, '看整台風機');
  allBtn.addEventListener('click', () => actions.preset('experiment'));
  views.append(insideBtn, gridBtn, allBtn);

  const note = el('p', { class: 'cutnote' },
    `教學示意：機艙轉向比真實快約 ${Math.round(SIM.teachingYawRateDegPerSec / SIM.maxYawRateDegPerSec)} 倍、轉速反應比較快；黃色點表示電能往外送，不是電真的長這樣。`);

  // 結果（狀態、發電量）放最上面，一眼就看得到；接著是可以調整的三件事
  body.append(status, meter, windBox, dirBox, pitchBox, tiles, chain, cNote, views, note);
  panel.append(head, body);
  root.append(panel);

  function renderInputs(s) {
    panel.hidden = s.mode !== 'experiment';
    panel.classList.toggle('folded', s.xpFolded);
    fold.textContent = s.xpFolded ? '調整' : '收起';
    fold.setAttribute('aria-expanded', String(!s.xpFolded));
    root.classList.toggle('mode-experiment', s.mode === 'experiment');
    windValue.textContent = `${s.windSpeed.toFixed(1)} m/s`;
    windDesc.textContent = windWords(s.windSpeed);
    if (Number(slider.value) !== s.windSpeed) slider.value = String(s.windSpeed);
    slider.setAttribute('aria-valuetext', `${s.windSpeed} 公尺每秒，${windWords(s.windSpeed)}`);
    for (const b of dirButtons) b.classList.toggle('active', Number(b.dataset.angle) === (((s.windAngleDeg % 360) + 360) % 360));
    center.innerHTML = `<span class="xp-wind-arrow" style="transform:rotate(${s.windAngleDeg + 180}deg)">↑</span><small>${windName(s.windAngleDeg)}</small>`;
    autoBtn.classList.toggle('active', s.pitchAuto);
    manBtn.classList.toggle('active', !s.pitchAuto);
    pitchSlider.disabled = s.pitchAuto;
    if (!s.pitchAuto && Number(pitchSlider.value) !== s.pitchDeg) pitchSlider.value = String(s.pitchDeg);
    insideBtn.classList.toggle('active', s.shellView !== 'solid');
  }
  store.subscribe(renderInputs);
  renderInputs(store.get());

  return {
    /** 讀數（由主迴圈每秒呼叫數次） */
    update(now) {
      if (panel.hidden) return;
      const s = store.get();
      if (s.pitchAuto) pitchSlider.value = String(Math.round(now.pitchDeg));
      pitchValue.textContent = `${Math.round(now.pitchDeg)}°`;
      const st = now.status === 'rated' && !now.pitchAuto
        ? { text: '滿載！發電機已經發到最大 2000 kW', icon: '●', tone: 'good' }
        : STATUS[now.status];
      // 風速要幾秒才會追上滑桿（空氣有質量）
      const gap = now.targetWindSpeed - now.windSpeed;
      windDesc.textContent = Math.abs(gap) > 0.2
        ? `風正在${gap > 0 ? '變大' : '變小'}，現在 ${now.windSpeed.toFixed(1)} m/s`
        : windWords(now.targetWindSpeed);
      summary.innerHTML = `<i class="${st.tone}">${st.icon}</i><b>${Math.round(now.powerKW).toLocaleString('zh-TW')} kW</b><span>${now.windSpeed.toFixed(1)} m/s</span>`;
      status.className = `xp-status ${st.tone}`;
      status.innerHTML = `<i aria-hidden="true">${st.icon}</i><span>${st.text}</span>`;
      powerValue.textContent = `${Math.round(now.powerKW).toLocaleString('zh-TW')} kW`;
      fill.style.width = `${Math.min(100, (now.powerKW / SIM.ratedPowerKW) * 100)}%`;
      bar.setAttribute('aria-valuenow', String(Math.round(now.powerKW)));
      tRotor.textContent = `${now.rotorRpm.toFixed(1)} 圈/分`;
      tGen.textContent = `${Math.round(now.generatorRpm).toLocaleString('zh-TW')} 圈/分`;
      tTsr.textContent = now.effectiveWind > 0.5 && now.rotorRpm > 0.5 ? `${now.tipSpeedRatio.toFixed(1)} 倍` : '—';
      tTwist.textContent = `${Math.abs(now.cableTurns).toFixed(1)} 圈`;
      cWind.textContent = `${Math.round(now.windPowerKW).toLocaleString('zh-TW')} kW`;
      cRotor.textContent = `${Math.round(now.aeroPowerKW).toLocaleString('zh-TW')} kW`;
      cElec.textContent = `${Math.round(now.powerKW).toLocaleString('zh-TW')} kW`;
      const pct = now.windPowerKW > 0 ? Math.round((now.aeroPowerKW / now.windPowerKW) * 100) : 0;
      // 能量去哪裡：接住的比送出去的多，葉輪加速（存成轉動的能量）；少，葉輪減速（把轉動的能量放出來）
      const flow = Math.abs(now.accelPowerKW) > Math.max(20, 0.05 * now.aeroPowerKW)
        ? (now.accelPowerKW > 0 ? '現在接住的比送出去的多，多的能量讓葉輪越轉越快。' : '現在送出去的比接住的多，是葉輪把轉動的能量放出來，所以會越轉越慢。')
        : '';
      cNote.textContent = `葉輪接住了風能的 ${pct}%。理論上最多只能接住 59%（貝茲極限），因為風還要繼續往後吹走。${flow}`;
    },
  };
}
