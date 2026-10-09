import { defineConfig } from 'vite';

/**
 * 网页版与 Electron 桌面版共用同一份构建产物。
 * root 指向 src/，产物输出到项目根 dist/。
 * base 使用相对路径，保证 Electron 以 file:// 加载 dist/index.html 时资源可用。
 */
export default defineConfig({
  root: 'src',
  base: './',
  build: {
    outDir: '../dist',
    emptyOutDir: true,
    target: 'es2022',
    assetsInlineLimit: 4096,
    sourcemap: false,
    chunkSizeWarningLimit: 900,
  },
  server: {
    port: 5173,
    strictPort: false,
    open: false,
  },
  preview: {
    port: 4173,
    strictPort: true,
  },
});
