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
  // 以下為模擬輸入（第四階段使用），預先定義以免各模組各自保存
  windSpeed: 8,
  windAngleDeg: 0,
  pitchDeg: 0,
});

const validators = {
  mode: (v) => v in MODES && MODES[v].stage <= CURRENT_STAGE,
  difficulty: (v) => v in DIFFICULTIES && DIFFICULTIES[v].enabled,
  animSpeed: (v) => ANIMATION.speeds.includes(v),
  paused: (v) => typeof v === 'boolean',
  selectedPart: (v) => v === null || PARTS.some((p) => p.id === v && p.stage <= CURRENT_STAGE),
  infoExpanded: (v) => typeof v === 'boolean',
  partListOpen: (v) => typeof v === 'boolean',
  windSpeed: (v) => Number.isFinite(v) && v >= 0 && v <= 30,
  windAngleDeg: (v) => Number.isFinite(v),
  pitchDeg: (v) => Number.isFinite(v) && v >= 0 && v <= 90,
};

export function createStore() {
  let state = initial();
  const listeners = new Set();

  return {
    get: () => state,
    /** 部分更新；不合法的值會被拒絕並在主控台警告，不會丟出錯誤中斷畫面 */
    set(patch) {
      const next = { ...state };
      const changed = [];
      for (const [k, v] of Object.entries(patch)) {
        if (!(k in validators)) { console.warn(`[store] 未知狀態：${k}`); continue; }
        if (!validators[k](v)) { console.warn(`[store] 不合法的值：${k} =`, v); continue; }
        if (next[k] !== v) { next[k] = v; changed.push(k); }
      }
      if (!changed.length) return;
      // 選取別的零件時，進階說明收合
      if (changed.includes('selectedPart') && !('infoExpanded' in patch)) next.infoExpanded = false;
      const prev = state;
      state = Object.freeze(next);
      for (const fn of listeners) fn(state, prev, changed);
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
}

export const store = createStore();
