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

export function saveProgress(progress) {
  try {
    window.localStorage.setItem(KEY, JSON.stringify(progress));
  } catch {
    // 無法儲存時不影響使用
  }
}
