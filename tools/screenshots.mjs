// 以無頭 Chromium（軟體 WebGL：SwiftShader）截圖並做基本檢查
// 用法：npm run build && node tools/screenshots.mjs
// 檢查項目：
//   - 頁面無 JavaScript 錯誤
//   - 每張截圖不是黑畫面或空白畫面（像素統計）
//   - 點選測試：投影零件位置到螢幕後點選，應得到正確零件
import { preview } from 'vite';
import { chromium } from 'playwright-core';
import { mkdirSync, writeFileSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';

const OUT = resolve('screenshots');
mkdirSync(OUT, { recursive: true });

const CANDIDATES = [
  process.env.CHROME_PATH,
  '/opt/pw-browsers/chromium-1194/chrome-linux/chrome',
].filter(Boolean);
const executablePath = CANDIDATES.find((p) => existsSync(p));

const server = await preview({ preview: { port: 4173, strictPort: true }, logLevel: 'warn' });
const url = 'http://localhost:4173/wind-turbine-lab/?notour';
const urlWithTour = 'http://localhost:4173/wind-turbine-lab/';

const browser = await chromium.launch({
  executablePath,
  args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--enable-webgl'],
});

const failures = [];
const report = [];

async function openPage(viewport, opts = {}, { target = url, init = null } = {}) {
  const ctx = await browser.newContext({ viewport, deviceScaleFactor: 1, ...opts });
  if (init) await ctx.addInitScript(init);
  const page = await ctx.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(String(e)));
  page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
  await page.goto(target);
  await page.waitForFunction(() => window.__lab?.ready === true, null, { timeout: 30000 });
  return { ctx, page, errors };
}

/** 讓畫面停在固定狀態：暫停動畫、固定葉輪角度、跳到視角，並等幾幀 */
async function pose(page, view, { part = null, rotor = 20 } = {}) {
  await page.evaluate(({ view, part, rotor }) => {
    const lab = window.__lab;
    lab.store.set({ mode: 'exterior', paused: true, selectedPart: null, openPanel: null });
    lab.setRotorAngleDeg(rotor);
    lab.jumpView(view);
    if (part) lab.store.set({ selectedPart: part });
  }, { view, part, rotor });
  await page.waitForTimeout(part ? 1600 : 500);
}

/** 剖視模式：外殼 transparent / hidden，可選擇聚焦零件 */
async function cutaway(page, shellView, part = null) {
  await page.evaluate(({ shellView, part }) => {
    const lab = window.__lab;
    lab.store.set({ mode: 'exterior', selectedPart: null, openPanel: null, paused: true });
    lab.setRotorAngleDeg(20);
    lab.store.set({ mode: 'cutaway' });
    lab.store.set({ shellView });
    lab.jumpView('cutaway');
    if (part) lab.selectPart(part);
  }, { shellView, part });
  await page.waitForTimeout(part ? 1600 : 500);
}

/** 拆解模式：立即拆開，可指定視角、聚焦零件、隱藏或只看某零件 */
async function explode(page, { view = 'explode', part = null, gears = false, hidden = [], solo = null } = {}) {
  await page.evaluate(({ view, part, gears, hidden, solo }) => {
    const lab = window.__lab;
    lab.store.set({ mode: 'exterior', selectedPart: null, openPanel: null, paused: true });
    lab.setRotorAngleDeg(20);
    lab.store.set({ mode: 'explode' });
    lab.exploder.setInstant(1);
    lab.store.set({ hiddenParts: hidden, soloPart: solo });
    lab.jumpView(view);
    if (part) lab.selectPart(part);
    if (gears) lab.focusGears();
  }, { view, part, gears, hidden, solo });
  await page.waitForTimeout(part || gears ? 1600 : 500);
}

/** 發電實驗：設定風速／風向／槳距後讓模擬跑一段時間，再暫停截圖 */
async function experiment(page, { wind = 8, angle = 0, seconds = 40, view = 'experiment', shell = 'solid', pitchAuto = true, pitchDeg = 0, after = null } = {}) {
  const now = await page.evaluate(({ wind, angle, seconds, view, shell, pitchAuto, pitchDeg, after }) => {
    const lab = window.__lab;
    lab.store.set({ mode: 'exterior', selectedPart: null, openPanel: null });
    lab.store.set({ mode: 'experiment' });
    lab.store.set({ paused: false, windSpeed: wind, windAngleDeg: angle, pitchAuto, pitchDeg, shellView: shell });
    for (let t = 0; t < seconds; t += 0.05) lab.sim.step(0.05);
    if (after) { lab.store.set(after.patch); for (let t = 0; t < after.seconds; t += 0.05) lab.sim.step(0.05); }
    lab.store.set({ paused: true });
    lab.animator.update(0);
    lab.flows.update(0.016, true);
    lab.jumpView(view);
    return lab.sim.get();
  }, { wind, angle, seconds, view, shell, pitchAuto, pitchDeg, after });
  await page.waitForTimeout(700);
  return now;
}

/** 檢查風機輪轂在面板沒擋住的地方 */
/** 點機艙附近的零件後，鏡頭要看得到它（零件中心點得到，不被葉片擋住） */
async function rotorOcclusionCheck(page, tag, shotPrefix) {
  const parts = ['nacelle', 'anemometer', 'windVane', 'hub', 'pitchSystem', 'generator', 'gearbox'];
  const bad = [];
  for (const id of parts) {
    await page.evaluate((id) => {
      const lab = window.__lab;
      lab.store.set({ mode: 'exterior', selectedPart: null, openPanel: null, paused: true });
      lab.setRotorAngleDeg(20);
      lab.jumpView('default');
      lab.selectPart(id);
    }, id);
    await page.waitForTimeout(1500);
    // 中心點不能是葉片；中心或附近（環狀零件中間是空的，例如變槳系統）要點得到這個零件
    const r = await page.evaluate((id) => {
      const lab = window.__lab;
      const p = lab.partScreen(id);
      const picked = lab.pickAt(p.x, p.y);
      let near = picked === id;
      for (let dx = -60; dx <= 60 && !near; dx += 20) for (let dy = -60; dy <= 60 && !near; dy += 20) near = lab.pickAt(p.x + dx, p.y + dy) === id;
      // 葉輪會轉：轉一圈（每 5°，三片葉片 120° 一循環）看葉片會不會擋到零件中心
      let bladeAngles = 0;
      for (let a = 0; a < 120; a += 5) { lab.setRotorAngleDeg(a); lab.scene.updateMatrixWorld(true); if (lab.pickAt(p.x, p.y) === 'blade') bladeAngles++; }
      lab.setRotorAngleDeg(20);
      return { id, picked, near, bladeAngles, x: Math.round(p.x), y: Math.round(p.y) };
    }, id);
    if (!r.near || r.bladeAngles > 0) bad.push(r);
    if (shotPrefix && (id === 'nacelle' || id === 'hub')) await shoot(page, `${shotPrefix}-${id}`);
  }
  report.push({ name: `${tag}：點機艙附近的零件不被葉片擋住`, bad, ok: bad.length === 0 });
  if (bad.length) failures.push(`${tag}：零件被擋住 ${JSON.stringify(bad)}`);
  await page.evaluate(() => window.__lab.store.set({ mode: 'exterior', selectedPart: null }));
}

/** 開場提示：碰一下畫面就淡出 */
async function hintCheck(page, tag) {
  const before = await page.evaluate(() => !document.querySelector('.hint').classList.contains('gone'));
  await page.mouse.click(5, 400);
  const after = await page.evaluate(() => document.querySelector('.hint').classList.contains('gone'));
  report.push({ name: `${tag}：開場提示碰一下就淡出`, before, after, ok: before && after });
  if (!(before && after)) failures.push(`${tag}：開場提示 ${JSON.stringify({ before, after })}`);
}

/** 剖視／拆解的說明預設收起來（不擋住 3D 畫面），點按鈕才展開 */
async function notesCheck(page, name, shot) {
  const state = () => page.evaluate(() => {
    const vis = (sel) => [...document.querySelectorAll(sel)].some((e) => e.offsetParent !== null && getComputedStyle(e).display !== 'none' && !e.hidden);
    return { speeds: vis('.speedrow'), note: vis('.top .cutnote'), headBottom: Math.round(document.querySelector('#ui .top').getBoundingClientRect().bottom) };
  });
  const closed = await state();
  const explodeMode = await page.evaluate(() => window.__lab.store.get().mode === 'explode');
  if (explodeMode) await page.click('.cutbar.open [data-ex="speeds"]');
  await page.click('.cutbar.open .note-toggle');
  await page.waitForTimeout(200);
  const open = await state();
  if (shot) await shoot(page, shot);
  if (explodeMode) await page.click('.cutbar.open [data-ex="speeds"]');
  await page.click('.cutbar.open .note-toggle');
  const again = await state();
  const ok = !closed.speeds && !closed.note && open.note && open.speeds === explodeMode && open.headBottom > closed.headBottom && !again.note && !again.speeds;
  report.push({ name, closed, open, ok });
  if (!ok) failures.push(`${name}：${JSON.stringify({ closed, open, again })}`);
}

/** 實際點「看機艙裡面」：外殼要變透明、鏡頭要飛到機艙旁；再點一次回到整台風機 */
async function insideButtonCheck(page, name, shot) {
  const btn = page.locator('.xp-views .btn', { hasText: '看機艙裡面' });
  const probe = () => page.evaluate(() => {
    const lab = window.__lab;
    const cam = lab.scene.userData.camera;
    const p = lab.nodes.nacelle.getWorldPosition(lab.nodes.nacelle.position.clone());
    return { shell: lab.store.get().shellView, dist: Math.round(cam.position.distanceTo(p)) };
  });
  await btn.click();
  await page.waitForTimeout(1800);
  const inside = await probe();
  await shoot(page, shot);
  await btn.click();
  await page.waitForTimeout(1800);
  const back = await probe();
  const ok = inside.shell !== 'solid' && inside.dist < 60 && back.shell === 'solid' && back.dist > 80;
  report.push({ name, inside, back, ok });
  if (!ok) failures.push(`${name}：${JSON.stringify({ inside, back })}`);
}

async function turbineVisibleCheck(page, name) {
  await page.waitForTimeout(1200); // 等畫面平滑移動完成
  const r = await page.evaluate(() => {
    const lab = window.__lab;
    const cam = lab.scene.userData.camera;
    cam.updateMatrixWorld();
    const v = lab.nodes.rotor.getWorldPosition(lab.nodes.rotor.position.clone()).project(cam);
    const hub = { x: (v.x * 0.5 + 0.5) * innerWidth, y: (-v.y * 0.5 + 0.5) * innerHeight };
    const rect = document.querySelector('.xp').getBoundingClientRect();
    return { hub, panel: { top: rect.top, right: rect.right, width: rect.width }, w: innerWidth, h: innerHeight, shift: lab.viewShift() };
  });
  const bottomPanel = r.panel.width > r.w * 0.6;
  const ok = r.hub.x > 0 && r.hub.x < r.w && r.hub.y > 0 && (bottomPanel ? r.hub.y < r.panel.top - 20 : r.hub.x > r.panel.right + 20);
  report.push({ name, hub: { x: Math.round(r.hub.x), y: Math.round(r.hub.y) }, panelTop: Math.round(r.panel.top), panelRight: Math.round(r.panel.right), ok });
  if (!ok) failures.push(`${name}：輪轂被面板擋住 ${JSON.stringify(r)}`);
}

/** 截圖並以像素統計檢查不是黑畫面／空白畫面 */
async function shoot(page, name) {
  const buf = await page.screenshot();
  writeFileSync(resolve(OUT, `${name}.png`), buf);
  const stats = await page.evaluate(async (b64) => {
    const img = new Image();
    img.src = `data:image/png;base64,${b64}`;
    await img.decode();
    const c = document.createElement('canvas');
    c.width = img.width; c.height = img.height;
    const g = c.getContext('2d');
    g.drawImage(img, 0, 0);
    const d = g.getImageData(0, 0, c.width, c.height).data;
    let dark = 0, n = 0, sum = 0, sum2 = 0;
    const colors = new Set();
    for (let i = 0; i < d.length; i += 4 * 7) {
      const l = 0.299 * d[i] + 0.587 * d[i + 1] + 0.114 * d[i + 2];
      if (l < 12) dark++;
      sum += l; sum2 += l * l; n++;
      colors.add((d[i] >> 4) << 8 | (d[i + 1] >> 4) << 4 | (d[i + 2] >> 4));
    }
    const mean = sum / n;
    return { darkFrac: dark / n, std: Math.sqrt(sum2 / n - mean * mean), colors: colors.size, mean };
  }, buf.toString('base64'));
  const ok = stats.darkFrac < 0.5 && stats.std > 8 && stats.colors > 40;
  report.push({ name, ...Object.fromEntries(Object.entries(stats).map(([k, v]) => [k, Math.round(v * 1000) / 1000])), ok });
  if (!ok) failures.push(`截圖 ${name} 疑似黑畫面或空白：${JSON.stringify(stats)}`);
}

/** 把零件節點投影到螢幕，並用相同的點選邏輯檢查能點到它 */
async function pickCheck(page, nodeName, expected, offset = [0, 0, 0]) {
  const got = await page.evaluate(({ nodeName, offset }) => {
    const lab = window.__lab;
    let obj = null;
    lab.scene.traverse((o) => { if (o.name === nodeName) obj = o; });
    const v = obj.localToWorld(obj.position.clone().set(...offset));
    const cam = lab.scene.userData.camera;
    v.project(cam);
    const x = (v.x * 0.5 + 0.5) * window.innerWidth;
    const y = (-v.y * 0.5 + 0.5) * window.innerHeight;
    return lab.pickAt(x, y);
  }, { nodeName, offset });
  const ok = got === expected;
  report.push({ name: `點選 ${nodeName}`, expected, got, ok });
  if (!ok) failures.push(`點選 ${nodeName} 應為 ${expected}，實際為 ${got}`);
}

try {
  // ---------- 桌面 ----------
  {
    const { ctx, page, errors } = await openPage({ width: 1280, height: 800 });
    await pose(page, 'default');
    await shoot(page, '01-overview');
    await pose(page, 'front');
    await shoot(page, '02-front');
    await pose(page, 'side');
    await shoot(page, '03-side');
    await pose(page, 'nacelle');
    await shoot(page, '04-nacelle-closeup');
    await pose(page, 'default', { part: 'hub' });
    await shoot(page, '05-select-hub');
    await page.evaluate(() => window.__lab.store.set({ infoExpanded: true }));
    await page.waitForTimeout(300);
    await shoot(page, '06-info-expanded');

    // ---------- 第二階段：機艙剖視 ----------
    await cutaway(page, 'transparent');
    await shoot(page, '10-cutaway-transparent');
    await pickCheck(page, 'gearboxParallel', 'gearbox');
    await pickCheck(page, 'generatorRotor', 'generator', [0, 0, -4.75]);
    await cutaway(page, 'hidden');
    await shoot(page, '11-cutaway-shell-removed');
    await pickCheck(page, 'mainShaftBody', 'mainShaft', [0, 0, 2.1]);
    await cutaway(page, 'transparent', 'gearbox');
    await shoot(page, '12-focus-gearbox');
    await cutaway(page, 'transparent', 'generator');
    await shoot(page, '13-focus-generator');
    await cutaway(page, 'transparent', 'pitchSystem');
    await shoot(page, '14-hub-pitch-system');
    await cutaway(page, 'transparent', 'yawSystem');
    await shoot(page, '15-yaw-system');
    // 電力路徑：塔內電纜 → 地下電纜 → 變壓器 → 電桿
    await cutaway(page, 'transparent');
    await page.evaluate(() => window.__lab.jumpView('cable'));
    await page.waitForTimeout(400);
    await shoot(page, '16-power-path');
    await pickCheck(page, 'undergroundStrip1', 'undergroundCable');
    // 電桿 → 變電所 → 高壓鐵塔
    await pose(page, 'grid');
    await shoot(page, '16b-substation-grid');
    await pickCheck(page, 'substationHouse', 'substation');
    await pickCheck(page, 'hvTower0', 'powerLine');
    // 返回外觀：外殼回到實心、內部零件隱藏
    const back = await page.evaluate(() => {
      const lab = window.__lab;
      lab.store.set({ mode: 'exterior' });
      let internalShown = 0;
      lab.scene.traverse((o) => { if (o.userData.internal && o.visible) internalShown++; });
      return { shellView: lab.store.get().shellView, internalShown };
    });
    const backOk = back.shellView === 'solid' && back.internalShown === 0;
    report.push({ name: '返回外觀', ...back, ok: backOk });
    if (!backOk) failures.push(`返回外觀後狀態不正確：${JSON.stringify(back)}`);
    await rotorOcclusionCheck(page, '桌面', '16c-focus');
    // ---------- 點內部零件：自動拿掉外殼；關掉介紹卡恢復原狀 ----------
    {
      const st = () => page.evaluate(() => { const s = window.__lab.store.get(); return { mode: s.mode, shell: s.shellView, part: s.selectedPart }; });
      const closeCard = () => page.click('.info.open .btn.icon[aria-label="關閉"]');
      const pickFromList = async (id) => {
        await page.evaluate(() => window.__lab.store.set({ openPanel: 'parts' }));
        await page.click(`.partlist.open [data-part="${id}"]`);
        await page.waitForTimeout(300);
      };
      const cases = [];
      // 1. 外觀模式點齒輪箱 → 剖視、拿掉外殼；關掉 → 回到外觀、實心
      await page.evaluate(() => window.__lab.store.set({ mode: 'exterior', selectedPart: null, paused: true }));
      await pickFromList('generator');
      const a1 = await st();
      await page.waitForTimeout(1200);
      await shoot(page, '16b-peek-generator-no-shell');
      await closeCard();
      const a2 = await st();
      cases.push(['外觀→點發電機', a1.mode === 'cutaway' && a1.shell === 'hidden' && a2.mode === 'exterior' && a2.shell === 'solid', { a1, a2 }]);
      // 2. 剖視（透明）點槳距系統 → 拿掉；改點葉片 → 回到透明
      await page.evaluate(() => window.__lab.store.set({ mode: 'cutaway' }));
      await page.evaluate(() => window.__lab.store.set({ shellView: 'transparent' }));
      await pickFromList('pitchSystem');
      const b1 = await st();
      await pickFromList('blade');
      const b2 = await st();
      cases.push(['剖視透明→點槳距系統→改點葉片', b1.shell === 'hidden' && b2.shell === 'transparent' && b2.mode === 'cutaway' && b2.part === 'blade', { b1, b2 }]);
      // 3. 點了以後自己選「外殼透明」→ 關掉時尊重小朋友的選擇
      await pickFromList('gearbox');
      await page.click('.cutbar.open [data-cut="transparent"]');
      await closeCard();
      const c1 = await st();
      cases.push(['點齒輪箱後自己選外殼透明', c1.shell === 'transparent', { c1 }]);
      // 4. 發電實驗點發電機 → 拿掉；關掉 → 實心
      await page.evaluate(() => window.__lab.store.set({ mode: 'experiment', selectedPart: null }));
      await page.waitForTimeout(300);
      await page.evaluate(() => window.__lab.selectPart('generator'));
      const d1 = await st();
      await closeCard();
      const d2 = await st();
      cases.push(['發電實驗→點發電機', d1.shell === 'hidden' && d2.shell === 'solid' && d2.mode === 'experiment', { d1, d2 }]);
      // 5. 點了以後自己換模式 → 不再恢復
      await page.evaluate(() => window.__lab.store.set({ mode: 'exterior', selectedPart: null }));
      await pickFromList('brake');
      await page.click('.modes [data-mode="experiment"]');
      await page.waitForTimeout(300);
      const e1 = await st();
      cases.push(['點煞車後換到發電實驗', e1.mode === 'experiment' && e1.shell === 'solid' && e1.part === null, { e1 }]);
      for (const [name, ok, detail] of cases) {
        report.push({ name: `點內部零件自動拿掉外殼：${name}`, ...detail, ok });
        if (!ok) failures.push(`點內部零件自動拿掉外殼：${name} ${JSON.stringify(detail)}`);
      }
      await page.evaluate(() => window.__lab.store.set({ mode: 'exterior', selectedPart: null, openPanel: null }));
    }
    // ---------- 第三階段：機械拆解 ----------
    await explode(page);
    await shoot(page, '18-explode');
    await pickCheck(page, 'generatorStator', 'generator', [0, 0, -4.75]);
    await pickCheck(page, 'gearboxParallel', 'gearbox');
    await explode(page, { hidden: ['gearbox', 'mainShaft', 'mainBearing', 'yawSystem'] });
    await shoot(page, '19-gear-train-side');

    await pickCheck(page, 'stage1Driver', 'parallelGears', [-0.6, 0, 0]);
    await explode(page, { gears: true });
    await page.evaluate(() => window.__lab.selectPart('planetGear'));
    await page.waitForTimeout(1600);
    await shoot(page, '20-planetary-closeup');
    await pickCheck(page, 'planetMesh0', 'planetGear');
    await explode(page, { gears: true });
    await shoot(page, '20b-gear-view-front');
    await notesCheck(page, '桌面拆解：轉速比較、教學示意預設收起，點了才展開', '20c-explode-notes-open');
    await pickCheck(page, 'ringGearMesh', 'ringGear', [0.18, 1.0, 0.17]);
    await pickCheck(page, 'sunGearMesh', 'sunGear', [0, 0.21, 0.17]);
    await explode(page, { part: 'generator', solo: 'generator' });
    await shoot(page, '21-solo-generator');
    // 合起來：拆開的零件回到原位
    const closed = await page.evaluate(() => {
      const lab = window.__lab;
      lab.store.set({ exploded: false, hiddenParts: [], soloPart: null, selectedPart: null });
      lab.exploder.setInstant(0);
      lab.jumpView('explode');
      return lab.exploder.amount();
    });
    await page.waitForTimeout(400);
    await shoot(page, '22-explode-closed');
    report.push({ name: '合起來', amount: closed, ok: closed === 0 });

    // ---------- 第四階段：發電實驗 ----------
    const xpChecks = [];
    let now = await experiment(page, { wind: 8 });
    await turbineVisibleCheck(page, '桌面實驗：風機不被左側面板擋住');
    await insideButtonCheck(page, '桌面實驗：點「看機艙裡面」會飛到機艙', '24a-experiment-inside');
    await shoot(page, '24-experiment-8ms');
    xpChecks.push(['8 m/s 發電中', now.status === 'generating' && now.powerKW > 600 && now.powerKW < 1000, now]);
    now = await experiment(page, { wind: 15 });
    await shoot(page, '25-experiment-15ms-rated');
    xpChecks.push(['15 m/s 滿載並變槳', now.status === 'rated' && now.pitchDeg > 10, now]);
    now = await experiment(page, { wind: 27 });
    await shoot(page, '26-experiment-27ms-shutdown');
    xpChecks.push(['27 m/s 停機', now.status === 'shutdown' && now.powerKW === 0, now]);
    now = await experiment(page, { wind: 9, angle: 0, after: { patch: { windAngleDeg: 90 }, seconds: 6 } });
    await shoot(page, '27-experiment-yawing-east-wind');
    xpChecks.push(['改成東風：轉向中、功率下降', now.status === 'yawing' && Math.abs(now.yawErrorDeg) > 20, now]);
    now = await experiment(page, { wind: 18, pitchAuto: false, pitchDeg: 0 });
    await shoot(page, '28-experiment-manual-overspeed');
    xpChecks.push(['手動槳距 0、18 m/s：超速保護', now.status === 'overspeed', now]);
    now = await experiment(page, { wind: 10, shell: 'transparent', view: 'cutaway' });
    await shoot(page, '29-experiment-inside');
    await pickCheck(page, 'generatorStator', 'generator', [0, 0, -4.75]);
    now = await experiment(page, { wind: 10, view: 'grid' });
    await shoot(page, '30-experiment-power-to-grid');
    for (const [name, ok, st] of xpChecks) {
      report.push({ name: `模擬：${name}`, status: st.status, kW: Math.round(st.powerKW), pitch: Math.round(st.pitchDeg), rpm: Math.round(st.rotorRpm * 10) / 10, ok });
      if (!ok) failures.push(`模擬檢查失敗：${name} ${JSON.stringify(st)}`);
    }
    // 讀數面板有顯示數字
    const panelText = await page.evaluate(() => document.querySelector('.xp')?.innerText ?? '');
    const panelOk = /kW/.test(panelText) && /m\/s/.test(panelText);
    report.push({ name: '實驗面板顯示讀數', ok: panelOk });
    if (!panelOk) failures.push('實驗面板沒有顯示讀數');

    // 外觀模式下點機艙位置，應該點到機艙外殼而不是裡面的齒輪箱
    await pose(page, 'nacelle');
    await pickCheck(page, 'gearboxParallel', 'nacelle');

    // 點選測試
    await pose(page, 'side');
    await pickCheck(page, 'tower', 'tower', [0, 40, 0]);
    await pose(page, 'nacelle');
    await pickCheck(page, 'nacelleShell', 'nacelle');
    await pickCheck(page, 'rotor', 'hub', [0, 0, 1.5]);

    // 效能資訊（軟體渲染下的 fps 不代表實機，只記錄 draw calls）
    await page.evaluate(() => window.__lab.store.set({ paused: false, selectedPart: null }));
    await page.waitForTimeout(1500);
    report.push({ name: '渲染統計（桌面）', ...(await page.evaluate(() => window.__lab.stats())) });
    if (errors.length) failures.push(`桌面頁面錯誤：${errors.join(' | ')}`);
    await ctx.close();
  }
  // ---------- 第五階段：導覽、小任務、考考你、語音朗讀 ----------
  {
    // 模擬一個有台灣華語語音的裝置（無頭瀏覽器本身沒有語音）
    const fakeSpeech = () => {
      window.__spoken = [];
      class FakeUtterance { constructor(text) { this.text = text; } }
      window.SpeechSynthesisUtterance = FakeUtterance;
      Object.defineProperty(window, 'speechSynthesis', {
        value: {
          getVoices: () => [{ lang: 'en-US', name: 'Samantha' }, { lang: 'zh-TW', name: 'Mei-Jia' }],
          speak: (u) => window.__spoken.push({ text: u.text, lang: u.lang }),
          cancel: () => {},
          addEventListener: () => {},
        },
        configurable: true,
      });
    };
    const { ctx, page, errors } = await openPage({ width: 1280, height: 800 }, {}, { target: urlWithTour, init: fakeSpeech });
    await page.waitForTimeout(500);
    await shoot(page, '32-first-tour');
    const tourShown = await page.evaluate(() => window.__lab.store.get().tourStep === 0 && !document.querySelector('.tour').hidden);
    report.push({ name: '第一次進入顯示導覽', ok: tourShown });
    if (!tourShown) failures.push('第一次進入沒有顯示導覽');
    await page.click('.tour .speak');
    await page.click('.tour .btn.primary'); // 下一步
    await page.click('.tour .btn:not(.primary):not(.speak)'); // 跳過
    // 有中文語音：零件介紹卡的朗讀按鈕要出現，唸出來的文字用正確讀音
    await page.evaluate(() => { window.__lab.store.set({ paused: true }); window.__lab.selectPart('pitchSystem'); });
    await page.waitForTimeout(1200);
    const speakVisible = await page.evaluate(() => !document.querySelector('.info .speak').hidden);
    await page.click('.info .speak');
    const spoken = await page.evaluate(() => window.__spoken);
    const speakOk = speakVisible && spoken.length >= 2 && spoken.at(-1).text.includes('獎句') && !spoken.at(-1).text.includes('槳') && spoken.at(-1).lang === 'zh-TW';
    report.push({ name: '朗讀：zh-TW 語音、難詞讀音', spoken: spoken.map((x) => x.text.slice(0, 20)), ok: speakOk });
    if (!speakOk) failures.push(`朗讀檢查失敗：${JSON.stringify(spoken)}`);
    // 完成任務 → 提示；打開學習面板
    await page.evaluate(() => { window.__lab.selectPart('generator'); window.__lab.checkMissions(); });
    await page.waitForTimeout(400);
    await page.evaluate(() => window.__lab.store.set({ openPanel: 'learn' }));
    await page.waitForTimeout(300);
    await shoot(page, '33-missions-toast');
    const done = await page.evaluate(() => window.__lab.store.get().missionsDone);
    const missionOk = done.includes('find-generator') && done.includes('find-gearbox') === false;
    report.push({ name: '小任務自動完成', done, ok: missionOk });
    if (!missionOk) failures.push(`小任務檢查失敗：${JSON.stringify(done)}`);
    // 進度存在這台裝置：重新整理後仍在
    await page.reload();
    await page.waitForFunction(() => window.__lab?.ready === true);
    const kept = await page.evaluate(() => ({ done: window.__lab.store.get().missionsDone, tour: window.__lab.store.get().tourStep }));
    const keptOk = kept.done.includes('find-generator') && kept.tour === null;
    report.push({ name: '重新整理後保留進度、不再顯示導覽', ...kept, ok: keptOk });
    if (!keptOk) failures.push(`進度保存失敗：${JSON.stringify(kept)}`);
    // 考考你：選錯答案 → 顯示正確答案與說明
    await page.evaluate(() => window.__lab.store.set({ openPanel: null, quizIndex: 4, quizPicked: null, quizScore: 0 }));
    await page.waitForTimeout(200);
    const navBefore = await page.evaluate(() => [...document.querySelectorAll('.modal:not([hidden]) .learn-actions .btn')].filter((b) => b.offsetParent !== null).map((b) => b.textContent.trim()));
    await page.click('.q-options .btn.option >> nth=0');
    await page.waitForTimeout(300);
    const navAfter = await page.evaluate(() => [...document.querySelectorAll('.modal:not([hidden]) .learn-actions .btn')].filter((b) => b.offsetParent !== null).map((b) => b.textContent.trim()));
    const navOk = !navBefore.includes('下一題') && navBefore.includes('跳過') && navAfter.includes('下一題') && !navAfter.includes('跳過');
    report.push({ name: '考考你：答完才出現「下一題」', navBefore, navAfter, ok: navOk });
    if (!navOk) failures.push(`考考你按鈕：${JSON.stringify({ navBefore, navAfter })}`);
    await shoot(page, '34-quiz-feedback');
    const fb = await page.evaluate(() => document.querySelector('.q-feedback').innerText);
    const quizOk = /正確答案是「8 倍」/.test(fb);
    report.push({ name: '考考你：答錯時說明', ok: quizOk });
    if (!quizOk) failures.push(`考考你回饋不正確：${fb}`);
    if (errors.length) failures.push(`學習功能頁面錯誤：${errors.join(' | ')}`);
    await ctx.close();
  }
  // ---------- 沒有中文語音的裝置：朗讀按鈕要隱藏、不報錯 ----------
  {
    const { ctx, page, errors } = await openPage({ width: 1280, height: 800 });
    await page.evaluate(() => { window.__lab.store.set({ paused: true }); window.__lab.selectPart('tower'); });
    await page.waitForTimeout(500);
    const hidden = await page.evaluate(() => document.querySelector('.info .speak').hidden && [...document.querySelectorAll('.learn .speak')].every((b) => b.hidden));
    report.push({ name: '沒有中文語音時隱藏朗讀按鈕', ok: hidden });
    if (!hidden) failures.push('沒有中文語音時仍顯示朗讀按鈕');
    if (errors.length) failures.push(`無語音頁面錯誤：${errors.join(' | ')}`);
    await ctx.close();
  }
  // ---------- 手機寬度 390px ----------
  {
    const { ctx, page, errors } = await openPage({ width: 390, height: 844 }, { isMobile: true, hasTouch: true, deviceScaleFactor: 2 });
    await hintCheck(page, '手機');
    await pose(page, 'default');
    await shoot(page, '07-mobile-390');
    await rotorOcclusionCheck(page, '手機', '07b-mobile-390-focus');
    await pose(page, 'default', { part: 'blade' });
    await shoot(page, '08-mobile-390-select-blade');
    await page.evaluate(() => window.__lab.store.set({ selectedPart: null, openPanel: 'parts' }));
    await page.waitForTimeout(300);
    await shoot(page, '09-mobile-390-partlist');
    await cutaway(page, 'transparent');
    await shoot(page, '17-mobile-390-cutaway');
    await notesCheck(page, '手機剖視：教學示意預設收起，點了才展開');
    await explode(page, { gears: true, hidden: ['gearbox'] });
    await shoot(page, '23-mobile-390-explode-gears');
    await notesCheck(page, '手機拆解：轉速比較、教學示意預設收起，點了才展開', '23b-mobile-390-explode-notes-open');
    await page.evaluate(() => window.__lab.store.set({ mode: 'exterior', openPanel: 'learn' }));
    await page.waitForTimeout(300);
    await shoot(page, '35-mobile-390-learn');
    await page.evaluate(() => window.__lab.store.set({ openPanel: null, quizIndex: 0, quizPicked: 1 }));
    await page.waitForTimeout(300);
    await shoot(page, '36-mobile-390-quiz');
    await page.evaluate(() => window.__lab.store.set({ quizIndex: null, quizPicked: null }));
    await experiment(page, { wind: 12 });
    await turbineVisibleCheck(page, '手機實驗（展開）：風機在面板上方');
    await shoot(page, '31-mobile-390-experiment');
    await page.evaluate(() => window.__lab.store.set({ xpFolded: true }));
    await turbineVisibleCheck(page, '手機實驗（收起）：風機在面板上方');
    await shoot(page, '31b-mobile-390-experiment-folded');
    await page.evaluate(() => window.__lab.store.set({ xpFolded: false }));
    await insideButtonCheck(page, '手機實驗：點「看機艙裡面」會飛到機艙', '31c-mobile-390-experiment-inside');
    const smallXp = await page.evaluate(() => [...document.querySelectorAll('#ui button')]
      .filter((b) => b.offsetParent !== null)
      .map((b) => ({ t: b.textContent.trim(), w: b.getBoundingClientRect().width, h: b.getBoundingClientRect().height }))
      .filter((r) => r.w < 44 || r.h < 44));
    report.push({ name: '手機實驗模式觸控目標 < 44px', count: smallXp.length, items: smallXp, ok: smallXp.length === 0 });
    if (smallXp.length) failures.push(`手機實驗模式有過小的按鈕：${JSON.stringify(smallXp)}`);
    const overflowXp = await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth);
    if (overflowXp) failures.push('手機實驗模式出現水平捲動');
    // 觸控目標大小檢查
    const small = await page.evaluate(() => [...document.querySelectorAll('#ui button')]
      .filter((b) => b.offsetParent !== null)
      .map((b) => ({ t: b.textContent.trim(), w: b.getBoundingClientRect().width, h: b.getBoundingClientRect().height }))
      .filter((r) => r.w < 44 || r.h < 44));
    report.push({ name: '手機觸控目標 < 44px 的按鈕', count: small.length, items: small, ok: small.length === 0 });
    if (small.length) failures.push(`手機有過小的按鈕：${JSON.stringify(small)}`);
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth);
    if (overflow) failures.push('手機畫面出現水平捲動');
    report.push({ name: '渲染統計（手機）', ...(await page.evaluate(() => window.__lab.stats())) });
    if (errors.length) failures.push(`手機頁面錯誤：${errors.join(' | ')}`);
    await ctx.close();
  }
  // ---------- 自動導覽：字幕＋語音、按鈕啟動／停止 ----------
  for (const device of ['desktop', 'mobile']) {
    const mobile = device === 'mobile';
    // 假的台灣華語語音：window.__speechMs 毫秒後回報「唸完」（Infinity = 一直唸，讓截圖時畫面不換段）
    const fakeSpeech = () => {
      window.__spoken = [];
      window.__speechMs = Infinity;
      class FakeUtterance { constructor(text) { this.text = text; } }
      window.SpeechSynthesisUtterance = FakeUtterance;
      Object.defineProperty(window, 'speechSynthesis', {
        value: {
          getVoices: () => [{ lang: 'zh-TW', name: 'Mei-Jia' }],
          speak: (u) => {
            window.__spoken.push({ text: u.text, lang: u.lang });
            if (u.onend && Number.isFinite(window.__speechMs)) setTimeout(() => u.onend(), window.__speechMs);
          },
          cancel: () => {},
          addEventListener: () => {},
        },
        configurable: true,
      });
    };
    const { ctx, page, errors } = mobile
      ? await openPage({ width: 390, height: 844 }, { isMobile: true, hasTouch: true, deviceScaleFactor: 2 }, { init: fakeSpeech })
      : await openPage({ width: 1280, height: 800 }, {}, { init: fakeSpeech });
    const tag = mobile ? '手機' : '桌面';
    const fail = (msg) => failures.push(`${tag}導覽：${msg}`);
    // 1. 按標題旁的按鈕開始
    await page.click('.guide-start');
    await page.waitForTimeout(400);
    const started = await page.evaluate(() => ({
      step: window.__lab.store.get().guideStep,
      card: getComputedStyle(document.querySelector('.guide')).display !== 'none',
      btn: document.querySelector('.guide-start').textContent.trim(),
      xpHidden: getComputedStyle(document.querySelector('.xp')).display === 'none',
      spoken: window.__spoken.map((x) => x.text),
    }));
    const startOk = started.step === 0 && started.card && started.btn === '停止導覽' && started.xpHidden && started.spoken.length > 0 && started.spoken[0].includes('風力發電機');
    report.push({ name: `${tag}導覽：按鈕開始、字幕出現、語音分句唸`, ...started, spoken: started.spoken.slice(0, 3), ok: startOk });
    if (!startOk) fail(`開始失敗 ${JSON.stringify(started)}`);
    // 2. 每一段：畫面焦點不被字幕卡或標題列擋住
    const scenes = await page.evaluate(() => window.__lab.guide.script.map((g) => ({ title: g.title, camera: g.camera, part: g.part ?? null, mode: g.setup.mode })));
    const shots = { 0: 'start', 2: 'blade', 6: 'gears', 7: 'generator', 10: 'transformer', 11: 'grid', 12: 'calm', 13: 'strong', 14: 'storm' };
    for (let i = 0; i < scenes.length; i++) {
      const sc = scenes[i];
      await page.evaluate((i) => window.__lab.guide.start(i), i);
      await page.waitForTimeout(2200);
      const r = await page.evaluate(({ camera, part }) => {
        const lab = window.__lab;
        const id = part ?? (camera === 'gears' ? 'sunGear' : 'hub');
        const p = lab.partScreen(id);
        // 點得到 = 沒有被別的東西（例如葉片）擋住。電纜在塔架裡面，從外面本來就點不到；
        // 三片葉片的包圍盒中心是葉片之間的空隙，也不適用（看截圖確認）
        let picked = ['powerCable', 'blade'].includes(id) || camera === 'preset:grid' ? id : lab.pickAt(p.x, p.y);
        if (camera === 'blade') { // 靠近看葉片：畫面的視覺中心（避開標題列、小圖與字幕卡）要點得到葉片
          const sh = lab.viewShift();
          const c = { x: innerWidth / 2 + sh.cx, y: innerHeight / 2 + sh.cy };
          picked = lab.pickAt(c.x, c.y);
          Object.assign(p, c, { front: true });
        }
        const card = document.querySelector('.guide').getBoundingClientRect();
        const head = document.querySelector('#ui .top').getBoundingClientRect();
        const s = lab.store.get();
        return { id, p, picked, cardTop: card.top, headBottom: head.bottom, w: innerWidth, step: s.guideStep, mode: s.mode, shell: s.shellView, cardScroll: document.querySelector('.guide').scrollHeight > document.querySelector('.guide').clientHeight + 1 };
      }, sc);
      // 送電路線的視角是看整條線路，風機本身可以在畫面邊緣；跟著電走的鏡頭一路移動，另外檢查（2c）
      const needFocus = sc.camera !== 'preset:grid' && sc.camera !== 'cable';
      const visible = r.p.front && r.p.x > 0 && r.p.x < r.w && r.p.y > r.headBottom && r.p.y < r.cardTop;
      const ok = r.step === i && r.mode === sc.mode && (!needFocus || (visible && (!sc.part || r.picked === r.id))) && (sc.mode !== 'explode' || r.shell === 'hidden') && !r.cardScroll;
      report.push({ name: `${tag}導覽 ${i + 1}「${sc.title}」：焦點在字幕卡上方`, focus: r.id, picked: r.picked, x: Math.round(r.p.x), y: Math.round(r.p.y), cardTop: Math.round(r.cardTop), shell: r.shell, ok });
      if (!ok) fail(`第 ${i + 1} 段「${sc.title}」${JSON.stringify(r)}`);
      if (shots[i]) await shoot(page, `${mobile ? '41' : '40'}-guide-${device}-${String(i + 1).padStart(2, '0')}-${shots[i]}`);
    }
    // 2b. 靠近看葉片：葉輪停住、小圖出現，小圖不擋字幕卡
    {
      await page.evaluate(() => window.__lab.guide.start(2));
      await page.waitForTimeout(800);
      const r = await page.evaluate(() => {
        const f = document.querySelector('.guide-figure').getBoundingClientRect();
        const c = document.querySelector('.guide').getBoundingClientRect();
        const h = document.querySelector('#ui .top').getBoundingClientRect();
        return { open: f.height > 0, paused: window.__lab.store.get().paused, figBottom: f.bottom, figTop: f.top, cardTop: c.top, headBottom: h.bottom, svg: !!document.querySelector('.guide-figure svg path.af-blade') };
      });
      const ok = r.open && r.paused && r.svg && r.figBottom < r.cardTop && r.figTop >= r.headBottom - 1;
      report.push({ name: `${tag}導覽：葉片切面小圖`, ...r, ok });
      if (!ok) fail(`葉片切面小圖 ${JSON.stringify(r)}`);
    }
    // 2c. 跟著電走：塔架變透明，鏡頭一路往下，最後看得到變壓器（不被塔架擋住）
    {
      const idx = scenes.findIndex((g) => g.camera === 'cable');
      await page.evaluate((i) => window.__lab.guide.start(i), idx);
      const probe = () => page.evaluate(() => {
        const lab = window.__lab;
        const cam = lab.scene.userData.camera;
        const p = lab.partScreen('transformer');
        let towerOpacity = 1;
        lab.scene.traverse((o) => { if (o.isMesh && o.userData.partId === 'tower') towerOpacity = Math.min(towerOpacity, o.material.opacity); });
        return { y: Math.round(cam.position.y), picked: lab.pickAt(p.x, p.y), towerOpacity };
      });
      await page.waitForTimeout(3500);
      const mid = await probe();
      await page.waitForTimeout(8500);
      const end = await probe();
      await shoot(page, `${mobile ? '41' : '40'}-guide-${device}-10-cable-end`);
      await page.evaluate((i) => window.__lab.guide.start(i), idx + 1);
      await page.waitForTimeout(300);
      const after = await probe();
      const ok = mid.towerOpacity < 1 && mid.y > end.y && end.y < 20 && end.picked === 'transformer' && after.towerOpacity === 1;
      report.push({ name: `${tag}導覽：跟著電走到變壓器`, mid, end, afterTowerOpacity: after.towerOpacity, ok });
      if (!ok) fail(`跟著電走 ${JSON.stringify({ mid, end, after })}`);
    }
    // 2d. 風小、風大：長條與發電機轉速看得出差別
    {
      const calm = scenes.findIndex((g) => g.title === '風太小');
      const read = () => page.evaluate(() => ({
        meter: getComputedStyle(document.querySelector('.guide-meter')).display !== 'none',
        power: document.querySelector('.meter-row.power b').textContent,
        hs: window.__lab.animator.highSpeedRps(),
        kw: window.__lab.sim.get().powerKW,
      }));
      await page.evaluate((i) => window.__lab.guide.start(i), calm);
      await page.waitForTimeout(800);
      const a = await read();
      await page.evaluate((i) => window.__lab.guide.start(i), calm + 1);
      await page.waitForTimeout(800);
      const b = await read();
      const ok = a.meter && b.meter && a.power === '沒有發電' && a.kw <= 0.5 && b.kw > 1950 && b.hs > a.hs * 2;
      report.push({ name: `${tag}導覽：風小、風大的差別`, calm: a, strong: b, ok });
      if (!ok) fail(`風小風大 ${JSON.stringify({ a, b })}`);
    }
    // 3. 字幕卡的按鈕：暫停、下一段、上一段
    await page.evaluate(() => window.__lab.guide.start(3));
    await page.click('.guide-pause');
    const paused = await page.evaluate(() => window.__lab.store.get().guidePaused);
    await page.click('.guide-pause');
    await page.click('.guide-next');
    const afterNext = await page.evaluate(() => window.__lab.store.get().guideStep);
    await page.click('.guide-prev');
    const afterPrev = await page.evaluate(() => window.__lab.store.get().guideStep);
    const ctlOk = paused === true && afterNext === 4 && afterPrev === 3;
    report.push({ name: `${tag}導覽：暫停、下一段、上一段按鈕`, paused, afterNext, afterPrev, ok: ctlOk });
    if (!ctlOk) fail(`控制按鈕 ${JSON.stringify({ paused, afterNext, afterPrev })}`);
    // 4. 語音唸完會自動換下一段
    await page.evaluate(() => { window.__speechMs = 200; window.__lab.guide.start(4); });
    const minSec = await page.evaluate(() => window.__lab.guide.script[4].minSec);
    await page.waitForTimeout(minSec * 1000 + 2500);
    const auto = await page.evaluate(() => window.__lab.store.get().guideStep);
    report.push({ name: `${tag}導覽：語音唸完自動換段`, auto, ok: auto === 5 });
    if (auto !== 5) fail(`沒有自動換段（停在 ${auto}）`);
    await page.evaluate(() => { window.__speechMs = Infinity; });
    // 5. 觸控目標、水平捲動
    const small = await page.evaluate(() => [...document.querySelectorAll('.guide button, .guide-start')]
      .filter((b) => b.offsetParent !== null)
      .map((b) => ({ t: b.textContent.trim(), w: b.getBoundingClientRect().width, h: b.getBoundingClientRect().height }))
      .filter((r) => r.w < 44 || r.h < 44));
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth);
    report.push({ name: `${tag}導覽：觸控目標 ≥ 44px、沒有水平捲動`, small, overflow, ok: !small.length && !overflow });
    if (small.length || overflow) fail(`按鈕過小或水平捲動 ${JSON.stringify({ small, overflow })}`);
    // 6. 拖曳畫面就停止；再用按鈕開始、停止
    const box = await page.evaluate(() => { const r = document.querySelector('#ui .top').getBoundingClientRect(); return { x: innerWidth / 2, y: r.bottom + 40 }; });
    if (mobile) await page.touchscreen.tap(box.x, box.y); else await page.mouse.click(box.x, box.y);
    const afterTouch = await page.evaluate(() => window.__lab.store.get().guideStep);
    await page.click('.guide-start');
    const restarted = await page.evaluate(() => window.__lab.store.get().guideStep);
    await page.click('.guide-start');
    const stopped = await page.evaluate(() => ({ step: window.__lab.store.get().guideStep, btn: document.querySelector('.guide-start').textContent.trim(), card: getComputedStyle(document.querySelector('.guide')).display }));
    const stopOk = afterTouch === null && restarted === 0 && stopped.step === null && stopped.btn === '自動導覽' && stopped.card === 'none';
    report.push({ name: `${tag}導覽：點畫面停止；按鈕可再開始、停止`, afterTouch, restarted, stopped, ok: stopOk });
    if (!stopOk) fail(`停止 ${JSON.stringify({ afterTouch, restarted, stopped })}`);
    if (errors.length) fail(`頁面錯誤：${errors.join(' | ')}`);
    await ctx.close();
  }
} finally {
  await browser.close();
  await new Promise((r) => server.httpServer.close(r));
}

writeFileSync(resolve(OUT, 'report.json'), JSON.stringify(report, null, 2));
for (const r of report) console.log(r.ok === false ? '✗' : '✓', JSON.stringify(r));
if (failures.length) {
  console.error('\n截圖檢查失敗：\n- ' + failures.join('\n- '));
  process.exit(1);
}
console.log(`\n截圖檢查通過，共 ${report.length} 項，存放於 screenshots/`);
