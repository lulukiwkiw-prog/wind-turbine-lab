import { defineConfig } from 'vite';

// GitHub Pages 專案網站位於 https://<帳號>.github.io/wind-turbine-lab/
// 開發伺服器用根目錄，建置與預覽用 /wind-turbine-lab/（截圖檢查即驗證此路徑）
export default defineConfig(({ command, isPreview }) => ({
  base: command === 'serve' && !isPreview ? '/' : '/wind-turbine-lab/',
  build: {
    target: 'es2020',
    chunkSizeWarningLimit: 900,
  },
  preview: { port: 4173, strictPort: true },
}));
