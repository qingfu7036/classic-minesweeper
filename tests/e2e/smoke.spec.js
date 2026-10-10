/**
 * E. 真实浏览器冒烟测试（Playwright / Chromium）。
 *
 * 重点验证「网页版能实际启动」与「布局不裁切、不重叠」：
 *  - 页面无控制台错误、无请求失败
 *  - 棋盘格子尺寸一致、相邻格不重叠、雷区完整落在窗口内
 *  - 三种难度切换后布局与计数器同步
 *  - 右键标记、踩雷锁定、自定义弹窗、成就/成绩面板
 */
import { expect, test } from '@playwright/test';

const SHOT_DIR = 'cache/screenshots';

test.describe('Windows 7 经典扫雷 · 浏览器冒烟', () => {
  let consoleErrors = [];
  let pageErrors = [];
  let failedRequests = [];

  test.beforeEach(async ({ page }) => {
    consoleErrors = [];
    pageErrors = [];
    failedRequests = [];
    page.on('console', (message) => {
      if (message.type() === 'error') consoleErrors.push(message.text());
    });
    page.on('pageerror', (error) => pageErrors.push(String(error)));
    page.on('requestfailed', (request) => failedRequests.push(`${request.url()} :: ${request.failure()?.errorText}`));
    await page.goto('/');
    await page.waitForSelector('#board .cell');
  });

  test('页面正常启动，没有控制台错误与资源加载失败', async ({ page }) => {
    await expect(page).toHaveTitle(/扫雷/);
    await expect(page.locator('#gameWindow')).toBeVisible();
    expect(pageErrors, `页面异常：${pageErrors.join('\n')}`).toEqual([]);
    expect(consoleErrors, `控制台错误：${consoleErrors.join('\n')}`).toEqual([]);
    expect(failedRequests, `资源加载失败：${failedRequests.join('\n')}`).toEqual([]);
  });

  test('初级：9×9 格子尺寸一致、不重叠、完整可见', async ({ page }) => {
    const cells = page.locator('#board .cell');
    await expect(cells).toHaveCount(81);

    const metrics = await page.evaluate(() => {
      const board = document.getElementById('board');
      const rects = [...board.querySelectorAll('.cell')].slice(0, 9).map((cell) => {
        const rect = cell.getBoundingClientRect();
        return { x: rect.x, y: rect.y, width: rect.width, height: rect.height };
      });
      const boardRect = board.getBoundingClientRect();
      const winRect = document.getElementById('gameWindow').getBoundingClientRect();
      return {
        rects,
        boardRect: { x: boardRect.x, y: boardRect.y, width: boardRect.width, height: boardRect.height },
        winRect: { x: winRect.x, y: winRect.y, width: winRect.width, height: winRect.height },
        columns: Number(board.style.getPropertyValue('--cols')),
      };
    });

    expect(metrics.columns).toBe(9);
    const size = metrics.rects[0].width;
    expect(size).toBeGreaterThan(10);
    for (const rect of metrics.rects) {
      expect(Math.abs(rect.width - size)).toBeLessThan(0.6);
      expect(Math.abs(rect.height - size)).toBeLessThan(0.6);
    }
    for (let i = 1; i < metrics.rects.length; i += 1) {
      // 相邻格必须严格相接（无重叠、无缝隙）
      const gap = metrics.rects[i].x - (metrics.rects[i - 1].x + metrics.rects[i - 1].width);
      expect(Math.abs(gap)).toBeLessThan(0.6);
    }
    // 雷区完整包含在窗口内
    expect(metrics.boardRect.x).toBeGreaterThanOrEqual(metrics.winRect.x - 0.6);
    expect(metrics.boardRect.x + metrics.boardRect.width).toBeLessThanOrEqual(metrics.winRect.x + metrics.winRect.width + 0.6);
  });

  test('高级难度：30×16 棋盘不裁切、不重叠', async ({ page }) => {
    await page.locator('[data-menu="game"] .menu__button').click();
    await page.locator('[data-item="difficulty.expert"]').click();

    const cells = page.locator('#board .cell');
    await expect(cells).toHaveCount(480);
    await expect(page.locator('#mineCounter')).toHaveAttribute('data-value', '099');

    const geometry = await page.evaluate(() => {
      const board = document.getElementById('board');
      const first = board.querySelector('.cell');
      const second = board.querySelectorAll('.cell')[1];
      const firstRect = first.getBoundingClientRect();
      const secondRect = second.getBoundingClientRect();
      const boardRect = board.getBoundingClientRect();
      const winRect = document.getElementById('gameWindow').getBoundingClientRect();
      return {
        cellWidth: firstRect.width,
        gap: secondRect.x - firstRect.x,
        boardWidth: boardRect.width,
        columns: Number(board.style.getPropertyValue('--cols')),
        withinWindow: boardRect.x >= winRect.x - 0.6 && boardRect.x + boardRect.width <= winRect.x + winRect.width + 0.6,
        docScrollWidth: document.documentElement.scrollWidth,
        viewportWidth: window.innerWidth,
      };
    });

    expect(geometry.columns).toBe(30);
    expect(Math.abs(geometry.gap - geometry.cellWidth)).toBeLessThan(0.8);
    expect(Math.abs(geometry.boardWidth - geometry.cellWidth * 30)).toBeLessThan(1.5);
    expect(geometry.withinWindow).toBe(true);
    expect(geometry.docScrollWidth).toBeLessThanOrEqual(geometry.viewportWidth + 2);

    await page.screenshot({ path: `${SHOT_DIR}/expert-board.png`, fullPage: true });
  });

  test('左键开格、右键标记与计数器联动，且不弹出浏览器右键菜单', async ({ page }) => {
    const opened = page.locator('#board .cell').nth(40);
    await opened.click();
    await expect(opened).toHaveClass(/cell--open/);

    // 首点会展开一片空白区域，因此必须挑一个仍然关闭的格子来验证标记（否则随机布局会导致偶发失败）
    const closedIndex = await page.evaluate(() => {
      const cells = [...document.querySelectorAll('#board .cell')];
      return cells.findIndex((cell) => !cell.classList.contains('cell--open'));
    });
    expect(closedIndex).toBeGreaterThanOrEqual(0);
    const neighbour = page.locator('#board .cell').nth(closedIndex);

    await neighbour.click({ button: 'right' });
    await expect(neighbour).toHaveClass(/cell--flag/);
    await expect(page.locator('#mineCounter')).toHaveAttribute('data-value', '009');

    await neighbour.click({ button: 'right' });
    await expect(neighbour).toHaveClass(/cell--question/);
    await expect(page.locator('#mineCounter')).toHaveAttribute('data-value', '010');
  });

  test('踩雷后棋盘锁定、笑脸变化并可重开', async ({ page }) => {
    // 先开一格确定雷区
    await page.locator('#board .cell').nth(80).click();
    const mineIndex = await page.evaluate(() => {
      const cells = [...document.querySelectorAll('#board .cell')];
      return cells.findIndex((cell) => cell.getAttribute('aria-label')?.includes('未打开') === true);
    });
    expect(mineIndex).toBeGreaterThan(-1);

    // 直接通过界面点击一颗已知地雷（用引擎状态推导：遍历点击直到失败）
    const lost = await page.evaluate(async () => {
      const board = document.getElementById('board');
      const cells = [...board.querySelectorAll('.cell')];
      for (let i = 0; i < cells.length; i += 1) {
        cells[i].dispatchEvent(new MouseEvent('mousedown', { bubbles: true, button: 0 }));
        cells[i].dispatchEvent(new MouseEvent('mouseup', { bubbles: true, button: 0 }));
        if (board.classList.contains('board--locked')) return i;
      }
      return -1;
    });
    expect(lost).toBeGreaterThan(-1);
    await expect(page.locator('#faceButton')).toHaveAttribute('data-face', 'dead');
    await expect(page.locator('#board')).toHaveClass(/board--locked/);

    await page.locator('#faceButton').click();
    await expect(page.locator('#faceButton')).toHaveAttribute('data-face', 'smile');
    await expect(page.locator('#board .cell')).toHaveCount(81);
    await expect(page.locator('#board')).not.toHaveClass(/board--locked/);
  });

  test('自定义难度弹窗：非法输入被拦截，合法输入开新局', async ({ page }) => {
    await page.locator('[data-menu="game"] .menu__button').click();
    await page.locator('[data-item="difficulty.custom"]').click();
    const dialog = page.locator('.overlay .dialog');
    await expect(dialog).toBeVisible();

    const rows = page.locator('#custom-rows');
    await rows.fill('2');
    await expect(page.locator('#custom-rows-error')).not.toBeEmpty();
    // 提交按钮位于 dialog footer，仅靠 form 属性关联表单，不能用后代选择器
    await page.getByRole('button', { name: '开始游戏' }).click();
    await expect(dialog).toBeVisible();

    await rows.fill('8');
    await page.locator('#custom-cols').fill('14');
    await page.locator('#custom-mines').fill('18');
    await page.getByRole('button', { name: '开始游戏' }).click();
    await expect(dialog).toBeHidden();
    await expect(page.locator('#board .cell')).toHaveCount(8 * 14);
    await expect(page.locator('#statusText')).toContainText('自定义');
  });

  test('超大自定义棋盘在小窗口下不被裁切（桌面层可滚动，格子不被压缩）', async ({ page }) => {
    await page.setViewportSize({ width: 320, height: 720 });
    await page.evaluate(() => window.localStorage.clear());
    await page.reload();

    await page.locator('[data-menu="game"] .menu__button').click();
    await page.locator('[data-item="difficulty.custom"]').click();
    await page.locator('#custom-rows').fill('40');
    await page.locator('#custom-cols').fill('60');
    await page.locator('#custom-mines').fill('200');
    await page.getByRole('button', { name: '开始游戏' }).click();
    await expect(page.locator('#board .cell')).toHaveCount(2400);

    // 格子保持 16px 基准尺寸（不再被强行缩小成 8px），整块棋盘通过桌面层横向滚动查看
    const geometry = await page.evaluate(() => {
      const board = document.getElementById('board').getBoundingClientRect();
      const desktop = document.getElementById('desktop');
      const cell = document.querySelector('#board .cell').getBoundingClientRect();
      return {
        cellWidth: cell.width,
        boardWidth: board.width,
        desktopScrollWidth: desktop.scrollWidth,
        desktopClientWidth: desktop.clientWidth,
      };
    });
    expect(geometry.cellWidth).toBeCloseTo(16, 1);
    expect(geometry.boardWidth).toBeCloseTo(60 * 16, 0);
    expect(geometry.desktopScrollWidth).toBeGreaterThan(geometry.desktopClientWidth);

    // 滚到最右端后，第一行最后一列必须完整可见
    await page.evaluate(() => {
      document.getElementById('desktop').scrollLeft = 99999;
    });
    const lastCellVisible = await page
      .locator('#board .cell')
      .nth(59)
      .evaluate((cell) => {
        const rect = cell.getBoundingClientRect();
        return rect.left >= -1 && rect.right <= window.innerWidth + 1;
      });
    expect(lastCellVisible).toBe(true);
  });

  test('显示缩放是等比缩放，且雷区与控制区左右对齐、无空隙', async ({ page }) => {
    const readMetrics = () =>
      page.evaluate(() => {
        const rect = (selector) => document.querySelector(selector).getBoundingClientRect();
        const win = rect('#gameWindow');
        const frame = rect('.board-frame');
        const panel = rect('.panel');
        return {
          winLeft: win.left,
          winRight: win.right,
          winWidth: win.width,
          frameLeft: frame.left,
          frameRight: frame.right,
          frameWidth: frame.width,
          panelLeft: panel.left,
          panelWidth: panel.width,
          cellWidth: rect('#board .cell').width,
          ledWidth: rect('#mineCounter').width,
        };
      });

    const at100 = await readMetrics();
    await page.locator('[data-menu="settings"] .menu__button').click();
    await page.locator('[data-item="setting.scale.1.5"]').click();
    const at150 = await readMetrics();

    // 等比：格子 / 计数器精确按 1.5 倍变化；整窗还含 1px 描边（描边不参与缩放），故留 1% 容差
    expect(at150.cellWidth / at100.cellWidth).toBeCloseTo(1.5, 2);
    expect(at150.ledWidth / at100.ledWidth).toBeCloseTo(1.5, 2);
    expect(at150.winWidth / at100.winWidth).toBeCloseTo(1.5, 1);

    // 控制区与雷区左右边界对齐（不存在横向空隙）
    expect(Math.abs(at150.panelLeft - at150.frameLeft)).toBeLessThan(1.2);
    expect(Math.abs(at150.panelWidth - at150.frameWidth)).toBeLessThan(1.2);

    // 雷区在窗口内水平居中，且左右边距等于设计值：
    // 1px 窗口描边 + (6px 控制区外边距 + 3px 外框内边距) × 1.5 ≈ 14.5px
    const leftGap = at150.frameLeft - at150.winLeft;
    const rightGap = at150.winRight - at150.frameRight;
    expect(Math.abs(leftGap - rightGap)).toBeLessThan(1.2);
    const expectedGap = (6 + 3) * 1.5 + 1; // ≈ 14.5px；半像素取整会带来 1-2px 偏差
    expect(Math.abs(leftGap - expectedGap)).toBeLessThan(3);
    expect(Math.abs(rightGap - expectedGap)).toBeLessThan(3);
  });

  test('最大化后等比放大铺满可用区域，还原后回到用户选择的缩放', async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 800 });

    const readMetrics = () =>
      page.evaluate(() => {
        const rect = (selector) => document.querySelector(selector).getBoundingClientRect();
        const win = rect('#gameWindow');
        return {
          winWidth: win.width,
          winHeight: win.height,
          cellWidth: rect('#board .cell').width,
          panelWidth: rect('.panel').width,
          viewportWidth: window.innerWidth,
          viewportHeight: window.innerHeight,
        };
      });

    const before = await readMetrics();
    expect(before.cellWidth).toBeCloseTo(16, 1);

    await page.locator('#btnMaximize').click();
    await expect(page.locator('#gameWindow')).toHaveClass(/is-maximized/);
    const maximized = await readMetrics();

    // 格子被等比放大（且是整数像素，避免格线错位）
    expect(maximized.cellWidth).toBeGreaterThan(before.cellWidth);
    expect(Math.abs(maximized.cellWidth - Math.round(maximized.cellWidth))).toBeLessThan(0.02);

    // 铺满可用区域：高度方向至少占 93%，且不溢出视口
    expect(maximized.winHeight / maximized.viewportHeight).toBeGreaterThan(0.93);
    expect(maximized.winHeight).toBeLessThanOrEqual(maximized.viewportHeight + 2);
    expect(maximized.winWidth).toBeLessThanOrEqual(maximized.viewportWidth + 2);

    // 控制区随窗口铺满，不再是被棋盘宽度“掐住”的一条
    expect(maximized.panelWidth).toBeGreaterThan(before.panelWidth * 1.5);

    // 还原后回到用户选择的缩放（100% → 16px）
    await page.locator('#btnMaximize').click();
    const restored = await readMetrics();
    expect(restored.cellWidth).toBeCloseTo(before.cellWidth, 2);
  });

  test('菜单里的帮助与成绩项都能打开真实面板', async ({ page }) => {
    await page.locator('[data-menu="help"] .menu__button').click();
    await page.locator('[data-item="help.achievements"]').click();
    await expect(page.locator('.achievement')).toHaveCount(9);
    await page.keyboard.press('Escape');

    await page.locator('[data-menu="help"] .menu__button').click();
    await page.locator('[data-item="help.rules"]').click();
    await expect(page.locator('.dialog__body')).toContainText('首次点击');
    await page.keyboard.press('Escape');

    await page.locator('[data-menu="help"] .menu__button').click();
    await page.locator('[data-item="help.records"]').click();
    await expect(page.locator('.dialog__body')).toContainText('最佳通关时间');
    await page.keyboard.press('Escape');
  });

  test('成绩 / 规则 / 成就弹窗在各种缩放与最大化下都适配屏幕', async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 800 });
    const viewport = page.viewportSize();

    const openDialog = async (itemId) => {
      await page.locator('[data-menu="help"] .menu__button').click();
      await page.locator(`[data-item="${itemId}"]`).click();
      const dialog = page.locator('.overlay .dialog');
      const box = await dialog.boundingBox();
      const footerVisible = await page.locator('.dialog__footer .btn').first().isVisible();
      await page.keyboard.press('Escape');
      return { box, footerVisible };
    };

    const assertFits = (label, { box, footerVisible }) => {
      expect(box, `${label} 弹窗应存在`).toBeTruthy();
      expect(box.x, `${label} 左边越界`).toBeGreaterThanOrEqual(-1);
      expect(box.y, `${label} 顶部越界`).toBeGreaterThanOrEqual(-1);
      expect(box.x + box.width, `${label} 右边越界`).toBeLessThanOrEqual(viewport.width + 1);
      expect(box.y + box.height, `${label} 底部越界`).toBeLessThanOrEqual(viewport.height + 1);
      expect(footerVisible, `${label} 底部按钮不可见`).toBe(true);
    };

    const panels = ['help.records', 'help.rules', 'help.achievements'];

    for (const itemId of panels) {
      assertFits(`100% / ${itemId}`, await openDialog(itemId));
    }

    await page.locator('[data-menu="settings"] .menu__button').click();
    await page.locator('[data-item="setting.scale.1.5"]').click();
    for (const itemId of panels) {
      assertFits(`150% / ${itemId}`, await openDialog(itemId));
    }

    // 最大化时整窗缩放系数会被拉到最大，弹窗最容易“炸出屏幕”
    await page.locator('#btnMaximize').click();
    await expect(page.locator('#gameWindow')).toHaveClass(/is-maximized/);
    for (const itemId of panels) {
      assertFits(`最大化 / ${itemId}`, await openDialog(itemId));
    }
  });

  test('设置项可切换且刷新后保留（音效 / 减少动画）', async ({ page }) => {
    await page.locator('[data-menu="settings"] .menu__button').click();
    await page.locator('[data-item="setting.reducedMotion"]').click();
    await expect(page.locator('body')).toHaveClass(/reduced-motion/);

    await page.reload();
    await page.waitForSelector('#board .cell');
    await expect(page.locator('body')).toHaveClass(/reduced-motion/);

    await page.locator('[data-menu="settings"] .menu__button').click();
    await page.locator('[data-item="setting.sound"]').click();
    await page.reload();
    await page.waitForSelector('#board .cell');
    const stored = await page.evaluate(() => window.localStorage.getItem('classic-minesweeper:settings'));
    expect(stored).toContain('"soundEnabled":false');
  });

  test('窗口缩放时布局不出现严重问题', async ({ page }) => {
    await page.setViewportSize({ width: 900, height: 800 });
    await page.locator('[data-menu="game"] .menu__button').click();
    await page.locator('[data-item="difficulty.expert"]').click();
    await expect(page.locator('#board .cell')).toHaveCount(480);

    const overflow = await page.evaluate(() => ({
      scrollWidth: document.documentElement.scrollWidth,
      viewport: window.innerWidth,
    }));
    expect(overflow.scrollWidth).toBeLessThanOrEqual(overflow.viewport + 2);

    await page.setViewportSize({ width: 520, height: 720 });
    const narrow = await page.evaluate(() => {
      const board = document.getElementById('board').getBoundingClientRect();
      return { boardRight: board.x + board.width, viewport: window.innerWidth, scrollWidth: document.documentElement.scrollWidth };
    });
    expect(narrow.scrollWidth).toBeLessThanOrEqual(narrow.viewport + 2);
  });

  test('初级界面截图（留档）', async ({ page }) => {
    await page.locator('#board .cell').nth(40).click();
    await page.locator('#board .cell').nth(0).click({ button: 'right' });
    await page.screenshot({ path: `${SHOT_DIR}/beginner-board.png`, fullPage: true });
    await page.locator('[data-menu="game"] .menu__button').click();
    await page.screenshot({ path: `${SHOT_DIR}/game-menu.png`, fullPage: true });
  });
});
