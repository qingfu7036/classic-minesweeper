/**
 * Electron 主进程。
 *
 * 安全基线：
 *  - contextIsolation: true，nodeIntegration: false，sandbox: true
 *  - 渲染进程只能通过 preload 暴露的 window.desktop 调用受限窗口能力
 *  - 禁止渲染页面导航到外部地址，外部链接一律交给系统浏览器
 *  - 页面本身使用自绘的 Win7 Aero 标题栏，因此窗口为 frameless
 */
'use strict';

const { app, BrowserWindow, Menu, ipcMain, shell } = require('electron');
const path = require('node:path');
const fs = require('node:fs');

const DEV_SERVER_URL = process.env.CLASSIC_MINESWEEPER_DEV_SERVER || '';
/** 自检模式：不显示窗口，加载完成后报告渲染结果并退出（用于无人值守验证）。 */
const SMOKE_MODE = process.env.CLASSIC_MINESWEEPER_SMOKE === '1';
const INDEX_HTML = path.join(__dirname, '..', 'dist', 'index.html');
const ICON_PATH = path.join(__dirname, '..', 'build', 'icon.ico');

// 自检使用独立的临时用户数据目录：保证每次都从默认状态（初级、100% 缩放）开始，结果可复现
if (SMOKE_MODE) {
  app.setPath('userData', path.join(require('node:os').tmpdir(), 'classic-minesweeper-smoke'));
}

/** @type {BrowserWindow|null} */
let mainWindow = null;

const singleInstance = app.requestSingleInstanceLock();
if (!singleInstance) {
  app.quit();
} else {
  app.on('second-instance', () => {
    if (!mainWindow) return;
    if (mainWindow.isMinimized()) mainWindow.restore();
    mainWindow.focus();
  });
}

function missingBuildPage() {
  const html = `<!doctype html><html lang="zh-CN"><meta charset="utf-8">
  <body style="font-family:'Segoe UI',Tahoma,sans-serif;background:#0f4c81;color:#fff;padding:32px">
  <h2>未找到生产构建产物</h2>
  <p>请先执行：<code>npm run build</code></p>
  <p>缺失文件：<code>${INDEX_HTML}</code></p>
  </body></html>`;
  return `data:text/html;charset=utf-8,${encodeURIComponent(html)}`;
}

function sendWindowState() {
  if (!mainWindow || mainWindow.isDestroyed()) return;
  mainWindow.webContents.send('window:state', {
    maximized: mainWindow.isMaximized(),
    minimized: mainWindow.isMinimized(),
  });
}

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 420,
    height: 560,
    // 下限必须小于初级棋盘窗口尺寸（约 171×282），否则窗口永远比内容宽、两侧留大片空白
    minWidth: 170,
    minHeight: 240,
    show: false,
    frame: false,
    backgroundColor: '#0d4a76',
    title: '扫雷',
    icon: fs.existsSync(ICON_PATH) ? ICON_PATH : undefined,
    webPreferences: {
      preload: path.join(__dirname, 'preload.cjs'),
      contextIsolation: true,
      nodeIntegration: false,
      nodeIntegrationInWorker: false,
      sandbox: true,
      webSecurity: true,
      spellcheck: false,
      devTools: !app.isPackaged,
    },
  });

  mainWindow.setMenuBarVisibility(false);
  mainWindow.removeMenu();

  mainWindow.once('ready-to-show', () => {
    if (!SMOKE_MODE) mainWindow.show();
    sendWindowState();
  });

  if (SMOKE_MODE) {
    // 自动化自检：确认 dist/index.html 真的被加载且游戏装配成功（等价于人工开窗目检白屏），
    // 并校验「窗口尺寸 == 内容尺寸」「雷区在窗口内左右对称且留白等于设计值」，
    // 这两项直接对应“窗口比棋盘大很多、到处是大片空隙”的回归。
    mainWindow.webContents.once('did-finish-load', async () => {
      try {
        await new Promise((resolve) => setTimeout(resolve, 700)); // 等窗口自适应尺寸生效
        const report = await mainWindow.webContents.executeJavaScript(`(() => {
          const box = (selector) => {
            const el = document.querySelector(selector);
            if (!el) return null;
            const rect = el.getBoundingClientRect();
            return { left: rect.left, right: rect.right, width: rect.width, height: rect.height };
          };
          const win = box('#gameWindow');
          const frame = box('.board-frame');
          return {
            cells: document.querySelectorAll('#board .cell').length,
            status: document.getElementById('statusText')?.textContent ?? '',
            isolation: typeof window.require === 'undefined',
            desktopApi: Boolean(window.desktop && window.desktop.isDesktop),
            windowWidth: win ? Math.round(win.width) : 0,
            windowHeight: win ? Math.round(win.height) : 0,
            boardFrameWidth: frame ? Math.round(frame.width) : 0,
            leftGap: win && frame ? Math.round(frame.left - win.left) : -1,
            rightGap: win && frame ? Math.round(win.right - frame.right) : -1,
          };
        })()`);

        const [contentWidth, contentHeight] = mainWindow.getContentSize();
        report.contentWidth = contentWidth;
        report.contentHeight = contentHeight;
        report.fitsContent =
          Math.abs(contentWidth - report.windowWidth) <= 6 && Math.abs(contentHeight - report.windowHeight) <= 6;
        report.layoutOk =
          report.leftGap >= 0 && Math.abs(report.leftGap - report.rightGap) <= 2 && report.leftGap <= 24;

        // 追加校验：最大化后应自动等比放大并铺满可用区域
        // （对应“最大化后还是没铺满屏幕”这个回归）
        mainWindow.maximize();
        await new Promise((resolve) => setTimeout(resolve, 700));
        const maximized = await mainWindow.webContents.executeJavaScript(`(() => {
          const box = (selector) => document.querySelector(selector).getBoundingClientRect();
          const win = box('#gameWindow');
          return {
            maximizedClass: document.getElementById('gameWindow').classList.contains('is-maximized'),
            cellWidth: Math.round(box('#board .cell').width * 100) / 100,
            winHeight: win.height,
            winWidth: win.width,
            panelWidth: box('.panel').width,
            viewportHeight: window.innerHeight,
            viewportWidth: window.innerWidth,
          };
        })()`);
        report.maximize = {
          applied: maximized.maximizedClass,
          cellWidth: maximized.cellWidth,
          heightFill: Math.round((maximized.winHeight / maximized.viewportHeight) * 1000) / 1000,
          panelFill: Math.round((maximized.panelWidth / maximized.viewportWidth) * 1000) / 1000,
        };
        report.maximizeOk =
          maximized.maximizedClass &&
          maximized.cellWidth > 16 &&
          maximized.winHeight / maximized.viewportHeight > 0.9 &&
          maximized.panelWidth / maximized.viewportWidth > 0.9;

        console.log(`[smoke] ${JSON.stringify(report)}`);
        app.exit(
          report.cells === 81 &&
            report.isolation &&
            report.desktopApi &&
            report.fitsContent &&
            report.layoutOk &&
            report.maximizeOk
            ? 0
            : 1,
        );
      } catch (error) {
        console.error('[smoke] failed:', error && error.message);
        app.exit(1);
      }
    });
    mainWindow.webContents.once('did-fail-load', (_event, code, description) => {
      console.error(`[smoke] load failed: ${code} ${description}`);
      app.exit(1);
    });
  }

  mainWindow.on('maximize', sendWindowState);
  mainWindow.on('unmaximize', sendWindowState);
  mainWindow.on('restore', sendWindowState);
  mainWindow.on('closed', () => {
    mainWindow = null;
  });

  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    if (url.startsWith('https://')) shell.openExternal(url);
    return { action: 'deny' };
  });

  /**
   * 只允许导航到开发服务器同源地址，或 dist 目录内（含子目录）的文件。
   * 不能用 startsWith 前缀匹配：`http://localhost:5173.evil.com` 与 `file://evil/share` 都会被误放行。
   */
  function isAllowedNavigation(rawUrl) {
    let target;
    try {
      target = new URL(rawUrl);
    } catch {
      return false;
    }
    if (DEV_SERVER_URL) {
      try {
        return target.origin === new URL(DEV_SERVER_URL).origin;
      } catch {
        return false;
      }
    }
    if (target.protocol !== 'file:') return false;
    const distDir = path.dirname(INDEX_HTML).toLowerCase();
    const decoded = decodeURIComponent(target.pathname).replace(/^\/(?=[A-Za-z]:)/, '');
    return path.resolve(decoded).toLowerCase().startsWith(distDir);
  }

  mainWindow.webContents.on('will-navigate', (event, url) => {
    if (!isAllowedNavigation(url)) {
      event.preventDefault();
      if (url.startsWith('https://')) shell.openExternal(url);
    }
  });

  if (DEV_SERVER_URL) {
    mainWindow.loadURL(DEV_SERVER_URL);
  } else if (fs.existsSync(INDEX_HTML)) {
    mainWindow.loadFile(INDEX_HTML);
  } else {
    mainWindow.loadURL(missingBuildPage());
  }
}

function registerIpc() {
  ipcMain.handle('app:info', () => ({
    name: app.getName(),
    version: app.getVersion(),
    electron: process.versions.electron,
    chrome: process.versions.chrome,
    node: process.versions.node,
    platform: process.platform,
    packaged: app.isPackaged,
  }));

  ipcMain.handle('window:minimize', (event) => {
    const win = BrowserWindow.fromWebContents(event.sender);
    if (win) win.minimize();
    return true;
  });

  ipcMain.handle('window:toggle-maximize', (event) => {
    const win = BrowserWindow.fromWebContents(event.sender);
    if (!win) return false;
    if (win.isMaximized()) win.unmaximize();
    else win.maximize();
    sendWindowState();
    return win.isMaximized();
  });

  ipcMain.handle('window:close', (event) => {
    const win = BrowserWindow.fromWebContents(event.sender);
    if (win) win.close();
    return true;
  });

  /** 按内容自适应窗口尺寸（与经典扫雷一致：棋盘变化时窗口跟着变）。 */
  ipcMain.handle('window:fit-content', (event, size) => {
    const win = BrowserWindow.fromWebContents(event.sender);
    if (!win || win.isMaximized() || win.isFullScreen()) return false;
    const width = Number(size?.width);
    const height = Number(size?.height);
    if (!Number.isFinite(width) || !Number.isFinite(height)) return false;
    const { workAreaSize } = require('electron').screen.getDisplayMatching(win.getBounds());
    // 下限与 BrowserWindow 的 minWidth/minHeight 保持一致（必须小于初级棋盘窗口，否则永远留白）
    const clampedWidth = Math.max(170, Math.min(Math.round(width), workAreaSize.width));
    const clampedHeight = Math.max(240, Math.min(Math.round(height), workAreaSize.height));
    const bounds = win.getBounds();
    win.setBounds({
      x: bounds.x,
      y: bounds.y,
      width: clampedWidth,
      height: clampedHeight,
    });
    return true;
  });
}

app.whenReady().then(() => {
  app.setAppUserModelId('com.kun.classicminesweeper');
  Menu.setApplicationMenu(null);
  registerIpc();
  createWindow();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});
