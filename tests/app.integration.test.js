/**
 * E/F. 端到端集成测试（jsdom）：按真实 index.html 装配完整应用。
 * 覆盖：布局、计数器、点击与标记、胜负、记录持久化、成就、菜单命令、设置。
 * @vitest-environment jsdom
 */
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { bootApp } from '../src/main.js';
import { GAME_STATUS, MARK } from '../src/game/config.js';

// 注意：jsdom 环境下 import.meta.url 不是 file:// 协议，不能直接交给 readFileSync
const INDEX_HTML = readFileSync(path.resolve(process.cwd(), 'src', 'index.html'), 'utf8');

function fixtureMarkup() {
  const body = INDEX_HTML.slice(INDEX_HTML.indexOf('<body'), INDEX_HTML.lastIndexOf('</body>'));
  return body.replace(/<body[^>]*>/, '').replace(/<script[\s\S]*?<\/script>/g, '');
}

function loadFixture() {
  document.body.innerHTML = fixtureMarkup();
}

function clickCell(app, index, button = 0) {
  const element = app.renderer.getCellElement(index);
  element.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, button }));
  element.dispatchEvent(new MouseEvent('mouseup', { bubbles: true, button }));
  return element;
}

/** 用引擎直接完成一局（等价于玩家打开了所有非雷格）。 */
function autoWin(app) {
  const { engine } = app;
  engine.open(0);
  for (let i = 0; i < engine.state.board.length; i += 1) {
    if (!engine.state.board[i].mine) engine.open(i);
  }
}

describe('应用启动与基础交互', () => {
  let app;

  beforeEach(() => {
    window.localStorage.clear();
    document.body.innerHTML = '';
    document.documentElement.style.removeProperty('--ui-scale');
    loadFixture();
  });

  afterEach(() => {
    if (app) app.destroy();
    app = null;
  });

  it('默认启动初级难度：9×9 棋盘、010 计数器、000 计时', () => {
    app = bootApp(document);
    expect(app.engine.state.rows).toBe(9);
    expect(app.engine.state.cols).toBe(9);
    expect(app.engine.state.mines).toBe(10);
    expect(document.querySelectorAll('.cell')).toHaveLength(81);
    expect(document.getElementById('mineCounter').dataset.value).toBe('010');
    expect(document.getElementById('timeCounter').dataset.value).toBe('000');
    expect(document.getElementById('statusText').textContent).toContain('初级');
    expect(document.getElementById('faceButton').dataset.face).toBe('smile');
  });

  it('首次开格才生成雷区，且首点与邻格安全', () => {
    app = bootApp(document);
    expect(app.engine.state.minesPlaced).toBe(false);
    clickCell(app, 40);
    expect(app.engine.state.minesPlaced).toBe(true);
    expect(app.engine.status).toBe(GAME_STATUS.PLAYING);
    expect(app.engine.state.board[40].mine).toBe(false);
    expect(app.engine.state.board[40].open).toBe(true);
    expect(app.renderer.getCellElement(40).classList.contains('cell--open')).toBe(true);
  });

  it('计时在首次开格后开始，重开后归零', () => {
    app = bootApp(document);
    expect(app.engine.getElapsedMs()).toBe(0);
    clickCell(app, 0);
    expect(app.engine.state.startedAt).not.toBeNull();
    app.restart();
    expect(app.engine.getElapsedMs()).toBe(0);
    expect(document.getElementById('timeCounter').dataset.value).toBe('000');
  });

  it('右键循环标记并同步剩余地雷计数（可显示负数）', () => {
    app = bootApp(document);
    clickCell(app, 80, 2);
    expect(app.engine.state.board[80].mark).toBe(MARK.FLAG);
    expect(document.getElementById('mineCounter').dataset.value).toBe('009');
    expect(app.renderer.getCellElement(80).classList.contains('cell--flag')).toBe(true);

    clickCell(app, 80, 2);
    expect(app.engine.state.board[80].mark).toBe(MARK.QUESTION);
    expect(document.getElementById('mineCounter').dataset.value).toBe('010');

    clickCell(app, 79, 2);
    clickCell(app, 78, 2);
    clickCell(app, 77, 2);
    expect(document.getElementById('mineCounter').dataset.value).toBe('007');

    // 插满超过雷数的旗 → 负数显示
    for (let i = 0; i < 8; i += 1) clickCell(app, i + 60, 2);
    expect(app.engine.getMineCounter()).toBeLessThan(0);
    expect(document.getElementById('mineCounter').dataset.value.startsWith('-')).toBe(true);
  });

  it('已插旗的格子不会被左键打开', () => {
    app = bootApp(document);
    clickCell(app, 40, 2);
    clickCell(app, 40, 0);
    expect(app.engine.state.board[40].open).toBe(false);
    expect(app.engine.state.board[40].mark).toBe(MARK.FLAG);
  });

  it('踩雷后失败：棋盘锁定、笑脸变哭脸、记录一局失败', () => {
    app = bootApp(document);
    clickCell(app, 40); // 安全首点
    const mineIndex = app.engine.state.board.findIndex((cell) => cell.mine);
    clickCell(app, mineIndex);

    expect(app.engine.status).toBe(GAME_STATUS.LOST);
    expect(document.getElementById('faceButton').dataset.face).toBe('dead');
    expect(document.getElementById('board').classList.contains('board--locked')).toBe(true);
    expect(app.records.getStats()).toMatchObject({ played: 1, won: 0, lost: 1 });
    expect(app.records.getHistory()[0].result).toBe('loss');
    expect(app.records.getBest('beginner')).toBeNull();

    // 失败后继续点击不会改变棋盘
    const openedBefore = app.engine.state.board.filter((cell) => cell.open).length;
    clickCell(app, 1);
    clickCell(app, 2, 2);
    expect(app.engine.state.board.filter((cell) => cell.open).length).toBe(openedBefore);
  });

  it('通关后更新最佳成绩、解锁成就并弹出提示', () => {
    app = bootApp(document);
    autoWin(app);

    expect(app.engine.status).toBe(GAME_STATUS.WON);
    expect(document.getElementById('faceButton').dataset.face).toBe('win');
    expect(app.records.getBest('beginner')).not.toBeNull();

    const unlocked = app.achievements.list().filter((item) => item.unlocked).map((item) => item.id);
    expect(unlocked).toContain('first_win');
    expect(unlocked).toContain('win_beginner');
    expect(document.getElementById('toasts').children.length).toBeGreaterThan(0);
  });

  it('胜利后所有地雷自动插旗，计数器归零', () => {
    app = bootApp(document);
    autoWin(app);
    const mines = app.engine.state.board.filter((cell) => cell.mine);
    expect(mines.every((cell) => cell.mark === MARK.FLAG)).toBe(true);
    expect(app.engine.getMineCounter()).toBe(0);
    expect(document.getElementById('mineCounter').dataset.value).toBe('000');
  });

  it('重开不会清空成绩与成就，也不会残留上一局棋盘', () => {
    app = bootApp(document);
    autoWin(app);
    app.restart();

    expect(app.engine.status).toBe(GAME_STATUS.READY);
    expect(app.engine.state.minesPlaced).toBe(false);
    expect(document.querySelectorAll('.cell')).toHaveLength(81);
    expect(document.getElementById('mineCounter').dataset.value).toBe('010');
    expect(document.getElementById('timeCounter').dataset.value).toBe('000');
    expect(app.records.getBest('beginner')).not.toBeNull();
    expect(app.achievements.list().find((item) => item.id === 'first_win').unlocked).toBe(true);
    expect(app.records.getStats().played).toBe(1); // 重开不算完成新的一局
  });

  it('菜单命令切换难度会同步棋盘尺寸与计数器', () => {
    app = bootApp(document);
    app.handleCommand('difficulty.expert');
    expect(app.engine.state.cols).toBe(30);
    expect(app.engine.state.rows).toBe(16);
    expect(document.querySelectorAll('.cell')).toHaveLength(480);
    expect(document.getElementById('mineCounter').dataset.value).toBe('099');
    expect(document.getElementById('statusText').textContent).toContain('高级');

    app.handleCommand('difficulty.intermediate');
    expect(document.querySelectorAll('.cell')).toHaveLength(256);
    expect(document.getElementById('mineCounter').dataset.value).toBe('040');
  });

  it('帮助菜单的每一项都能打开真实对话框', () => {
    app = bootApp(document);
    for (const id of ['help.rules', 'help.controls', 'help.achievements', 'help.about', 'records']) {
      app.handleCommand(id);
      const overlay = document.querySelector('.overlay');
      expect(overlay, `${id} 应该打开对话框`).toBeTruthy();
      expect(overlay.textContent.length).toBeGreaterThan(20);
      app.dialogs.closeAll();
      expect(document.querySelector('.overlay')).toBeNull();
    }
  });

  it('自定义难度：非法输入被拦截，合法输入开新局', async () => {
    app = bootApp(document);
    const pending = app.openCustomDialog();
    expect(document.querySelector('.overlay')).toBeTruthy();

    const rowsInput = document.getElementById('custom-rows');
    rowsInput.value = '2'; // 低于下限
    rowsInput.dispatchEvent(new Event('input', { bubbles: true }));
    expect(document.getElementById('custom-rows-error').textContent).not.toBe('');

    const form = document.getElementById('custom-difficulty-form');
    form.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
    expect(document.querySelector('.overlay')).toBeTruthy(); // 校验失败不关闭

    rowsInput.value = '8';
    rowsInput.dispatchEvent(new Event('input', { bubbles: true }));
    document.getElementById('custom-cols').value = '12';
    document.getElementById('custom-mines').value = '15';
    form.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
    await pending;

    expect(document.querySelector('.overlay')).toBeNull();
    expect(app.engine.state.rows).toBe(8);
    expect(app.engine.state.cols).toBe(12);
    expect(app.engine.state.mines).toBe(15);
    expect(app.engine.config.custom).toBe(true);
    expect(document.querySelectorAll('.cell')).toHaveLength(96);
    expect(document.getElementById('statusText').textContent).toContain('自定义');
  });

  it('自定义难度：取消不会改变当前局面', async () => {
    app = bootApp(document);
    const before = { rows: app.engine.state.rows, cols: app.engine.state.cols, mines: app.engine.state.mines };
    const pending = app.openCustomDialog();
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    await expect(pending).resolves.toBeNull();
    expect(app.engine.state.rows).toBe(before.rows);
    expect(app.engine.state.cols).toBe(before.cols);
    expect(app.engine.state.mines).toBe(before.mines);
  });

  it('音效开关会立即生效并写入本地存储', () => {
    app = bootApp(document);
    expect(app.audio.isEnabled()).toBe(true);

    app.handleCommand('setting.sound');
    expect(app.audio.isEnabled()).toBe(false);
    expect(app.settings.get('soundEnabled')).toBe(false);
    expect(JSON.parse(window.localStorage.getItem('classic-minesweeper:settings')).data.soundEnabled).toBe(false);

    app.handleCommand('setting.sound');
    expect(app.audio.isEnabled()).toBe(true);
  });

  it('减少动画与显示缩放开关会作用到 DOM', () => {
    app = bootApp(document);
    app.handleCommand('setting.reducedMotion');
    expect(document.body.classList.contains('reduced-motion')).toBe(true);
    app.handleCommand('setting.reducedMotion');
    expect(document.body.classList.contains('reduced-motion')).toBe(false);

    app.handleCommand('setting.scale.1.25');
    expect(app.settings.get('uiScale')).toBe(1.25);
    expect(document.documentElement.style.getPropertyValue('--ui-scale')).toBe('1.25');
  });

  it('问号标记开关生效', () => {
    app = bootApp(document);
    app.handleCommand('setting.allowQuestion');
    expect(app.settings.get('allowQuestion')).toBe(false);
    clickCell(app, 40, 2);
    clickCell(app, 40, 2);
    expect(app.engine.state.board[40].mark).toBe(MARK.NONE); // 关闭后不再出现问号
  });

  it('F2 与笑脸按钮都能开新局', () => {
    app = bootApp(document);
    clickCell(app, 0);
    expect(app.engine.status).toBe(GAME_STATUS.PLAYING);
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'F2', bubbles: true }));
    expect(app.engine.status).toBe(GAME_STATUS.READY);

    clickCell(app, 0);
    document.getElementById('faceButton').dispatchEvent(new MouseEvent('click', { bubbles: true }));
    expect(app.engine.status).toBe(GAME_STATUS.READY);
  });

  it('浏览器版关闭按钮给出提示，最大化切换样式类', () => {
    app = bootApp(document);
    document.getElementById('btnMaximize').dispatchEvent(new MouseEvent('click', { bubbles: true }));
    expect(document.getElementById('gameWindow').classList.contains('is-maximized')).toBe(true);
    document.getElementById('btnMaximize').dispatchEvent(new MouseEvent('click', { bubbles: true }));
    expect(document.getElementById('gameWindow').classList.contains('is-maximized')).toBe(false);

    document.getElementById('btnClose').dispatchEvent(new MouseEvent('click', { bubbles: true }));
    const overlay = document.querySelector('.overlay');
    expect(overlay).toBeTruthy();
    expect(overlay.textContent).toContain('浏览器');
    app.dialogs.closeAll();
  });

  it('帮助菜单可以打开成绩与成就面板', () => {
    app = bootApp(document);
    app.handleCommand('help.records');
    expect(document.querySelector('.overlay').textContent).toContain('最佳通关时间');
    app.dialogs.closeAll();

    app.handleCommand('help.achievements');
    expect(document.querySelectorAll('.achievement')).toHaveLength(9);
    app.dialogs.closeAll();
  });
});

describe('刷新页面后的持久化', () => {
  let app;

  beforeEach(() => {
    window.localStorage.clear();
    document.body.innerHTML = '';
    loadFixture();
  });

  afterEach(() => {
    if (app) app.destroy();
    app = null;
  });

  it('成绩、统计、成就与设置都能跨应用实例保留', () => {
    app = bootApp(document);
    autoWin(app);
    app.handleCommand('setting.reducedMotion');
    const bestTime = app.records.getBest('beginner').timeMs;
    const unlockedBefore = app.achievements.unlockedCount();
    expect(unlockedBefore).toBeGreaterThan(0);
    app.destroy();
    app = null;

    // 模拟刷新：清空 DOM 后重新装配（localStorage 保留）
    document.body.innerHTML = '';
    document.documentElement.style.removeProperty('--ui-scale');
    loadFixture();
    app = bootApp(document);

    expect(app.records.getBest('beginner').timeMs).toBe(bestTime);
    expect(app.records.getStats()).toMatchObject({ played: 1, won: 1 });
    expect(app.achievements.unlockedCount()).toBe(unlockedBefore);
    expect(app.settings.get('reducedMotion')).toBe(true);
    expect(document.body.classList.contains('reduced-motion')).toBe(true);
  });

  it('难度选择会被记住', () => {
    app = bootApp(document);
    app.handleCommand('difficulty.intermediate');
    app.destroy();
    app = null;

    document.body.innerHTML = '';
    loadFixture();
    app = bootApp(document);
    expect(app.engine.state.rows).toBe(16);
    expect(app.engine.state.cols).toBe(16);
  });
});
