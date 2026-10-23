// 語音朗讀：只用瀏覽器內建的語音合成（Web Speech API），不使用外部語音服務。
// 優先選台灣華語（zh-TW）；沒有台灣華語時退而使用其他華語語音；完全沒有中文語音時不顯示朗讀按鈕。
// 粵語（zh-HK）讀法不同，不採用。

// 讀音容易出錯的詞：換成讀音正確的同音字（只用在朗讀，畫面上的字不變）
export const PRONUNCIATION = [
  ['槳距', '獎句'],
  ['順槳', '順獎'],
  ['槳', '獎'],
  ['偏航', '篇杭'],
  ['輪轂', '輪鼓'],
  ['解纜', '解覽'],
  ['電纜', '電覽'],
  ['kW', '千瓦'],
  ['m/s', '公尺每秒'],
  ['rpm', '轉每分鐘'],
  ['×', '乘'],
];

/** 把要朗讀的文字換成讀音正確的版本 */
export function speechText(text) {
  let t = String(text);
  for (const [from, to] of PRONUNCIATION) t = t.split(from).join(to);
  t = t.replace(/(\d+(?:\.\d+)?)\s*[%％]/g, '百分之$1');
  return t.replace(/[（(]([^）)]*)[）)]/g, '，$1，'); // 括號改成停頓
}

/** 從語音清單中挑選：zh-TW 優先 → 其他華語（不含粵語）→ 沒有就回傳 null */
export function pickVoice(voices) {
  const norm = (v) => String(v.lang || '').replace('_', '-').toLowerCase();
  const isTw = (v) => /^zh-tw|^cmn-hant-tw|^zh-hant-tw/.test(norm(v)) || /台灣|taiwan/i.test(v.name || '');
  const isCantonese = (v) => /^zh-hk|^yue/.test(norm(v)) || /粵|廣東|cantonese/i.test(v.name || '');
  const isMandarin = (v) => /^zh|^cmn/.test(norm(v)) && !isCantonese(v);
  return voices.find(isTw) ?? voices.find(isMandarin) ?? null;
}

export function createSpeech() {
  const synth = typeof window !== 'undefined' && 'speechSynthesis' in window && typeof window.SpeechSynthesisUtterance === 'function'
    ? window.speechSynthesis : null;
  let voice = null;
  let queue = []; // 保留正在唸的句子：有些瀏覽器會把沒有被引用的句子回收掉，就收不到「唸完」通知
  const listeners = new Set();

  function refresh() {
    try {
      const next = synth ? pickVoice(synth.getVoices()) : null;
      if (next !== voice) { voice = next; for (const fn of listeners) fn(!!voice); }
    } catch {
      voice = null;
    }
  }
  if (synth) {
    refresh();
    synth.addEventListener?.('voiceschanged', refresh);
  }

  return {
    available: () => !!voice,
    /** 語音清單是非同步載入的：狀態改變時通知（用來顯示／隱藏朗讀按鈕） */
    onChange(fn) { listeners.add(fn); fn(!!voice); return () => listeners.delete(fn); },
    /**
     * text 可以是一段文字或多句（陣列）：多句會依序排隊唸，避免部分瀏覽器唸太長的一句會中斷。
     * onEnd：最後一句唸完（或被打斷）時呼叫；回傳 false 表示沒有唸（呼叫端要自己估計時間）。
     */
    speak(text, { onEnd } = {}) {
      if (!synth || !voice) return false;
      try {
        synth.cancel();
        const parts = (Array.isArray(text) ? text : [text]).filter((x) => String(x).trim());
        queue = parts.map((p, i) => {
          const u = new window.SpeechSynthesisUtterance(speechText(p));
          u.voice = voice;
          u.lang = voice.lang || 'zh-TW';
          u.rate = 0.9; // 稍慢，適合兒童
          u.pitch = 1.05;
          if (onEnd && i === parts.length - 1) { u.onend = onEnd; u.onerror = onEnd; }
          return u;
        });
        for (const u of queue) synth.speak(u);
        return true;
      } catch {
        return false; // 任何錯誤都不打斷畫面
      }
    },
    stop() { try { synth?.cancel(); } catch { /* 忽略 */ } },
  };
}
