// 世界風場：資料要完整（每筆都有來源與年份）、座標合理、分類齊全；小任務與考考你連動正確
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { WORLD_FARMS, WORLD_CATEGORIES, WORLD_TOUR_COUNT, toMapXY, googleMapsUrl } from '../src/learning/worldFarms.js';
import { existsSync } from 'node:fs';
import { WORLD_LAND, DETAIL_LAND } from '../src/data/worldMap.js';
import { missionsFor } from '../src/learning/missions.js';
import { quizFor } from '../src/learning/quiz.js';
import { MODES, CURRENT_STAGE } from '../src/spec/turbineSpec.js';
import { createStore } from '../src/state/store.js';

test('世界風場資料：9 個風場、四個分類都有，不介紹已經拆除的', () => {
  assert.equal(WORLD_FARMS.length, 9);
  for (const id of ['vindeby', 'penghu-1965']) assert.ok(!WORLD_FARMS.some((f) => f.id === id), `${id} 已拆除，不介紹`);
  assert.equal(new Set(WORLD_FARMS.map((f) => f.id)).size, WORLD_FARMS.length, 'id 不重複');
  const count = (c) => WORLD_FARMS.filter((f) => f.category === c).length;
  assert.deepEqual(WORLD_CATEGORIES.map((c) => count(c.id)), [3, 2, 2, 2]);
});

test('世界風場資料：每筆都有文字、比一比、資料年份與 https 來源；座標與放大範圍合理', () => {
  for (const f of WORLD_FARMS) {
    for (const k of ['title', 'place', 'year', 'headline', 'text', 'compare', 'icon', 'asOf']) assert.ok(f[k], `${f.id}.${k}`);
    assert.ok(f.text.length <= 130, `${f.id}：說明不要太長`);
    assert.match(f.asOf, /^\d{4}$/);
    assert.ok(f.sources.length >= 1);
    for (const s of f.sources) assert.match(s.url, /^https:\/\//, `${f.id} 來源`);
    assert.ok(f.lat >= -90 && f.lat <= 90 && f.lon >= -180 && f.lon <= 180, `${f.id} 座標`);
    assert.ok([6, 30, 70].includes(f.zoom));
    const { x, y } = toMapXY(f.lat, f.lon);
    assert.ok(x >= 0 && x <= 360 && y >= 0 && y <= 180);
  }
  // 台灣的風場要在台灣附近；放大時用細一點的海岸線
  for (const f of WORLD_FARMS.filter((x) => x.category === 'taiwan')) {
    const [w, s, e, n] = DETAIL_LAND.taiwan.box;
    assert.ok(f.lon > w && f.lon < e && f.lat > s && f.lat < n, f.id);
    // 共用中心放大時，台灣的地標都在畫面內（手機地圖寬高比約 0.48）
    const half = { lon: f.zoom / 2, lat: (f.zoom * 0.48) / 2 };
    for (const g of WORLD_FARMS.filter((x) => x.category === 'taiwan')) {
      assert.ok(Math.abs(g.lon - f.center.lon) < half.lon && Math.abs(g.lat - f.center.lat) < half.lat, `${f.id} 看得到 ${g.id}`);
    }
  }
});

test('比一比的數字和網站風機一致（葉片約 43 公尺、單機 2000 kW）', () => {
  const by = (id) => WORLD_FARMS.find((f) => f.id === id);
  assert.match(by('biggest-turbine').compare, /3\.5 倍/);
  assert.ok(Math.abs(153 / 43 - 3.5) < 0.1);
  assert.match(by('jiuquan').compare, /5,000 台/);
  assert.equal(10_000_000 / 2000, 5000);
  assert.match(by('north-sea-giants').compare, /1,800 倍/);
  assert.equal(3_600_000 / 2000, 1800);
  assert.match(by('tibet').compare, /3,952 公尺/);
});

test('在 Google 地圖看衛星圖：每個風場都有連結', () => {
  for (const f of WORLD_FARMS) {
    assert.ok(Number.isInteger(f.mapZoom) && f.mapZoom >= 3 && f.mapZoom <= 18, `${f.id} mapZoom`);
    const u = new URL(googleMapsUrl(f));
    assert.equal(u.origin, 'https://www.google.com');
    assert.equal(u.searchParams.get('api'), '1');
    assert.equal(u.searchParams.get('basemap'), 'satellite');
    assert.equal(u.searchParams.get('center'), `${f.lat},${f.lon}`);
  }
});

test('照片（可省略）：有照片就要有作者、授權與原始頁面，檔案要存在；只接受自由授權', () => {
  for (const f of WORLD_FARMS.filter((x) => x.photo)) {
    const p = f.photo;
    for (const k of ['file', 'alt', 'credit', 'license', 'licenseUrl', 'page']) assert.ok(p[k], `${f.id}.photo.${k}`);
    assert.match(p.license, /^(CC BY(-SA)? [0-9.]+|CC0|Public domain|公有領域|政府網站資料開放宣告)/, `${f.id} 授權`);
    assert.match(p.page, /^https:\/\/commons\.wikimedia\.org\//);
    assert.ok(existsSync(new URL(`../public/world/${p.file}`, import.meta.url)), `${f.id} 照片檔`);
    assert.match(p.licenseUrl, /^https:\/\//);
  }
  assert.equal(WORLD_FARMS.filter((x) => x.photo).length, 5, '目前有照片的風場');
});

test('地圖資料：世界與放大區域的陸地路徑都存在', () => {
  assert.ok(WORLD_LAND.startsWith('M') && WORLD_LAND.length > 10000);
  for (const [name, r] of Object.entries(DETAIL_LAND)) assert.ok(r.path.length > 500, name);
});

test('世界風場是第五個玩法；狀態檢查正確', () => {
  assert.equal(MODES.world.label, '世界風場');
  assert.ok(MODES.world.stage <= CURRENT_STAGE);
  const s = createStore();
  const warn = console.warn;
  console.warn = () => {};
  s.set({ mode: 'world', worldFarm: 'tibet', worldFilter: 'extreme', worldSeen: ['tibet'] });
  s.set({ worldFarm: 'atlantis', worldFilter: 'moon', worldSeen: ['tibet', 'tibet'] });
  console.warn = warn;
  assert.equal(s.get().mode, 'world');
  assert.equal(s.get().worldFarm, 'tibet', '不存在的風場不接受');
  assert.equal(s.get().worldFilter, 'extreme');
  assert.deepEqual(s.get().worldSeen, ['tibet'], '看過的清單不重複');
});

test('小任務「環遊世界」：看過 3 個風場才完成', () => {
  const m = missionsFor('elementary').find((x) => x.id === 'world-tour');
  assert.ok(m);
  const ctx = (seen) => ({ state: { worldSeen: seen }, sim: {} });
  assert.equal(WORLD_TOUR_COUNT, 3);
  assert.equal(m.check(ctx(['tibet', 'jiuquan'])), false);
  assert.equal(m.check(ctx(['tibet', 'jiuquan', 'ross-island'])), true);
});

test('考考你：3 題世界風場題目，答案與資料一致', () => {
  const qs = quizFor('elementary');
  const find = (kw) => qs.find((q) => q.q.includes(kw));
  const high = find('玉山');
  assert.equal(high.options[high.answer], '中國西藏');
  const float = find('海太深');
  assert.match(float.options[float.answer], /浮體/);
  const tw = find('海上風場，蓋在哪個縣');
  assert.equal(tw.options[tw.answer], '苗栗');
  assert.ok(WORLD_FARMS.find((f) => f.id === 'formosa-1').place.includes('苗栗'));
});
