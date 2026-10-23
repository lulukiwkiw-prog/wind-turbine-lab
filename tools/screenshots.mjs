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
const url = 'http://localhost:4173/wind-turbine-lab/';

const browser = await chromium.launch({
  executablePath,
  args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--enable-webgl'],
});

const failures = [];
const report = [];

async function openPage(viewport, opts = {}) {
  const ctx = await browser.newContext({ viewport, deviceScaleFactor: 1, ...opts });
  const page = await ctx.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(String(e)));
  page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
  await page.goto(url);
  await page.waitForFunction(() => window.__lab?.ready === true, null, { timeout: 30000 });
  return { ctx, page, errors };
}

/** 讓畫面停在固定狀態：暫停動畫、固定葉輪角度、跳到視角，並等幾幀 */
async function pose(page, view, { part = null, rotor = 20 } = {}) {
  await page.evaluate(({ view, part, rotor }) => {
    const lab = window.__lab;
    lab.store.set({ mode: 'exterior', paused: true, selectedPart: null, partListOpen: false });
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
    lab.store.set({ mode: 'exterior', selectedPart: null, partListOpen: false, paused: true });
    lab.setRotorAngleDeg(20);
    lab.store.set({ mode: 'cutaway' });
    lab.store.set({ shellView });
    lab.jumpView('cutaway');
    if (part) lab.selectPart(part);
  }, { shellView, part });
  await page.waitForTimeout(part ? 1600 : 500);
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
  // ---------- 手機寬度 390px ----------
  {
    const { ctx, page, errors } = await openPage({ width: 390, height: 844 }, { isMobile: true, hasTouch: true, deviceScaleFactor: 2 });
    await pose(page, 'default');
    await shoot(page, '07-mobile-390');
    await pose(page, 'default', { part: 'blade' });
    await shoot(page, '08-mobile-390-select-blade');
    await page.evaluate(() => window.__lab.store.set({ selectedPart: null, partListOpen: true }));
    await page.waitForTimeout(300);
    await shoot(page, '09-mobile-390-partlist');
    await cutaway(page, 'transparent');
    await shoot(page, '17-mobile-390-cutaway');
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
