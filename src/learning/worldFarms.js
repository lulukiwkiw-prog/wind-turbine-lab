// 世界風場：給小朋友看的特別風場。每一筆都附資料來源與資料年份（asOf）。
// 「世界第一」這類紀錄會變動，還在變動或有爭議的寫在 note，畫面上會顯示。
// lat／lon：地圖上的位置（度，北緯、東經為正）；zoom：選到時地圖顯示的寬度（經度）；
// mapZoom：「在 Google 地圖看」按鈕打開衛星圖時的縮放；mapNote：打開前的提醒（例如已拆除）。
// photo（可省略）：自由授權照片 { file（public/world/ 底下）, alt, credit（作者）, license, licenseUrl, page（照片原始頁面）}。
// center：放大時的地圖中心（沒寫就用風場本身）。台灣三處共用同一個中心，三個地標都看得到，也不會被按鈕擋住。
// 比一比（compare）的數字以本網站風機為準：葉片約 43 公尺、單機 2000 kW。

const TAIWAN_CENTER = { lat: 23.75, lon: 120.0 };

export const WORLD_CATEGORIES = [
  { id: 'record', label: '世界之最', color: '#e8590c' },
  { id: 'offshore', label: '海上與浮動', color: '#1e7fd6' },
  { id: 'extreme', label: '特殊環境', color: '#7048e8' },
  { id: 'taiwan', label: '台灣', color: '#2f9e44' },
];

export const WORLD_FARMS = [
  {
    id: 'biggest-turbine', category: 'record', icon: '🏆',
    title: '世界最大的風機', place: '中國山東・東營測試場', year: '2025 年',
    lat: 37.6, lon: 118.9, zoom: 70, mapZoom: 11,
    mapNote: '大約在山東東營一帶；測試場的確切位置沒有公開資料。',
    headline: '一台就有 26 MW！',
    text: '2025 年，中國在山東的測試場裝好一台 26 MW 的海上風機，是目前最大的一台。它的葉輪直徑 310 公尺，一片葉片就有 153 公尺長。',
    compare: '我們網站的葉片大約 43 公尺，它的葉片大約是 3.5 倍長！',
    note: '它是測試機，還不在一般的商業風場裡。',
    asOf: '2025',
    sources: [
      { title: 'offshorewind.biz（2026）', url: 'https://www.offshorewind.biz/2026/01/01/offshore-wind-turbines-in-2025-china-continues-leading-in-single-unit-capacity-vestass-15-mw-turbine-installed-at-offshore-wind-farms/' },
      { title: 'Recharge', url: 'https://www.rechargenews.com/technology/worlds-most-powerful-wind-turbine-installed-in-china/2-1-1864616' },
    ],
  },
  {
    id: 'jiuquan', category: 'record', icon: '🏜️',
    title: '甘肅酒泉風電基地', place: '中國甘肅・戈壁沙漠', year: '2009 年開工',
    lat: 40.5, lon: 96.0, zoom: 70, mapZoom: 10,
    headline: '沙漠裡的超大風場',
    text: '在戈壁沙漠上，數千座風機排成一大片。報導說這裡已經有大約 1,000 萬 kW，目標是 2,000 萬 kW。',
    compare: '1,000 萬 kW 大約等於 5,000 台我們網站的風機（每台 2,000 kW）。',
    note: '「世界最大風場」的說法多半來自比較舊的資料，現在的排名很難確認。',
    asOf: '2024',
    sources: [
      { title: 'Guinness World Records', url: 'https://www.guinnessworldrecords.com/world-records/highest-capacity-wind-farm' },
      { title: 'China Daily（2024）', url: 'https://regional.chinadaily.com.cn/gansu/2024-10/12/c_1035006.htm' },
    ],
  },
  {
    id: 'north-sea-giants', category: 'record', icon: '🏆',
    title: '英國北海的巨型海上風場', place: '英國外海・北海', year: '2022 年起',
    lat: 54.4, lon: 1.9, zoom: 30, mapZoom: 8,
    mapNote: '風場在離岸很遠的海上，要放大很多才看得到風機。',
    headline: '海上風場的大巨人',
    text: 'Hornsea 2 在 2022 年全部啟用，大約 130 萬 kW。附近的 Dogger Bank 完工後會有 277 座風機、360 萬 kW，可以供應大約 600 萬戶英國家庭用電。',
    compare: '360 萬 kW 是我們網站一台風機的 1,800 倍！',
    note: 'Dogger Bank 還在分期完工，部分工程延到 2027 年（資料至 2026 年）。',
    asOf: '2026',
    sources: [
      { title: 'Enerdata：Hornsea 2 全部運轉', url: 'https://www.enerdata.net/publications/daily-energy-news/orsteds-13-gw-hornsea-2-offshore-wind-farm-reaches-full-operation-uk.html' },
      { title: 'Equinor：Dogger Bank', url: 'https://www.equinor.com/en/energy/uk-wind' },
      { title: 'Energy Voice：Dogger Bank 時間表', url: 'https://www.energyvoice.com/renewables-energy-transition/wind/595345/dogger-bank-wind-farm-timeline/' },
    ],
  },
  {
    id: 'vindeby', category: 'record', icon: '🏆',
    title: '世界第一座海上風場', place: '丹麥・洛蘭島外海', year: '1991 年',
    lat: 54.97, lon: 11.13, zoom: 30, mapZoom: 12,
    mapNote: '這座風場已在 2017 年拆除，地圖上看不到風機了。',
    headline: '海上風場從這裡開始',
    text: '1991 年，丹麥在海上蓋了 11 座風機，證明風機也能在海上發電。它的地基參考了燈塔的做法。運轉 25 年後，在 2017 年拆除，零件也回收了。',
    compare: '那時一台是 450 kW，現在最大的有 26 MW，大了 50 多倍！',
    asOf: '2017',
    sources: [
      { title: 'Ørsted：世界第一座海上風場拆除', url: 'https://orsted.com/en/media/news/2017/09/worlds-first-offshore-wind-farm-now-dismantled' },
      { title: 'Wikipedia：Vindeby', url: 'https://en.wikipedia.org/wiki/Vindeby_Offshore_Wind_Farm' },
    ],
  },
  {
    id: 'hywind-scotland', category: 'offshore', icon: '🌊',
    title: '會漂在海上的風機', place: '英國蘇格蘭・彼得黑德外海', year: '2017 年',
    lat: 57.48, lon: -1.35, zoom: 30, mapZoom: 11,
    mapNote: '風場在離岸的海上，要放大才看得到。',
    headline: '世界第一座浮動式風場',
    text: '這裡的風機不是插在海底，而是站在像大浮標的浮體上，再用纜繩拉住。海太深、不能打樁的地方也能蓋。這裡有 5 座風機。',
    compare: '浮體下面很重，像不倒翁一樣，風再大也不會翻倒。',
    asOf: '2022',
    sources: [
      { title: 'Equinor：Hywind Scotland 5 週年', url: 'https://www.equinor.com/news/hywind-5-years-world-first-floating-wind-farm' },
    ],
  },
  {
    id: 'hywind-tampen', category: 'offshore', icon: '🛢️',
    title: '幫海上油井供電的風場', place: '挪威・北海', year: '2022 年',
    lat: 61.3, lon: 2.25, zoom: 30, mapZoom: 9,
    mapNote: '風場在離岸大約 140 公里的海上，衛星圖不一定拍得到。',
    headline: '在大海中間的浮動風場',
    text: '在離岸大約 140 公里的北海，有 11 座浮動風機，一共 88 MW。它供應附近幾座海上油氣平台大約 35% 的用電，平台就能少燒一些天然氣。',
    compare: '離岸 140 公里，差不多是從台北到台中的直線距離！',
    asOf: '2023',
    sources: [
      { title: 'Wikipedia：Hywind Tampen', url: 'https://en.wikipedia.org/wiki/Hywind_Tampen' },
      { title: 'POWER Magazine', url: 'https://powermag.com/first-floating-offshore-wind-farm-to-power-oil-and-gas-platforms-kicks-off' },
    ],
  },
  {
    id: 'tibet', category: 'extreme', icon: '🏔️',
    title: '比玉山還高的風場', place: '中國西藏・昌都八宿等地', year: '近幾年',
    lat: 30.05, lon: 96.9, zoom: 70, mapZoom: 9,
    mapNote: '大約在昌都八宿一帶，要自己放大找風機。',
    headline: '世界屋脊上的風機',
    text: '西藏有好幾座風場蓋在海拔 5,000 公尺以上。那裡空氣很稀薄、又很冷，風機要特別設計。昌都八宿的風場最常被說是「世界最高」，最高點接近 5,200 公尺。',
    compare: '玉山是 3,952 公尺，這裡比玉山還高 1,000 多公尺！',
    note: '「世界最高」有好幾座在爭，要看是算平均高度，還是最高的一座風機。',
    asOf: '2024',
    sources: [
      { title: 'Sungrow：海拔 5,200 公尺的風場', url: 'https://www.sungrowpower.com/au/en/cases/how-sungrow-energizes-the-worlds-highest-wind-farm-at-5200-meters' },
      { title: 'Recharge：西藏 5,100 公尺風場', url: 'https://www.rechargenews.com/wind/at-5-100-metres-is-this-tibet-wind-farm-the-highest-in-the-world-/2-1-1457917' },
    ],
  },
  {
    id: 'ross-island', category: 'extreme', icon: '🐧',
    title: '在南極發電的風機', place: '南極・羅斯島', year: '2010 年',
    lat: -77.85, lon: 166.7, zoom: 70, mapZoom: 12,
    headline: '世界最南邊的風場之一',
    text: '南極的羅斯島上有風機，同時供電給紐西蘭的史考特基地和美國的麥克默多站。兩個基地用的電規格不一樣，還要轉換才能一起用。現在正在換新風機，目標是新基地 90% 以上用再生能源。',
    compare: '新風機只能等 11 月到 3 月南極的夏天，冰比較好走時才運得進去。',
    asOf: '2025',
    sources: [
      { title: '紐西蘭風能協會：Ross Island', url: 'https://windenergy.org.nz/ross-island-wind-farm' },
      { title: 'Antarctica NZ：新風機', url: 'https://www.antarcticanz.govt.nz/media/news/new-turbines-for-the-windiest-continent' },
      { title: 'Scott Base 風場更新', url: 'https://scottbaseredevelopment.govt.nz/wind-farm-upgrade' },
    ],
  },
  {
    id: 'penghu-1965', category: 'taiwan', icon: '🇹🇼',
    title: '台灣第一座風機', place: '台灣澎湖・後寮', year: '1965 年',
    lat: 23.66, lon: 119.6, zoom: 6, center: TAIWAN_CENTER, mapZoom: 11,
    mapNote: '1965 年那一台已經不在了，可以找找看今天澎湖的風機。',
    headline: '台灣風力發電的起點',
    text: '1965 年，台電在澎湖後寮裝了一台 50 kW 的風機，接上電網，運轉了 8 年。澎湖冬天的東北季風很強，很適合風力發電。',
    compare: '它是 50 kW，我們網站的風機是 2,000 kW，大了 40 倍！',
    asOf: '2024',
    sources: [
      { title: '關鍵評論網：台灣風電的故事', url: 'https://www.thenewslens.com/article/257706' },
    ],
  },
  {
    id: 'formosa-1', category: 'taiwan', icon: '🇹🇼',
    title: '台灣第一座商業海上風場', place: '台灣苗栗・竹南外海', year: '2019 年',
    lat: 24.72, lon: 120.83, zoom: 6, center: TAIWAN_CENTER, mapZoom: 12,
    headline: '海洋風電（Formosa 1）',
    text: '在苗栗竹南外海 2～6 公里，有 20 座 6 MW 的風機，2019 年底完工。一年大約發 4.8 億度電，可以給大約 11 萬戶家庭用。',
    compare: '一台 6 MW，是我們網站風機的 3 倍。',
    asOf: '2019',
    sources: [
      { title: 'TechNews 科技新報', url: 'https://technews.tw/2019/05/19/offshore-wind-starting/' },
      { title: '台灣英文新聞', url: 'https://www.taiwannews.com.tw/zh/news/3705651' },
    ],
  },
  {
    id: 'taiwan-strait', category: 'taiwan', icon: '🇹🇼',
    title: '台灣海峽的好風', place: '台灣海峽・彰化外海一帶', year: '2014 年研究',
    lat: 24.1, lon: 120.05, zoom: 6, center: TAIWAN_CENTER, mapZoom: 9,
    headline: '世界頂尖的風',
    text: '國際顧問公司 4C Offshore 在 2014 年的研究說，全世界風況最好的 20 處海上風場，有 16 處在台灣海峽。冬天的東北季風吹過窄窄的海峽，風又強又穩。',
    compare: '最好的 20 個地方裡，台灣海峽就占了 16 個！',
    note: '這份研究是 2014 年發表的，之後沒有找到更新的排名。',
    asOf: '2014',
    sources: [
      { title: 'TechNews 科技新報', url: 'https://technews.tw/2018/07/09/taiwan-develop-offshore-wind-power/' },
    ],
  },
];

/** 地圖座標：x = 經度 + 180、y = 90 − 緯度（與 worldMap.js 相同） */
export const toMapXY = (lat, lon) => ({ x: lon + 180, y: 90 - lat });

/** 用 Google 地圖網址 API 打開衛星圖（只是連結，網站本身不載入 Google 的任何東西） */
export const googleMapsUrl = (f) =>
  `https://www.google.com/maps/@?api=1&map_action=map&center=${f.lat},${f.lon}&zoom=${f.mapZoom}&basemap=satellite`;

/** 小任務「環遊世界」需要看幾個風場 */
export const WORLD_TOUR_COUNT = 3;
