import { defineConfig } from 'vitest/config';

/**
 * 单元测试默认运行在 node 环境（游戏逻辑 + 服务层）。
 * 需要 DOM 的测试文件在文件顶部使用 `/** @vitest-environment jsdom *\/` 注释切换。
 * 注意：本配置存在时 Vitest 会忽略 vite.config.js 的 root:src 设置，测试根目录为项目根。
 */
export default defineConfig({
  test: {
    include: ['tests/**/*.test.js'],
    environment: 'node',
    globals: false,
    restoreMocks: true,
    reporters: ['default'],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'html'],
      reportsDirectory: 'cache/coverage',
      include: ['src/game/**', 'src/services/**', 'src/utils/**', 'src/ui/**'],
    },
  },
});
