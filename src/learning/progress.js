// 學習進度只存在這台裝置的瀏覽器（localStorage）。私密模式或被封鎖時讀寫會失敗，網站照常運作。
const KEY = 'wind-turbine-lab:v1';

export function loadProgress() {
  try {
    const raw = window.localStorage.getItem(KEY);
    const data = raw ? JSON.parse(raw) : {};
    return {
      missionsDone: Array.isArray(data.missionsDone) ? data.missionsDone.filter((x) => typeof x === 'string') : [],
      tourDone: data.tourDone === true,
    };
  } catch {
    return { missionsDone: [], tourDone: false };
  }
}

const PANEL_KEY = 'wind-turbine-lab:panels:v1';

/** 使用者拖曳過的視窗位置（讀不到就回到原本位置） */
export function loadPanelPos() {
  try {
    const data = JSON.parse(window.localStorage.getItem(PANEL_KEY) ?? '{}');
    const out = {};
    for (const [k, p] of Object.entries(data ?? {})) if (p && Number.isFinite(p.x) && Number.isFinite(p.y)) out[k] = { x: p.x, y: p.y };
    return out;
  } catch {
    return {};
  }
}

export function savePanelPos(pos) {
  try {
    window.localStorage.setItem(PANEL_KEY, JSON.stringify(pos));
  } catch {
    // 無法儲存時不影響使用
  }
}

export function saveProgress(progress) {
  try {
    window.localStorage.setItem(KEY, JSON.stringify(progress));
  } catch {
    // 無法儲存時不影響使用
  }
}
