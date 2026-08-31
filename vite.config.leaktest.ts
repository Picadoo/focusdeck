// 临时对照实验用（2026-08-31 根因排查）：复刻加固前的原始配置，唯一区别是端口 5199 与不设 watch.ignored。
// 用途是量出「不屏蔽大目录」时 FSWatcher 数量与内存曲线，与 5173 上的加固版做 A/B。用完即删。
import { defineConfig } from 'vitest/config'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  clearScreen: false,
  server: {
    port: 5199,
    strictPort: true,
    proxy: {
      '/api': {
        target: 'http://127.0.0.1:8787',
        changeOrigin: true,
      },
    },
  },
  build: {
    outDir: 'dist',
    sourcemap: true,
  },
  test: {
    environment: 'node',
    include: ['src/**/*.test.ts'],
  },
})
