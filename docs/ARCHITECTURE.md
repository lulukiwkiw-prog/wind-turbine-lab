# 技術架構與開發計畫

## 1. 專案檔案結構

```
wind-turbine-lab/
├─ index.html                 頁面骨架（canvas + UI 容器）
├─ vite.config.js             base = /wind-turbine-lab/（GitHub Pages）
├─ eslint.config.js
├─ package.json               套件版本全部鎖定（無 ^ ~）
├─ src/
│  ├─ main.js                 進入點：組合各模組、渲染迴圈
│  ├─ spec/
│  │  ├─ turbineSpec.js       ★ 單一資料來源：尺寸、座標、轉軸、階層、配色、齒輪、模擬、難度
│  │  └─ rng.js               固定種子亂數
│  ├─ state/store.js          ★ 集中狀態：模式、難度、動畫速度、暫停、選取、模擬輸入
│  ├─ model/                  只在初始化時建立幾何
│  │  ├─ materials.js         依零件建立材質（取色自 PALETTE），選取標示只改 emissive
│  │  ├─ bladeGeometry.js     葉片斷面放樣（扭轉、漸縮、圓→翼型）
│  │  ├─ turbine.js           依 HIERARCHY 建節點並掛上網格
│  │  └─ site.js              地面、天空、樹（Instanced）、變壓器、輸電線
│  ├─ animation/animator.js   每幀只改旋轉角；讀 store 的暫停／速度
│  ├─ interaction/
│  │  ├─ cameraRig.js         OrbitControls、預設視角、聚焦動畫、直式螢幕自動拉遠
│  │  └─ picking.js           點一下（非拖曳）才選取；Raycaster
│  ├─ learning/partsData.js   零件文字，依難度分層（elementary / junior）
│  └─ ui/                     兒童介面（ui.js、icons.js、style.css）
├─ tests/
│  ├─ spec.test.js            規格一致性（純資料）
│  └─ model.test.js           以 three.js 在 Node 建場景圖，比對世界座標、轉軸與動畫方向
├─ tools/
│  ├─ gen-diagrams.mjs        由規格產生 docs/*.svg 與 connections.md
│  └─ screenshots.mjs         Playwright + SwiftShader 截圖與檢查
├─ docs/                      規格、架構、結構圖、剖面圖、連接關係
└─ screenshots/               每階段測試截圖與 report.json
```

**模組規則**：模型、動畫、互動、學習資料、UI 分開；所有數值從 `turbineSpec.js` 讀取；所有可切換的狀態只放在 `store.js`。

## 2. 零件清單與依賴關係

| 零件 | 群組 | 掛在節點 | 出現階段 | 帶動／依賴 |
|---|---|---|---|---|
| 基礎 | 外觀 | foundation | 1 | 支撐塔架 |
| 塔架 | 外觀 | tower | 1 | 支撐機艙；內有電纜 |
| 葉片 ×3 | 外觀 | pitch0..2 | 1 | 受槳距系統轉動；固定於輪轂 |
| 輪轂／導流罩 | 外觀 | rotor | 1 | 帶動主軸 |
| 機艙外殼 | 外觀 | nacelle | 1 | 隨偏航轉動 |
| 風速計、風向標 | 外觀 | nacelle | 1 | → 控制器 |
| 變壓器、輸電線 | 電力 | world | 1 | 接收電纜電力 |
| 主軸、主軸承 | 內部 | drivetrain | 2 | 輪轂 → 主軸 → 齒輪箱 |
| 齒輪箱 | 內部 | drivetrain | 2（連動 3） | 低速 → 高速 |
| 高速軸、煞車 | 內部 | drivetrain | 2 | → 發電機 |
| 發電機（轉子／定子） | 內部 | drivetrain | 2 | → 電纜 |
| 槳距控制系統 | 內部 | rotor／pitch | 2 | 控制器 → 葉片 |
| 偏航系統 | 內部 | nacelle／tower 頂 | 2 | 控制器 → 機艙 |
| 控制器 | 電力 | nacelle | 2 | 感測器 → 控制器 → 槳距／偏航／煞車 |
| 電力電纜 | 電力 | tower | 2 | 發電機 → 變壓器 |

完整關係圖：[connections.md](connections.md)

## 3. 主要座標與比例

見 [SPEC.md](SPEC.md) 第 2～4 節。重點：1 單位 = 1 m、+Y 朝上、右手系；ψ = 0 時葉輪朝 +Z；風向角為「風吹來的方向」；從上風看順時針。

## 4. 各階段開發順序

| 階段 | 內容 | 驗收重點 |
|---|---|---|
| **1** | 規格、結構圖、外觀模型、外觀探索模式 | 規格測試、模型座標比對、截圖、點選 |
| 2 | 機艙剖視：外殼透明／移除、主軸、軸承、齒輪箱外形、高速軸、煞車、發電機、槳距與偏航系統、控制器、塔內電纜；**地下電纜示意**（地面淡色埋線路徑：塔架底部 → 變壓器 → 第一根電桿，電桿上加往上的引線，點選說明「電纜埋在地下」） | 零件在機艙內不互相穿插、聚焦齒輪箱／發電機、一鍵返回外觀；發電機到輸電線的電力路徑在畫面上連續 |
| 3 | 齒輪實際嚙合（依齒數比旋轉）、爆炸圖、單獨顯示／隱藏／還原、傳動方向箭頭 | 相鄰齒輪角速度比 = 齒數反比、轉向正確 |
| 4 | 發電實驗：風速、風向（偏航跟隨）、槳距；功率曲線、能量流動畫、輸電路徑 | 切入／額定／切出行為；標示「教學示意」 |
| 5 | 學習功能、語音朗讀（Web Speech API，zh-TW）、GitHub Actions 部署 | 無中文語音時隱藏按鈕不報錯；部署後資源可載入 |
| 6 | 國中困難模式：進階說明、公式（P = ½ρAv³Cp）、挑戰題 | 依難度切換文字與挑戰 |

## 5. 可能遇到的技術問題與解法

| 問題 | 解法 |
|---|---|
| 尺度差異大（80 m 塔架 vs. 20 cm 風速計杯），小零件難點選 | 零件清單按鈕可直接選；選取後自動聚焦放大；標籤跟隨零件 |
| 拖曳旋轉時誤觸選取 | 只有移動 < 8 px 且 < 450 ms 的點擊才算選取 |
| 共用材質導致標示一個零件卻整片變色 | 每個零件一個材質實例（初始化時建立），標示只改 emissive |
| 葉片法線或翼型方向錯誤 | 由規格的 `pitchSign` 決定扭轉方向；測試檢查法線朝外、前緣方向、轉向 |
| 葉尖撞塔架 | 傾角 + 錐角 + 懸伸量，由測試計算葉尖離塔架距離 > 5 m |
| 手機效能 | 像素比上限 2；樹與小丘用 InstancedMesh；不開陰影；目前約 26～48 個 draw call、約 2 萬個三角形 |
| 直式手機視野太窄 | 預設視角依螢幕比例自動拉遠（`fitHalfWidth`） |
| 無 GPU 的 CI 截圖 | Chromium `--use-angle=swiftshader` 軟體渲染；截圖做像素統計判斷不是黑畫面 |
| 中文字型 | 系統字型堆疊（PingFang TC / Noto Sans TC / 微軟正黑體），不載入外部字型 |
| 部署路徑 | Vite `base: '/wind-turbine-lab/'`；截圖檢查就用這個路徑載入建置結果 |
| 第三階段齒輪即時嚙合 | 齒輪幾何初始化時產生；每幀只依速比設定角度，並加半齒相位對齊 |
| 語音朗讀難詞 | 學習資料的 `speak` 欄位用同音字（例如「槳距」→「獎句」）確保讀音 |
| 軟體渲染下 fps 偏低 | SwiftShader 的 fps 不代表實機；實機 30 fps 需在中階 Android 手機上實測（尚未驗證） |
