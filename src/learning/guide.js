// 自動導覽：用字幕＋語音一段一段說明風力發電的原理與過程，畫面跟著自動切換。
// 劇本（GUIDE）是純資料；播放器（createGuidePlayer）只依賴傳進來的 store／speech／actions，可以在 Node 測試。
// 數字一律取自規格（SIM），不在文字裡另外寫死。
import { SIM, DIM, gearboxRatio } from '../spec/turbineSpec.js';

export const GUIDE_CHAPTERS = [
  { id: 'wind', title: '風為什麼能推動葉片' },
  { id: 'inside', title: '機艙裡的發電過程' },
  { id: 'grid', title: '電怎麼送到家裡' },
  { id: 'weather', title: '風大風小怎麼辦' },
];

const ratio = Math.round(gearboxRatio());
const bladeLength = Math.round(DIM.rotor.radius - DIM.hub.radius); // 葉片從輪轂邊緣到葉尖

/**
 * 每一段：
 * - setup：要套用到 store 的狀態（mode 會先單獨設定，因為切換模式時會重設外殼等狀態）
 * - part：要標示的零件（黃色標籤＋發亮）
 * - camera：'preset:<名稱>'、'part:<零件>'（飛到零件旁邊）、'gears'（看齒輪）或 'blade'（葉輪停住，靠近看一片葉片）
 * - minSec：至少停留幾秒（讓畫面上的變化來得及發生，例如風機停下來）
 * - fastForwardSec：開始時先把模擬快轉幾秒（直接看到穩定後的樣子，字幕卡標示「快轉」）
 * - meter：字幕卡顯示風速、轉速、發電量長條；figure：另外顯示的小圖（'airfoil' 葉片切面）
 */
export const GUIDE = [
  // ---------- 第 1 章 ----------
  {
    chapter: 'wind', title: '風力發電機',
    text: `這是一台風力發電機。它有三片長長的葉片，每一片大約 ${bladeLength} 公尺長，比一座籃球場還長。它的工作，是把風的能量變成電。我們一起來看看它是怎麼做到的！`,
    setup: { mode: 'experiment', windSpeed: 8, windAngleDeg: 0, pitchAuto: true }, camera: 'preset:experiment', minSec: 6,
  },
  {
    chapter: 'wind', title: '風有能量',
    text: '風就是流動的空氣。空氣看不見，可是它有重量，跑得愈快，帶的能量就愈多。畫面上白色的線，就是吹過來的風。',
    setup: { mode: 'experiment', windSpeed: 8, windAngleDeg: 0 }, camera: 'preset:side', minSec: 6,
  },
  {
    chapter: 'wind', title: '葉片像飛機的翅膀',
    text: '我們先讓葉輪停一下，靠近看一片葉片。小圖是把葉片切開來看：一面比較彎，就像飛機的翅膀。風吹過時，兩面的空氣跑得不一樣快，產生一個往旁邊推的力，叫做升力。升力推著葉片繞圈，葉輪就轉起來了。',
    setup: { mode: 'experiment', windSpeed: 8, windAngleDeg: 0, paused: true }, part: 'blade', camera: 'blade', figure: 'airfoil', minSec: 8,
  },
  {
    chapter: 'wind', title: '慢慢轉，力氣大',
    text: '葉輪看起來轉得很慢，每分鐘只轉 10 圈左右。可是葉片很長，葉尖跑得比高速公路上的汽車還快。',
    setup: { mode: 'experiment', windSpeed: 8, windAngleDeg: 0 }, camera: 'preset:front', minSec: 6,
  },
  // ---------- 第 2 章 ----------
  {
    chapter: 'inside', title: '打開機艙看一看',
    text: '葉輪把轉動的力量傳進葉輪後面的機艙。我們把機艙的外殼變透明，看看裡面有什麼。',
    setup: { mode: 'experiment', windSpeed: 8, windAngleDeg: 0, shellView: 'transparent' }, camera: 'preset:cutaway', minSec: 5,
  },
  {
    chapter: 'inside', title: '主軸',
    text: '葉輪連著一根很粗的主軸。主軸跟葉輪一樣轉得很慢，可是力氣非常大。',
    setup: { mode: 'experiment', windSpeed: 8, windAngleDeg: 0, shellView: 'transparent' }, part: 'mainShaft', camera: 'preset:cutaway', minSec: 5,
  },
  {
    chapter: 'inside', title: '齒輪箱讓它變快',
    text: `發電機要轉得很快才能發電。齒輪箱裡有大大小小的齒輪，大齒輪帶小齒輪，小齒輪就轉得比較快。一級一級加起來，最後的高速軸比主軸快大約 ${ratio} 倍。畫面上已經把轉速放慢，方便你看清楚。`,
    setup: { mode: 'explode' }, camera: 'gears', minSec: 7,
  },
  {
    chapter: 'inside', title: '發電機把轉動變成電',
    text: '高速軸帶著發電機裡的轉子快速轉動。轉子的磁場一直改變，旁邊不動的線圈裡就產生電。這就是把「轉動」變成「電」！',
    setup: { mode: 'experiment', windSpeed: 8, windAngleDeg: 0, shellView: 'transparent' }, part: 'generator', camera: 'preset:cutaway', minSec: 6,
  },
  {
    chapter: 'inside', title: '能量的接力',
    text: '整個過程就像接力賽：風的能量，交給葉輪轉動；主軸把轉動傳給齒輪箱變快；最後發電機把轉動變成電。',
    setup: { mode: 'experiment', windSpeed: 8, windAngleDeg: 0, shellView: 'transparent' }, camera: 'preset:cutaway', minSec: 6,
  },
  // ---------- 第 3 章 ----------
  {
    chapter: 'grid', title: '電纜往下走',
    text: '我們讓塔架變透明，跟著電走一趟。電從發電機出來，沿著電纜，在塔架裡面一路往下走到地面，再鑽進埋在地下的電纜，送到旁邊的變壓器。',
    setup: { mode: 'experiment', windSpeed: 8, windAngleDeg: 0, shellView: 'transparent', towerXray: true }, part: 'powerCable', camera: 'cable', minSec: 12,
  },
  {
    chapter: 'grid', title: '變壓器把電壓升高',
    text: '地面上的變壓器把電的電壓升高。電壓愈高，送到很遠的地方時，路上浪費的電就愈少。',
    setup: { mode: 'experiment', windSpeed: 8, windAngleDeg: 0 }, part: 'transformer', camera: 'part:transformer', minSec: 5,
  },
  {
    chapter: 'grid', title: '送到城市和你家',
    text: '電沿著電線送到變電所，在那裡把電壓升得更高，再經過高高的輸電鐵塔，送到很遠的城市、學校和你家。黃色的點表示電能往外送，這是教學示意，電不是真的長這樣。',
    setup: { mode: 'experiment', windSpeed: 8, windAngleDeg: 0 }, camera: 'preset:grid', minSec: 7,
  },
  // ---------- 第 4 章 ----------
  {
    chapter: 'weather', title: '風太小',
    text: `風太小的時候，每秒不到 ${SIM.cutInSpeed} 公尺，葉輪只能慢慢空轉，力量不夠，發電機不接上去，所以不發電。看看長條：發電量是 0，發電機也沒有發亮。`,
    setup: { mode: 'experiment', windSpeed: 2.5, windAngleDeg: 0, pitchAuto: true, shellView: 'transparent' },
    part: 'generator', camera: 'preset:cutaway', meter: true, fastForwardSec: 30, minSec: 9,
  },
  {
    chapter: 'weather', title: '風大，發電多',
    text: `風變大了！葉輪和發電機都轉得更快，發電機亮起來，發的電變多。風速到了每秒 ${SIM.ratedSpeed} 公尺左右，就發到最大的 ${SIM.ratedPowerKW} kW。風再變大，控制器會把葉片轉一個角度，叫做變槳，讓轉速不會太快。`,
    setup: { mode: 'experiment', windSpeed: 15, windAngleDeg: 0, pitchAuto: true, shellView: 'transparent' },
    part: 'generator', camera: 'preset:cutaway', meter: true, fastForwardSec: 20, minSec: 10,
  },
  {
    chapter: 'weather', title: '風太大，停下來保護自己',
    text: `風太大，每秒超過 ${SIM.cutOutSpeed} 公尺時，為了安全，葉片會轉到側面對著風，這叫做順槳。風機慢慢停下來，等風變小再重新開始發電。`,
    setup: { mode: 'experiment', windSpeed: 27, windAngleDeg: 0, pitchAuto: true }, camera: 'preset:front', meter: true, minSec: 12,
  },
  {
    chapter: 'weather', title: '風向變了，跟著轉',
    text: '風向改變的時候，機艙上的風向標會發現。偏航系統就把整個機艙慢慢轉過去，讓葉輪正對著風。畫面上轉得比真的風機快很多，這是教學示意。',
    setup: { mode: 'experiment', windSpeed: 10, windAngleDeg: 90, pitchAuto: true }, camera: 'preset:experiment', meter: true, minSec: 16,
  },
  {
    chapter: 'weather', title: '換你試試看',
    text: '風力發電不會排放廢氣，風也用不完。導覽結束了！現在換你在「發電實驗」裡，自己調整風速和風向，看看風機會怎麼做吧！',
    setup: { mode: 'experiment', windSpeed: 8, windAngleDeg: 0, pitchAuto: true }, camera: 'preset:experiment', minSec: 5,
  },
];

/** 依句號、驚嘆號、問號切成短句（朗讀時一句一句排隊唸） */
export const sentences = (text) => text.match(/[^。！？]+[。！？]?/g)?.map((x) => x.trim()).filter(Boolean) ?? [];

// 沒有語音（或語音沒有回報唸完）時，依字數估計閱讀時間：小朋友約每秒 4 個字，再多留一點時間看畫面
export const READ_SEC_PER_CHAR = 0.26;
export const AFTER_SPEECH_SEC = 1.2; // 唸完後停一下再換下一段
export const readSeconds = (scene) => Math.max(scene.minSec, 2 + scene.text.length * READ_SEC_PER_CHAR);
// 語音唸完的通知有時不會來（部分瀏覽器的已知問題）：超過這個時間就直接換下一段，避免卡住
export const maxSeconds = (scene) => readSeconds(scene) * 1.8 + 6;

/** 使用者自己動了這些狀態，就表示想自己操作：導覽自動停止 */
export const GUIDE_USER_KEYS = [
  'mode', 'selectedPart', 'openPanel', 'shellView', 'exploded', 'hiddenParts', 'soloPart',
  'windSpeed', 'windAngleDeg', 'pitchAuto', 'pitchDeg', 'quizIndex', 'tourStep',
];

/**
 * 播放器：狀態（第幾段、是否暫停）放在集中 store 的 guideStep／guidePaused。
 * actions.camera(spec) 負責移動相機；update(dt) 由主迴圈每幀呼叫。
 */
export function createGuidePlayer({ store, speech, actions, script = GUIDE }) {
  let t = 0; // 這一段已經播放幾秒（暫停時不累積）
  let spoken = false; // 這一段有沒有用語音唸
  let speechDone = false;
  let doneAt = 0;
  let token = 0; // 換段後，舊的「唸完」通知要忽略
  let applying = false; // 導覽自己在改狀態時，不當成使用者操作

  function apply(patch) {
    applying = true;
    try { store.set(patch); } finally { applying = false; }
  }

  function speakScene(scene) {
    const my = ++token;
    speechDone = false;
    spoken = speech.speak(sentences(`${scene.title}。${scene.text}`), {
      onEnd: () => { if (my === token && !speechDone) { speechDone = true; doneAt = t; } },
    });
  }

  function enter(i) {
    const scene = script[i];
    const { mode, ...rest } = scene.setup;
    // 先換模式（切換模式會重設外殼等），再套用這一段的其他設定
    apply({ guideStep: i, selectedPart: null, openPanel: null, tourStep: null, quizIndex: null, quizPicked: null });
    if (mode) apply({ mode });
    // 預設：動畫在播放（只有需要停住畫面的那一段才暫停）、外殼實心
    apply({ paused: false, towerXray: false, ...(mode === 'explode' ? {} : { shellView: 'solid' }), ...rest });
    if (scene.fastForwardSec) actions.fastForward?.(scene.fastForwardSec);
    if (scene.part) apply({ selectedPart: scene.part });
    applying = true; // 相機動作可能順便改狀態（例如看齒輪時藏起擋住的零件）
    try { actions.camera(scene.camera); } finally { applying = false; }
    t = 0;
    if (store.get().guidePaused) { token++; spoken = false; speechDone = false; } else speakScene(scene);
  }

  /** keepSelection：小朋友自己點了零件而停止時，保留他選的零件 */
  function stop({ keepSelection = false } = {}) {
    if (store.get().guideStep === null) return;
    token++;
    speech.stop();
    apply({ guideStep: null, guidePaused: false, towerXray: false, ...(keepSelection ? {} : { selectedPart: null }) });
  }

  store.subscribe((s, prev, changed) => {
    if (applying || s.guideStep === null) return;
    if (changed.some((k) => GUIDE_USER_KEYS.includes(k))) stop({ keepSelection: true });
  });

  const api = {
    script,
    active: () => store.get().guideStep !== null,
    start(i = 0) {
      apply({ paused: false, animSpeed: 1, guidePaused: false });
      enter(Math.max(0, Math.min(script.length - 1, i)));
    },
    stop: () => stop(),
    toggle() { if (api.active()) stop(); else api.start(); },
    next() {
      const i = store.get().guideStep;
      if (i === null) return;
      if (i + 1 >= script.length) stop(); else enter(i + 1);
    },
    prev() {
      const i = store.get().guideStep;
      if (i === null) return;
      enter(Math.max(0, i - 1));
    },
    /** 暫停：停止朗讀與計時；繼續：這一段從頭再唸一次（瀏覽器的語音暫停功能在手機上不可靠） */
    togglePause() {
      const s = store.get();
      if (s.guideStep === null) return;
      if (s.guidePaused) {
        apply({ guidePaused: false });
        t = 0;
        speakScene(script[s.guideStep]);
      } else {
        token++;
        speech.stop();
        spoken = false;
        apply({ guidePaused: true });
      }
    },
    /** 這一段的進度 0～1（字幕下方的進度條用） */
    progress() {
      const s = store.get();
      if (s.guideStep === null) return 0;
      const scene = script[s.guideStep];
      let end = readSeconds(scene); // 沒有語音：依字數計時
      if (spoken) end = speechDone ? Math.max(scene.minSec, doneAt + AFTER_SPEECH_SEC) : Math.max(end, t + 1);
      return Math.min(1, t / end);
    },
    update(dt) {
      const s = store.get();
      if (s.guideStep === null || s.guidePaused) return;
      t += dt;
      const scene = script[s.guideStep];
      const ready = spoken
        ? (speechDone && t - doneAt >= AFTER_SPEECH_SEC) || t >= maxSeconds(scene)
        : t >= readSeconds(scene);
      if (ready && t >= scene.minSec) api.next();
    },
  };
  return api;
}
