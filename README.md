# 風力發電機探索實驗室

給國小三年級（後期加入國中模式）的互動式 3D 風力發電機網站。Three.js + Vite，所有 3D 幾何以程式生成，不使用外部模型、照片或貼圖，執行時不依賴外部 CDN。

> 目前進度：**第三階段**（齒輪箱連動、機械拆解）。

## 開發

```bash
npm ci
npm run dev        # 開發伺服器
npm run build      # 建置到 dist/（base 為 /wind-turbine-lab/）
npm run check      # lint + 規格／模型測試 + 產生圖表 + 建置 + 截圖檢查
```

截圖檢查使用 `playwright-core` 與本機 Chromium（預設 `/opt/pw-browsers/chromium-1194/chrome-linux/chrome`，可用環境變數 `CHROME_PATH` 指定），以 SwiftShader 軟體 WebGL 渲染。

## 文件

- [docs/SPEC.md](docs/SPEC.md)：規格、座標慣例、參考資料與查閱紀錄
- [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md)：檔案結構、零件依賴、階段計畫、技術問題
- [docs/structure.svg](docs/structure.svg)、[docs/nacelle-section.svg](docs/nacelle-section.svg)、[docs/connections.md](docs/connections.md)：由規格自動產生

## 原則

- `src/spec/turbineSpec.js` 是尺寸、座標、轉軸、配色、齒輪與模擬參數的唯一來源。
- `src/state/store.js` 集中管理模式、難度、動畫速度、暫停與選取狀態。
- 幾何只在初始化時建立；動畫只改位置、旋轉與材質。
- 簡化或非精確的數值一律標示「教學示意」。
