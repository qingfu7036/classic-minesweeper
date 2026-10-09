import { defineConfig, devices } from '@playwright/test';

/**
 * 关键 UI 冒烟测试：真实浏览器中验证布局、菜单、计数器、棋盘交互。
 * 需要先执行 `npx playwright install chromium` 下载浏览器内核。
 *
 * 使用 channel: 'chromium'（完整 Chromium + 新版无头模式），
 * 避免依赖单独的 chromium-headless-shell 下载。
 */
export default defineConfig({
  testDir: 'tests/e2e',
  timeout: 30_000,
  expect: { timeout: 5_000 },
  fullyParallel: false,
  workers: 1,
  reporter: [['list']],
  outputDir: 'cache/playwright-results',
  use: {
    baseURL: 'http://localhost:4173',
    viewport: { width: 1280, height: 900 },
    screenshot: 'only-on-failure',
    trace: 'retain-on-failure',
  },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'], channel: 'chromium' } }],
  webServer: {
    command: 'npm run build && npm run preview',
    url: 'http://localhost:4173',
    reuseExistingServer: true,
    timeout: 120_000,
  },
});
