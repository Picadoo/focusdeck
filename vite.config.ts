import { defineConfig } from 'vitest/config'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  clearScreen: false,
  server: {
    port: 5173,
    strictPort: true,
    // 这些目录不参与 HMR，却都是大体积或高频写入区：src-tauri 是 Rust 构建产物（254MB/913 文件）、
    // android 是 Capacitor 同步产物、dist 带 sourcemap、.tmp-chrome-profile* 是截图脚本的 Chrome 用户目录
    watch: {
      ignored: [
        '**/src-tauri/**',
        '**/android/**',
        '**/dist/**',
        '**/deploy/**',
        '**/.tmp-chrome-profile*/**',
        '**/*.png',
      ],
    },
    proxy: {
      '/api': {
        target: 'http://127.0.0.1:8787',
        changeOrigin: true,
      },
    },
  },
  build: {
    outDir: 'dist',
    // 默认不出 sourcemap：index.js 是 450KB，它的 map 有 1.8MB——塞进 APK 就占掉整包
    // 三分之一，release 包还会把源码结构原样送出去。要远程调试 WebView 时临时加
    // `--sourcemap`，CLI 参数会覆盖这里。
    sourcemap: false,
  },
  test: {
    environment: 'node',
    include: ['src/**/*.test.ts'],
  },
})
