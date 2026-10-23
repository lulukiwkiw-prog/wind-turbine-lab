// 由 turbineSpec.js 產生 docs/ 的結構示意圖、機艙剖面圖與連接關係圖
// 用法：npm run docs（npm run check 也會執行，確保圖與規格同步）
import { writeFileSync, mkdirSync } from 'node:fs';
import {
  DIM, DRIVETRAIN, PALETTE, HIERARCHY, PARTS, CONNECTIONS, SIM, GEARBOX_CONFIGS, ACTIVE_GEARBOX,
  rotorCenterLocal, hubHeight, highSpeedShaftOffset, gearboxRatio, stageRatio, centerDistance,
} from '../src/spec/turbineSpec.js';
import { PARTS_TEXT } from '../src/learning/partsData.js';

mkdirSync('docs', { recursive: true });
const DEG = Math.PI / 180;
const f1 = (v) => (Math.round(v * 10) / 10).toString();
const name = (id) => PARTS_TEXT.elementary[id]?.name ?? id;
const FONT = 'font-family="Noto Sans TC, PingFang TC, Microsoft JhengHei, sans-serif"';
const tilt = DIM.drivetrain.tiltDeg * DEG;

// ---------------------------------------------------------------------
// 1. 結構示意圖（側視：水平 = 世界 Z，往右為上風；垂直 = Y）
// ---------------------------------------------------------------------
{
  const S = 4.4; // px / m
  const W = 900, H = 720;
  const ox = 430, oy = 650; // 世界原點在畫面上的位置
  const P = (z, y) => `${f1(ox + z * S)},${f1(oy - y * S)}`;
  const t = DIM.tower;
  const c = rotorCenterLocal();
  const hub = [c[2], c[1] + t.topY];
  const R = DIM.rotor.radius, cone = DIM.rotor.coneDeg * DEG;
  // 葉片在側視圖中：朝上與朝下兩片（含傾角與錐角）
  const bladeTip = (up) => {
    const ly = (up ? 1 : -1) * R * Math.cos(cone), lz = R * Math.sin(cone);
    return [hub[0] - ly * Math.sin(tilt) + lz * Math.cos(tilt), hub[1] + ly * Math.cos(tilt) + lz * Math.sin(tilt)];
  };
  const top = bladeTip(true), bot = bladeTip(false);
  const n = DIM.nacelle;
  const towerR = (y) => t.topRadius + (t.baseRadius - t.topRadius) * ((t.topY - y) / (t.topY - t.baseY));
  const clearance = bot[0] - towerR(bot[1]);

  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}" ${FONT} font-size="14">
<title>風力發電機結構示意圖（側視）</title>
<rect width="${W}" height="${H}" fill="#f7fbff"/>
<text x="20" y="32" font-size="22" font-weight="700" fill="#17324d">結構示意圖（側視，示意比例 1 單位 = 1 m）</text>
<text x="20" y="54" fill="#46607a">由 src/spec/turbineSpec.js 自動產生 · 非特定廠牌、不具工程精度</text>
<line x1="20" y1="${oy}" x2="${W - 20}" y2="${oy}" stroke="#7fb05c" stroke-width="3"/>
<rect x="${ox - DIM.foundation.radius * S}" y="${oy - DIM.foundation.height * S}" width="${DIM.foundation.radius * 2 * S}" height="${DIM.foundation.height * S}" fill="${PALETTE.foundation}"/>
<rect x="${ox - DIM.foundation.buriedRadius * S}" y="${oy}" width="${DIM.foundation.buriedRadius * 2 * S}" height="${2.5 * S}" fill="${PALETTE.foundation}" opacity="0.45"/>
<polygon points="${P(-t.baseRadius, t.baseY)} ${P(-t.topRadius, t.topY)} ${P(t.topRadius, t.topY)} ${P(t.baseRadius, t.baseY)}" fill="${PALETTE.tower}" stroke="#9aa5b1"/>
<rect x="${ox + n.min[2] * S}" y="${oy - (t.topY + n.max[1]) * S}" width="${(n.max[2] - n.min[2]) * S}" height="${(n.max[1] - n.min[1]) * S}" rx="3" fill="${PALETTE.nacelle}" stroke="#9aa5b1"/>
<line x1="${P(hub[0], hub[1]).split(',')[0]}" y1="${P(hub[0], hub[1]).split(',')[1]}" x2="${ox + (hub[0] - 14 * Math.cos(tilt)) * S}" y2="${oy - (hub[1] - 14 * Math.sin(tilt)) * S}" stroke="${PALETTE.mainShaft}" stroke-width="2" stroke-dasharray="6 4"/>
<line x1="${P(...top).split(',')[0]}" y1="${P(...top).split(',')[1]}" x2="${P(...bot).split(',')[0]}" y2="${P(...bot).split(',')[1]}" stroke="#b9c3cc" stroke-width="5" stroke-linecap="round"/>
<circle cx="${ox + hub[0] * S}" cy="${oy - hub[1] * S}" r="${DIM.spinner.radius * S}" fill="${PALETTE.spinner}" stroke="#9aa5b1"/>
<!-- 尺寸標註 -->
<g stroke="#17324d" fill="#17324d">
  <line x1="${ox - 160}" y1="${oy}" x2="${ox - 160}" y2="${oy - hub[1] * S}" marker-start="url(#a)" marker-end="url(#a)"/>
  <text x="${ox - 300}" y="${oy - hub[1] * S / 2}" stroke="none">輪轂高度 ≈ ${f1(hubHeight())} m</text>
  <line x1="${ox + 150}" y1="${oy - top[1] * S}" x2="${ox + 150}" y2="${oy - bot[1] * S}" marker-start="url(#a)" marker-end="url(#a)"/>
  <text x="${ox + 160}" y="${oy - hub[1] * S + 40}" stroke="none">葉輪直徑 ${2 * R} m</text>
  <line x1="${ox - 60}" y1="${oy - t.baseY * S}" x2="${ox - 60}" y2="${oy - t.topY * S}" stroke-dasharray="3 3"/>
  <text x="${ox - 150}" y="${oy - t.topY * S * 0.55}" stroke="none">塔架 ${f1(t.topY - t.baseY)} m</text>
</g>
<defs><marker id="a" viewBox="0 0 10 10" refX="5" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse"><path d="M0,0 L10,5 L0,10 z"/></marker></defs>
<!-- 說明 -->
<g fill="#17324d">
  <text x="${ox - 230}" y="${oy - (t.topY + 3) * S}">機艙（長 ${f1(n.max[2] - n.min[2])} m）</text>
  <text x="${ox + hub[0] * S + 14}" y="${oy - hub[1] * S - 14}">輪轂中心：機艙前方 ${f1(c[2])} m</text>
  <text x="${ox + 160}" y="${oy - bot[1] * S + 4}">葉尖離地 ≈ ${f1(bot[1])} m，離塔架 ≈ ${f1(clearance)} m</text>
  <text x="${ox + 160}" y="${oy - hub[1] * S + 62}">傾角 ${DIM.drivetrain.tiltDeg}°、錐角 ${DIM.rotor.coneDeg}°</text>
</g>
<!-- 座標軸與風 -->
<g transform="translate(70 ${oy - 40})" stroke-width="2.5">
  <line x1="0" y1="0" x2="0" y2="-60" stroke="#2e9d4f" marker-end="url(#a)"/><text x="6" y="-62" fill="#2e9d4f">+Y 上</text>
  <line x1="0" y1="0" x2="60" y2="0" stroke="#1e7fd6" marker-end="url(#a)"/><text x="42" y="18" fill="#1e7fd6">+Z</text>
  <circle r="6" fill="none" stroke="#d24f9b"/><circle r="1.6" fill="#d24f9b"/><text x="-60" y="22" fill="#d24f9b">+X 朝向讀者</text>
</g>
<g transform="translate(${W - 210} 120)">
  <text x="0" y="0" fill="#17324d" font-weight="700">北風（0°）：從 +Z（北）吹來</text>
  <line x1="170" y1="24" x2="40" y2="24" stroke="#5aa0d6" stroke-width="4" marker-end="url(#a)"/>
  <text x="0" y="56" fill="#46607a">葉輪在塔架上風側（上風式）</text>
  <text x="0" y="76" fill="#46607a">從上風看：葉輪順時針轉</text>
</g>
</svg>`;
  writeFileSync('docs/structure.svg', svg);
}

// ---------------------------------------------------------------------
// 2. 機艙剖面圖（機艙局部座標側視；第二階段依此建模）
// ---------------------------------------------------------------------
{
  const S = 58;
  const W = 1100, H = 620;
  const ox = 560, oy = 440;
  const n = DIM.nacelle;
  const [hx, hy] = highSpeedShaftOffset();
  const dt = DIM.drivetrain.origin;
  // 傳動框架 (y, z) → 機艙局部 (z, y) → 畫面
  const D = (y, z) => [ox + (dt[2] - y * Math.sin(tilt) + z * Math.cos(tilt)) * S, oy - (dt[1] + y * Math.cos(tilt) + z * Math.sin(tilt)) * S];
  const rectAlong = (z0, z1, r, yOff, fill) => {
    const pts = [D(yOff - r, z0), D(yOff + r, z0), D(yOff + r, z1), D(yOff - r, z1)].map((p) => p.map(f1).join(',')).join(' ');
    return `<polygon points="${pts}" fill="${fill}" stroke="#17324d" stroke-opacity="0.35"/>`;
  };
  const d = DRIVETRAIN;
  const gb = GEARBOX_CONFIGS[ACTIVE_GEARBOX];
  const ring = gb.stages[0];
  const ringR = (ring.module * ring.ringTeeth) / 2;
  const c = rotorCenterLocal();
  const labels = [];
  const lab = (p, text, color, dx, dy) => {
    labels.push(`<line x1="${f1(p[0])}" y1="${f1(p[1])}" x2="${f1(p[0] + dx)}" y2="${f1(p[1] + dy)}" stroke="#46607a"/>`
      + `<circle cx="${f1(p[0] + dx)}" cy="${f1(p[1] + dy)}" r="6" fill="${color}" stroke="#17324d"/>`
      + `<text x="${f1(p[0] + dx + 10)}" y="${f1(p[1] + dy + 5)}" fill="#17324d">${text}</text>`);
  };
  const body = [];
  body.push(`<rect x="${ox + n.min[2] * S}" y="${oy - n.max[1] * S}" width="${(n.max[2] - n.min[2]) * S}" height="${(n.max[1] - n.min[1]) * S}" rx="${n.cornerRadius * S}" fill="${PALETTE.nacelle}" fill-opacity="0.35" stroke="#9aa5b1" stroke-width="2" stroke-dasharray="8 5"/>`);
  // 塔頂與偏航
  body.push(`<rect x="${ox - DIM.tower.topRadius * S}" y="${oy}" width="${DIM.tower.topRadius * 2 * S}" height="60" fill="${PALETTE.tower}" stroke="#9aa5b1"/>`);
  body.push(`<rect x="${ox - (DIM.tower.topRadius + 0.12) * S}" y="${oy - 0.3 * S}" width="${(DIM.tower.topRadius + 0.12) * 2 * S}" height="${0.3 * S}" fill="${PALETTE.yaw}"/>`);
  // 主軸、軸承、齒輪箱、高速軸、煞車、發電機
  body.push(rectAlong(d.mainShaft.z0, DIM.rotor.centerOnAxis + DIM.hub.flangeZ, d.mainShaft.radius, 0, PALETTE.mainShaft));
  for (const b of d.mainBearings) body.push(rectAlong(b.z - 0.25, b.z + 0.25, b.outerRadius, 0, PALETTE.bearing));
  body.push(rectAlong(d.gearbox.z0, d.gearbox.z1, ringR + 0.12, 0, PALETTE.gearbox));
  body.push(rectAlong(d.gearbox.z0, d.gearbox.z1 - 0.9, hy + 0.35, hy / 2, PALETTE.gearbox));
  body.push(rectAlong(d.highSpeedShaft.z0, d.highSpeedShaft.z1, d.highSpeedShaft.radius, hy, PALETTE.highSpeedShaft));
  body.push(rectAlong(d.brake.z - 0.05, d.brake.z + 0.05, d.brake.discRadius, hy, PALETTE.brake));
  body.push(rectAlong(d.generator.z0, d.generator.z1, d.generator.radius, hy, PALETTE.generatorStator));
  body.push(rectAlong(d.generator.z0 + 0.2, d.generator.z1 - 0.2, d.generator.radius * 0.6, hy, PALETTE.generatorRotor));
  // 控制器
  const ct = d.controller;
  body.push(`<rect x="${ox + (ct.at[2] - ct.size[2] / 2) * S}" y="${oy - (ct.at[1] + ct.size[1] / 2) * S}" width="${ct.size[2] * S}" height="${ct.size[1] * S}" fill="${PALETTE.controller}"/>`);
  // 輪轂、導流罩、葉根
  {
    const sc = D(0, DIM.rotor.centerOnAxis + (DIM.spinner.noseZ + DIM.spinner.rearZ) / 2);
    body.push(`<ellipse cx="${f1(sc[0])}" cy="${f1(sc[1])}" rx="${f1((DIM.spinner.noseZ - DIM.spinner.rearZ) / 2 * S)}" ry="${f1(DIM.spinner.radius * S)}" transform="rotate(${-DIM.drivetrain.tiltDeg} ${f1(sc[0])} ${f1(sc[1])})" fill="${PALETTE.spinner}" fill-opacity="0.5" stroke="#9aa5b1" stroke-dasharray="6 4"/>`);
  }
  body.push(`<circle cx="${ox + c[2] * S}" cy="${oy - c[1] * S}" r="${DIM.hub.radius * S}" fill="${PALETTE.hub}" fill-opacity="0.8" stroke="#7b8794"/>`);
  body.push(`<rect x="${ox + c[2] * S - 0.9 * S}" y="${oy - (c[1] + DIM.blade.rootR + 0.3) * S}" width="${1.8 * S}" height="${0.3 * S}" fill="${PALETTE.pitch}"/>`);
  body.push(`<rect x="${ox + c[2] * S - 0.9 * S}" y="${oy - (c[1] + DIM.blade.rootR + 2.2) * S}" width="${1.8 * S}" height="${1.9 * S}" fill="${PALETTE.blade}" stroke="#9aa5b1"/>`);
  // 感測器
  for (const [k, color] of [['anemometer', PALETTE.sensor], ['windVane', PALETTE.sensor]]) {
    const a = DIM.sensors[k].at;
    body.push(`<line x1="${ox + a[2] * S + (k === 'windVane' ? 12 : -12)}" y1="${oy - a[1] * S}" x2="${ox + a[2] * S + (k === 'windVane' ? 12 : -12)}" y2="${oy - (a[1] + DIM.sensors.mastHeight) * S}" stroke="${color}" stroke-width="4"/>`);
  }
  // 中心線
  const a0 = D(0, -6.5), a1 = D(0, DIM.rotor.centerOnAxis + 3.5);
  body.push(`<line x1="${f1(a0[0])}" y1="${f1(a0[1])}" x2="${f1(a1[0])}" y2="${f1(a1[1])}" stroke="#17324d" stroke-dasharray="10 4 2 4"/>`);

  lab(D(0, (d.mainShaft.z0 + d.mainShaft.z1) / 2 + 0.5), `${name('mainShaft')}（藍）`, PALETTE.mainShaft, 40, 120);
  lab(D(0, d.mainBearings[0].z), name('mainBearing'), PALETTE.bearing, 30, -150);
  lab(D(0, ring.z), `${name('gearbox')}（綠）總速比 1:${gearboxRatio()}`, PALETTE.gearbox, 90, 150);
  lab(D(hy, -2.6), name('highSpeedShaft'), PALETTE.highSpeedShaft, 10, -160);
  lab(D(hy, d.brake.z), name('brake'), PALETTE.brake, 60, -110);
  lab(D(hy, (d.generator.z0 + d.generator.z1) / 2), `${name('generator')}（定子黃／轉子橘）`, PALETTE.generatorStator, -120, -135);
  lab([ox + ct.at[2] * S, oy - ct.at[1] * S], name('controller'), PALETTE.controller, -60, 80);
  lab([ox, oy - 0.15 * S], name('yawSystem'), PALETTE.yaw, -170, 50);
  lab([ox + c[2] * S, oy - (c[1] + DIM.blade.rootR + 0.15) * S], `${name('pitchSystem')}（變槳軸承）`, PALETTE.pitch, -60, -80);
  lab([ox + c[2] * S, oy - c[1] * S], name('hub'), PALETTE.hub, 60, 120);
  lab([ox + DIM.sensors.anemometer.at[2] * S - 12, oy - (DIM.sensors.anemometer.at[1] + 1) * S], `${name('anemometer')}／${name('windVane')}`, PALETTE.sensor, 40, -40);

  const stages = gb.stages.map((s) => `${s.id}：${s.type === 'planetary' ? `太陽 ${s.sunTeeth}／行星 ${s.planetTeeth}×${s.planetCount}／環 ${s.ringTeeth}` : `${s.driverTeeth}→${s.drivenTeeth}`}，速比 ${f1(stageRatio(s))}，中心距 ${centerDistance(s).toFixed(3)} m`);
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}" ${FONT} font-size="14">
<title>機艙剖面示意圖</title>
<rect width="${W}" height="${H}" fill="#f7fbff"/>
<text x="20" y="30" font-size="22" font-weight="700" fill="#17324d">機艙剖面示意圖（從 +X 側看，往右為上風）</text>
<text x="20" y="52" fill="#46607a">由 turbineSpec.js 自動產生；齒輪箱為教學簡化，齒數與模數是示意值。高速軸另往 +X 偏移 ${f1(hx)} m（此視角看不到）。</text>
${body.join('\n')}
${labels.join('\n')}
<g fill="#46607a" font-size="12">${stages.map((s, i) => `<text x="20" y="${H - 56 + i * 16}">${s}</text>`).join('')}</g>
<text x="${W - 330}" y="${H - 18}" fill="#46607a" font-size="12">傳動軸傾角 ${DIM.drivetrain.tiltDeg}°（葉輪端抬高）</text>
</svg>`;
  writeFileSync('docs/nacelle-section.svg', svg);
}

// ---------------------------------------------------------------------
// 3. 父子群組與零件連接關係（Mermaid）
// ---------------------------------------------------------------------
{
  const kindStyle = { mech: '==>', power: '-.->', signal: '-->', control: '-->', support: '---' };
  const hier = HIERARCHY.filter((h) => h.parent).map((h) => `  ${h.parent} --> ${h.id}`);
  const parts = PARTS.map((p) => `  ${p.id}["${name(p.id)}"]:::${p.group}`);
  const conns = CONNECTIONS.map((c) => `  ${c.from} ${kindStyle[c.kind]}|${c.label}| ${c.to}`);
  const md = `# 零件連接關係與父子群組

> 由 \`tools/gen-diagrams.mjs\` 依 \`src/spec/turbineSpec.js\` 自動產生，請勿手動修改。

## 場景圖父子群組

旋轉節點：\`yaw\`（繞 +Y，偏航角）、\`rotor\`（繞局部 +Z，從上風看順時針）、\`pitch*\`（繞葉片局部 +Y，槳距角）。

\`\`\`mermaid
graph TD
${hier.join('\n')}
\`\`\`

## 零件連接關係

粗箭頭 = 機械傳動，虛線 = 電力，細箭頭 = 訊號／控制，直線 = 支撐。

\`\`\`mermaid
graph LR
${parts.join('\n')}
${conns.join('\n')}
  classDef exterior fill:#eef1f4,stroke:#7b8794
  classDef internal fill:#e3f4e8,stroke:#3fae6a
  classDef gears fill:#d6f0de,stroke:#1f7a45
  classDef electrical fill:#fff0e0,stroke:#ff7a1a
\`\`\`

## 能量轉換路徑

\`\`\`mermaid
graph LR
  W[風的動能] --> B[${name('blade')}／${name('hub')}<br/>旋轉機械能（慢、力量大）]
  B --> G[${name('gearbox')}<br/>加速約 ${gearboxRatio()} 倍（教學示意）]
  G --> E[${name('generator')}<br/>電能]
  E --> T[${name('transformer')}<br/>升壓]
  T --> L[${name('powerLine')}]
\`\`\`

額定時葉輪約 ${SIM.rotorRatedRpm} rpm × ${gearboxRatio()} ≈ ${Math.round(SIM.rotorRatedRpm * gearboxRatio())} rpm（發電機，教學示意）。
`;
  writeFileSync('docs/connections.md', md);
}

console.log('已產生 docs/structure.svg、docs/nacelle-section.svg、docs/connections.md');
