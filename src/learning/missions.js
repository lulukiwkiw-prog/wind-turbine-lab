// 小任務：依難度分層（國小版先填）。完成時自動打勾，不強制完成。
// check(ctx)：ctx = { state（集中狀態）, sim（模擬讀數） }，回傳 true 代表完成。
export const MISSIONS = {
  elementary: [
    { id: 'find-generator', title: '找到發電機', hint: '打開「機艙剖視」，點一下黃色的發電機。', check: ({ state }) => state.selectedPart === 'generator' },
    { id: 'find-gearbox', title: '找到齒輪箱', hint: '在「機艙剖視」裡點綠色的齒輪箱。', check: ({ state }) => state.selectedPart === 'gearbox' },
    { id: 'find-sun-gear', title: '找到太陽齒輪', hint: '到「機械拆解」按「看齒輪」，正中間的小齒輪就是太陽齒輪。', check: ({ state }) => state.selectedPart === 'sunGear' },
    { id: 'make-power', title: '讓風機開始發電', hint: '到「發電實驗」，把風速調到 3.5 m/s 以上。', check: ({ state, sim }) => state.mode === 'experiment' && sim.powerKW > 1 },
    { id: 'full-power', title: '讓風機滿載發電', hint: '風夠大時，發電量會到 2000 kW。', check: ({ state, sim }) => state.mode === 'experiment' && sim.status === 'rated' },
    { id: 'east-wind', title: '讓機艙轉向東風', hint: '按風向的「東」，等機艙慢慢轉過去對準風。', check: ({ state, sim }) => state.mode === 'experiment' && ((state.windAngleDeg % 360) + 360) % 360 === 90 && Math.abs(sim.yawErrorDeg) < 5 && state.windSpeed > 0 },
    { id: 'shutdown', title: '看風機停機保護', hint: '把風速調到 25 m/s 以上，看看風機怎麼保護自己。', check: ({ state, sim }) => state.mode === 'experiment' && sim.status === 'shutdown' },
    { id: 'feather', title: '自己把葉片轉開', hint: '選「我來調整」，把葉片角度調大，看葉輪變慢。', check: ({ state, sim }) => state.mode === 'experiment' && !state.pitchAuto && sim.pitchDeg > 60 && sim.windSpeed >= 3.5 && sim.rotorRpm < 3 },
  ],
  junior: [],
};

export function missionsFor(difficulty) {
  return MISSIONS[difficulty]?.length ? MISSIONS[difficulty] : MISSIONS.elementary;
}
