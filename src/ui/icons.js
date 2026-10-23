// 內嵌 SVG 圖示（不依賴外部字型或圖片）
const svg = (body) => `<svg viewBox="0 0 24 24" width="28" height="28" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${body}</svg>`;

export const ICONS = {
  reset: svg('<path d="M3 12a9 9 0 1 0 3-6.7"/><path d="M3 4v5h5"/>'),
  pause: svg('<rect x="6" y="5" width="4" height="14" rx="1"/><rect x="14" y="5" width="4" height="14" rx="1"/>'),
  play: svg('<path d="M7 5l12 7-12 7z"/>'),
  slow: svg('<circle cx="12" cy="13" r="8"/><path d="M12 9v4l2.5 2"/><path d="M9 2h6"/>'),
  list: svg('<path d="M8 6h13M8 12h13M8 18h13"/><circle cx="3.5" cy="6" r="1"/><circle cx="3.5" cy="12" r="1"/><circle cx="3.5" cy="18" r="1"/>'),
  close: svg('<path d="M6 6l12 12M18 6L6 18"/>'),
  more: svg('<path d="M6 9l6 6 6-6"/>'),
  less: svg('<path d="M6 15l6-6 6 6"/>'),
  front: svg('<rect x="4" y="4" width="16" height="16" rx="2"/><circle cx="12" cy="12" r="3"/>'),
  side: svg('<path d="M3 12h12"/><path d="M15 7l6 5-6 5z"/>'),
  nacelle: svg('<circle cx="11" cy="11" r="7"/><path d="M21 21l-5-5"/><path d="M8 11h6M11 8v6"/>'),
  turbine: svg('<path d="M12 12v10"/><path d="M12 12l-1-9 2 0z"/><path d="M12 12l8 5-1 1.7z"/><path d="M12 12l-8 5 1 1.7z"/>'),
  cw: svg('<path d="M20 12a8 8 0 1 1-2.3-5.7"/><path d="M20 4v4h-4"/>'),
  ccw: svg('<path d="M4 12a8 8 0 1 0 2.3-5.7"/><path d="M4 4v4h4"/>'),
  lock: svg('<rect x="5" y="11" width="14" height="10" rx="2"/><path d="M8 11V8a4 4 0 0 1 8 0v3"/>'),
};
