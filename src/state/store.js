// 集中狀態管理：模式、難度、動畫速度、暫停、選取零件……全部只存在這裡。
// 其他模組只能透過 store.get() 讀取、store.set() 修改、store.subscribe() 監聽，
// 不得自行保存會與這裡衝突的狀態副本。
import { MODES, DIFFICULTIES, DEFAULT_DIFFICULTY, ANIMATION, CURRENT_STAGE, PARTS } from '../spec/turbineSpec.js';

const initial = () => ({
  mode: 'exterior',
  difficulty: DEFAULT_DIFFICULTY,
  animSpeed: ANIMATION.speeds[0],
  paused: false,
  selectedPart: null,
  infoExpanded: false,
  partListOpen: false,
  shellView: 'solid', // 機艙外殼：solid 實心／transparent 透明／hidden 拿掉
  exploded: true, // 拆解模式：true 拆開／false 合起來
  hiddenParts: Object.freeze([]), // 拆解模式中被藏起來的零件
  soloPart: null, // 拆解模式中「只看這個」的零件
  // 以下為模擬輸入（第四階段使用），預先定義以免各模組各自保存
  windSpeed: 8,
  windAngleDeg: 0,
  pitchDeg: 0, // 手動模式的槳距設定（實際槳距由模擬決定）
  pitchAuto: true, // true：控制器自動變槳；false：小朋友手動
});

const isCurrentPart = (v) => PARTS.some((p) => p.id === v && p.stage <= CURRENT_STAGE);

const validators = {
  mode: (v) => v in MODES && MODES[v].stage <= CURRENT_STAGE,
  difficulty: (v) => v in DIFFICULTIES && DIFFICULTIES[v].enabled,
  animSpeed: (v) => ANIMATION.speeds.includes(v),
  paused: (v) => typeof v === 'boolean',
  selectedPart: (v) => v === null || isCurrentPart(v),
  infoExpanded: (v) => typeof v === 'boolean',
  partListOpen: (v) => typeof v === 'boolean',
  shellView: (v) => ['solid', 'transparent', 'hidden'].includes(v),
  exploded: (v) => typeof v === 'boolean',
  hiddenParts: (v) => Array.isArray(v) && v.every(isCurrentPart) && new Set(v).size === v.length,
  soloPart: (v) => v === null || isCurrentPart(v),
  windSpeed: (v) => Number.isFinite(v) && v >= 0 && v <= 30,
  windAngleDeg: (v) => Number.isFinite(v),
  pitchDeg: (v) => Number.isFinite(v) && v >= 0 && v <= 90,
  pitchAuto: (v) => typeof v === 'boolean',
};

export function createStore() {
  let state = initial();
  const listeners = new Set();
  let dispatching = false;
  const pending = [];

  const api = {
    get: () => state,
    /** 部分更新；不合法的值會被拒絕並在主控台警告，不會丟出錯誤中斷畫面 */
    set(patch) {
      // 監聽函式裡再呼叫 set 時先排隊，等這一輪通知完再處理，確保每個監聽者都依序看到每次變化
      if (dispatching) { pending.push(patch); return; }
      const next = { ...state };
      const changed = [];
      for (const [k, v] of Object.entries(patch)) {
        if (!(k in validators)) { console.warn(`[store] 未知狀態：${k}`); continue; }
        if (!validators[k](v)) { console.warn(`[store] 不合法的值：${k} =`, v); continue; }
        const same = Array.isArray(v) ? v.length === next[k].length && v.every((x, i) => x === next[k][i]) : next[k] === v;
        if (!same) { next[k] = Array.isArray(v) ? Object.freeze([...v]) : v; changed.push(k); }
      }
      if (!changed.length) return;
      // 選取別的零件時，進階說明收合
      if (changed.includes('selectedPart') && !('infoExpanded' in patch)) next.infoExpanded = false;
      const prev = state;
      state = Object.freeze(next);
      dispatching = true;
      try {
        for (const fn of listeners) fn(state, prev, changed);
      } finally {
        dispatching = false;
      }
      while (pending.length) api.set(pending.shift());
    },
    subscribe(fn) {
      listeners.add(fn);
      return () => listeners.delete(fn);
    },
    reset() {
      const prev = state;
      state = Object.freeze(initial());
      for (const fn of listeners) fn(state, prev, Object.keys(state));
    },
  };
  return api;
}

export const store = createStore();
