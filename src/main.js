/**
 * 应用装配层：把引擎、渲染器、服务与菜单/对话框连接起来。
 *
 * 这一层是唯一允许调用「引擎 + 服务 + UI」的地方：
 *  - 渲染器只读游戏状态；
 *  - 服务只消费引擎的 finished 事件；
 *  - 输入只调用引擎方法。
 */
import './styles/base.css';
import './styles/window.css';
import './styles/menus.css';
import './styles/controls.css';
import './styles/board.css';
import './styles/dialogs.css';

import { GAME_STATUS, STORAGE_KEYS, STANDARD_DIFFICULTIES, UI_SCALES, getDifficulty } from './game/config.js';
import { GAME_EVENT, createGameEngine } from './game/gameEngine.js';
import { createStorageService } from './services/storageService.js';
import { createSettingsService } from './services/settingsService.js';
import { createRecordsService } from './services/recordsService.js';
import { createAchievementService } from './services/achievementService.js';
import { createAudioService } from './services/audioService.js';
import { createBoardRenderer } from './ui/renderBoard.js';
import { createLedDisplay } from './ui/renderCounters.js';
import { createFaceRenderer } from './ui/renderFace.js';
import { isPlainObject, validateCustomConfig } from './utils/validation.js';
import { createMenuBar } from './ui/menus.js';
import {
  createDialogManager,
  showAbout,
  showAchievements,
  showConfirm,
  showControls,
  showCustomDifficulty,
  showMessage,
  showRecords,
  showRules,
} from './ui/dialogs.js';
import { createNotifier } from './ui/notifications.js';
import { createInputController } from './ui/inputController.js';
import { formatDuration, formatElapsedSeconds } from './utils/formatTime.js';

const APP_VERSION = '1.0.1';
/** 本地自生成音效（scripts/generate-sounds.mjs 生成）。 */
const SOUND_URLS = {
  reveal: new URL('./assets/sounds/reveal.wav', import.meta.url).href,
  flag: new URL('./assets/sounds/flag.wav', import.meta.url).href,
  explode: new URL('./assets/sounds/explode.wav', import.meta.url).href,
  win: new URL('./assets/sounds/win.wav', import.meta.url).href,
  newGame: new URL('./assets/sounds/newGame.wav', import.meta.url).href,
};

function collectElements(doc) {
  const ids = [
    'desktop',
    'gameWindow',
    'menubar',
    'mineCounter',
    'timeCounter',
    'faceButton',
    'board',
    'statusText',
    'dialogs',
    'toasts',
    'btnMinimize',
    'btnMaximize',
    'btnClose',
    'windowTitle',
  ];
  const map = {};
  const missing = [];
  for (const id of ids) {
    const node = doc.getElementById(id);
    if (!node) missing.push(id);
    map[id] = node;
  }
  if (missing.length > 0) throw new Error(`index.html 缺少必要节点: ${missing.join(', ')}`);
  return map;
}

/**
 * 装配并启动应用。
 * @param {Document} doc
 */
export function bootApp(doc = document) {
  const els = collectElements(doc);
  const view = doc.defaultView ?? globalThis;

  /* ---------- 服务 ---------- */
  const storage = createStorageService();
  const settings = createSettingsService({ storage });
  const records = createRecordsService({ storage });
  const achievements = createAchievementService({ storage });
  const notifier = createNotifier({ container: els.toasts });
  const dialogs = createDialogManager({ root: els.dialogs });
  const audio = createAudioService({ enabled: settings.get('soundEnabled'), soundUrls: SOUND_URLS });

  /* ---------- 引擎与渲染器 ---------- */
  const engine = createGameEngine({ allowQuestion: settings.get('allowQuestion') });
  const renderer = createBoardRenderer(els.board);
  const face = createFaceRenderer(els.faceButton);
  const mineLed = createLedDisplay(els.mineCounter, { digits: 3 });
  const timeLed = createLedDisplay(els.timeCounter, { digits: 3 });

  const desktop = view.desktop && view.desktop.isDesktop ? view.desktop : null;
  let tickHandle = null;
  let lastFitted = { width: 0, height: 0 };

  // 桌面版：窗口本身就是应用窗口，去掉「桌面背景留白」，让窗口尺寸严格等于内容尺寸
  if (desktop) doc.body.classList.add('is-desktop');

  if (desktop && typeof desktop.onWindowState === 'function') {
    desktop.onWindowState((state) => {
      els.gameWindow.classList.toggle('is-maximized', Boolean(state && state.maximized));
      // 最大化 / 还原后重新计算布局：最大化铺满屏幕，还原回到用户选择的缩放
      applyLayout();
    });
  }

  /** 桌面版：让窗口跟着棋盘大小变化（网页版直接跳过）。 */
  function fitDesktopWindow() {
    if (!desktop || typeof desktop.fitWindow !== 'function' || !els.gameWindow) return;
    if (els.gameWindow.classList.contains('is-maximized')) return;
    const rect = typeof els.gameWindow.getBoundingClientRect === 'function' ? els.gameWindow.getBoundingClientRect() : null;
    if (!rect || rect.width < 1 || rect.height < 1) return;
    const width = Math.ceil(rect.width);
    const height = Math.ceil(rect.height);
    if (Math.abs(width - lastFitted.width) <= 2 && Math.abs(height - lastFitted.height) <= 2) return;
    lastFitted = { width, height };
    Promise.resolve(desktop.fitWindow(width, height)).catch(() => {});
  }

  /* ---------- 布局 ---------- */
  const BASE_CELL = 16; // 与 CSS 的 --cell 基准一致
  const MIN_FIT_CELL = 8;
  const MAX_FIT_CELL = 64; // 单格最大 64px：初级棋盘在 4K 下也不会大到失真

  function isMaximized() {
    return els.gameWindow.classList.contains('is-maximized');
  }

  /** 可用绘制区域（扣掉桌面内边距；最大化时内边距为 0）。 */
  function availableArea() {
    const root = doc.documentElement;
    let padX = 0;
    let padY = 0;
    try {
      const style = view.getComputedStyle(els.desktop);
      padX = (Number.parseFloat(style.paddingLeft) || 0) + (Number.parseFloat(style.paddingRight) || 0);
      padY = (Number.parseFloat(style.paddingTop) || 0) + (Number.parseFloat(style.paddingBottom) || 0);
    } catch {
      /* 取不到计算样式（如 jsdom）时按无边距处理 */
    }
    return {
      width: Math.max(120, (root.clientWidth || 1024) - padX),
      height: Math.max(160, (root.clientHeight || 768) - padY),
    };
  }

  /**
   * 最大化时：把整个界面等比放大/缩小到刚好铺满可用区域。
   * 因为整窗用 zoom 等比缩放，窗口尺寸与缩放比呈线性关系，所以量一次即可算出目标比例；
   * 然后把格子量化到整数像素，避免半像素造成的格线错位。
   */
  function computeFitScale(currentScale) {
    const rect = els.gameWindow.getBoundingClientRect();
    const frame = typeof els.gameWindow.querySelector === 'function' ? els.gameWindow.querySelector('.board-frame') : null;
    const frameRect = frame ? frame.getBoundingClientRect() : null;
    if (!rect.height || !frameRect || !frameRect.width) return currentScale;

    const area = availableArea();
    // 最大化时窗口元素本身被 flex 拉伸，因此用「雷区框 + 左右外边距」推算窗口的自然宽度
    const naturalWidth = frameRect.width + 12 * currentScale;
    const factor = Math.min(area.width / naturalWidth, area.height / rect.height);
    const cell = Math.max(MIN_FIT_CELL, Math.min(MAX_FIT_CELL, Math.floor(BASE_CELL * currentScale * factor)));
    return cell / BASE_CELL;
  }

  function applyLayout() {
    // 普通窗口：严格使用用户选择的缩放比例（不再按视口偷偷缩小）。
    // 最大化：等比放大到铺满屏幕，避免四周留下大片灰色空白。
    const requested = UI_SCALES.includes(settings.get('uiScale')) ? settings.get('uiScale') : 1;
    const current = Number(doc.documentElement.style.getPropertyValue('--ui-scale')) || requested;
    const scale = isMaximized() ? computeFitScale(current) : requested;
    doc.documentElement.style.setProperty('--ui-scale', String(Number(scale.toFixed(4))));
    // --cols 供 CSS 计算「控制区 / 雷区外框」的统一宽度，两者左右边界严格对齐
    doc.documentElement.style.setProperty('--cols', String(engine.state.cols));
    fitDesktopWindow();
  }

  /* ---------- 界面同步 ---------- */
  function syncChrome() {
    const state = engine.state;
    const flagCount = state.flags;
    const remaining = engine.getMineCounter();
    mineLed.setValue(remaining, `剩余地雷 ${remaining}`);
    timeLed.setValue(formatElapsedSeconds(engine.getElapsedMs()), '计时');

    if (state.status === GAME_STATUS.LOST) face.set('dead');
    else if (state.status === GAME_STATUS.WON) face.set('win');
    else face.set('smile');

    const label = state.config.custom ? '自定义' : state.config.label;
    const opened = state.openedSafe;
    const safeTotal = state.safeTotal;
    // 状态栏与雷区同宽，文字过长会以省略号截断（鼠标悬停可看全文）
    const statusText =
      `${label} ${state.cols}×${state.rows} · ${state.mines} 雷 · 已打开 ${opened}/${safeTotal} · 红旗 ${flagCount}`;
    els.statusText.textContent = statusText;
    els.statusText.title = statusText;

    const config = state.config;
    const activeId = config.custom ? 'difficulty.custom' : `difficulty.${config.id}`;
    menu.setRadio('difficulty', activeId);
  }

  function ensureTickLoop() {
    if (tickHandle !== null || typeof view.setInterval !== 'function') return;
    tickHandle = view.setInterval(() => {
      if (engine.status === GAME_STATUS.PLAYING) {
        timeLed.setValue(formatElapsedSeconds(engine.getElapsedMs()), '计时');
      }
    }, 200);
  }

  /* ---------- 菜单 ---------- */
  const menu = createMenuBar({ container: els.menubar, onCommand: (id) => handleCommand(id) });

  function applySettings() {
    const current = settings.get();
    audio.setEnabled(current.soundEnabled);
    engine.setOptions({ allowQuestion: current.allowQuestion });
    doc.body.classList.toggle('reduced-motion', current.reducedMotion);
    menu.setChecked('setting.sound', current.soundEnabled);
    menu.setChecked('setting.reducedMotion', current.reducedMotion);
    menu.setChecked('setting.allowQuestion', current.allowQuestion);
    menu.setRadio('scale', `setting.scale.${current.uiScale}`);
    applyLayout();
  }

  /* ---------- 开局 ---------- */
  function persistSession() {
    const config = engine.config;
    storage.write(STORAGE_KEYS.session, {
      difficultyId: config.custom ? 'custom' : config.id,
      custom: config.custom ? { rows: config.rows, cols: config.cols, mines: config.mines } : null,
    });
  }

  function startGame(source) {
    engine.newGame(source);
    persistSession();
  }

  function restartCurrent() {
    engine.reset();
    persistSession();
  }

  function startStandard(id) {
    startGame(getDifficulty(id));
  }

  async function openCustomDialog() {
    const config = engine.config;
    const initial = { rows: config.rows, cols: config.cols, mines: config.mines };
    const result = await showCustomDifficulty(dialogs, { initial });
    if (result) {
      startGame({ id: 'custom', label: '自定义', custom: true, ...result });
      audio.play('newGame');
    }
    // 取消时返回 null，且当前游戏保持不变
    return result ?? null;
  }

  function restoreInitialConfig() {
    const session = storage.read(STORAGE_KEYS.session, null);
    if (isPlainObject(session)) {
      if (session.difficultyId === 'custom' && isPlainObject(session.custom)) {
        const parsed = validateCustomConfig(session.custom);
        if (parsed.ok) return { id: 'custom', label: '自定义', custom: true, ...parsed.value };
      }
      if (STANDARD_DIFFICULTIES.includes(session.difficultyId)) return getDifficulty(session.difficultyId);
    }
    return getDifficulty('beginner');
  }

  /* ---------- 终局处理 ---------- */
  function handleFinished(event) {
    const payload = event.payload;
    const won = payload.result === 'win';

    const { bestUpdated, best } = records.recordGame(payload);
    const achievementOutcome = achievements.handleGameFinished(payload);

    face.set(won ? 'win' : 'dead');
    syncChrome();
    audio.play(won ? 'win' : 'explode');

    for (const def of achievementOutcome.unlocked) notifier.achievement(def);

    if (won) {
      notifier.toast({
        title: bestUpdated ? `新纪录：${formatDuration(payload.elapsedMs)}` : '通关成功',
        text: `${payload.label} · 用时 ${formatDuration(payload.elapsedMs)}`,
      });
      if (!bestUpdated && best && best.timeMs <= payload.elapsedMs) {
        notifier.toast({ title: '本难度最佳成绩', text: formatDuration(best.timeMs), kind: 'info', duration: 2600 });
      }
    } else {
      notifier.toast({ title: '踩到地雷', text: '点击笑脸或按 F2 重新开始', kind: 'info', duration: 2600 });
    }
  }

  function handleEngineEvent(event) {
    switch (event.type) {
      case GAME_EVENT.NEW:
        renderer.build(engine.state);
        applyLayout();
        syncChrome();
        break;
      case GAME_EVENT.CELLS:
        renderer.update(event.indexes);
        if (event.reason === 'open' || event.reason === 'chord') audio.play('reveal');
        else if (event.reason === 'mark') audio.play('flag');
        break;
      case GAME_EVENT.STARTED:
        ensureTickLoop();
        syncChrome();
        break;
      case GAME_EVENT.STATE:
        syncChrome();
        break;
      case GAME_EVENT.FINISHED:
        handleFinished(event);
        break;
      default:
        break;
    }
  }

  /* ---------- 菜单命令 ---------- */
  function aboutInfo() {
    return {
      productName: 'Windows 7 Classic Minesweeper',
      version: APP_VERSION,
      platform: desktop ? `Electron 桌面版（${desktop.platform ?? 'unknown'}）` : '浏览器',
      runtime: view.navigator?.userAgent ?? '—',
      persistence: storage.isPersistent ? 'localStorage 可用' : '仅内存（刷新后不保留）',
    };
  }

  async function resetRecords() {
    const ok = await showConfirm(dialogs, {
      title: '清除成绩与统计',
      message: '确定要清除最佳成绩、统计数据和历史记录吗？',
      detail: '成就解锁进度不会被清除，此操作不可撤销。',
      okLabel: '清除',
    });
    if (!ok) return;
    records.reset();
    notifier.toast({ title: '成绩与统计已清除' });
    return showRecords(dialogs, records);
  }

  async function handleExit() {
    if (desktop) {
      desktop.closeWindow();
      return;
    }
    return showMessage(dialogs, {
      title: '退出',
      message: '网页版无法用脚本关闭浏览器标签页。',
      detail: '请直接关闭标签页或窗口；在 Electron 桌面版中该菜单项会真正结束应用。',
      okLabel: '知道了',
    });
  }

  function handleCommand(id) {
    switch (id) {
      case 'game.new':
        restartCurrent();
        audio.play('newGame');
        break;
      case 'difficulty.beginner':
      case 'difficulty.intermediate':
      case 'difficulty.expert':
        startStandard(id.slice('difficulty.'.length));
        audio.play('newGame');
        break;
      case 'difficulty.custom':
        openCustomDialog();
        break;
      case 'records':
      case 'help.records':
        showRecords(dialogs, records);
        break;
      case 'help.rules':
        showRules(dialogs);
        break;
      case 'help.controls':
        showControls(dialogs);
        break;
      case 'help.achievements':
        showAchievements(dialogs, achievements);
        break;
      case 'help.about':
        showAbout(dialogs, aboutInfo());
        break;
      case 'exit':
        handleExit();
        break;
      case 'setting.sound': {
        const next = settings.toggle('soundEnabled');
        applySettings();
        if (next.soundEnabled) audio.play('flag');
        notifier.toast({ title: `音效已${next.soundEnabled ? '开启' : '关闭'}`, duration: 1800 });
        break;
      }
      case 'setting.reducedMotion':
        settings.toggle('reducedMotion');
        applySettings();
        break;
      case 'setting.allowQuestion':
        settings.toggle('allowQuestion');
        applySettings();
        break;
      case 'setting.resetRecords':
        resetRecords();
        break;
      default:
        if (id.startsWith('setting.scale.')) {
          const value = Number(id.slice('setting.scale.'.length));
          if (UI_SCALES.includes(value)) {
            settings.set({ uiScale: value });
            applySettings();
          }
        }
        break;
    }
  }

  /* ---------- 窗口按钮 ---------- */
  function toggleMaximize() {
    if (desktop) {
      desktop.toggleMaximize();
      return;
    }
    const maximized = els.gameWindow.classList.toggle('is-maximized');
    els.desktop.classList.toggle('desktop--maximized', maximized);
    applyLayout();
  }

  function minimizeWindow() {
    if (desktop) {
      desktop.minimize();
      return;
    }
    notifier.toast({ title: '网页版不支持最小化', text: '桌面版中会真正最小化到任务栏。', kind: 'info', duration: 2400 });
  }

  async function closeWindow() {
    if (desktop) {
      desktop.closeWindow();
      return;
    }
    return showMessage(dialogs, {
      title: '关闭',
      message: '浏览器不允许网页脚本关闭标签页。',
      detail: '请使用浏览器自身的关闭按钮；桌面版中此按钮会真正关闭窗口。',
      okLabel: '知道了',
    });
  }

  /* ---------- 键盘与音频解锁 ---------- */
  function handleDocumentKeyDown(event) {
    if (dialogs.isOpen()) return;
    if (event.key === 'F2') {
      event.preventDefault();
      restartCurrent();
      audio.play('newGame');
      return;
    }
    if (event.key === 'Escape') menu.close();
  }

  function unlockAudio() {
    Promise.resolve(audio.unlock()).catch(() => {});
    doc.removeEventListener('pointerdown', unlockAudio, true);
    doc.removeEventListener('keydown', unlockAudio, true);
  }

  /* ---------- 装配 ---------- */
  const input = createInputController({ board: els.board, renderer, engine, face });

  els.faceButton.addEventListener('click', () => {
    restartCurrent();
    audio.play('newGame');
  });
  els.btnMinimize.addEventListener('click', minimizeWindow);
  els.btnMaximize.addEventListener('click', toggleMaximize);
  els.btnClose.addEventListener('click', closeWindow);
  doc.addEventListener('keydown', handleDocumentKeyDown);
  doc.addEventListener('pointerdown', unlockAudio, true);
  doc.addEventListener('keydown', unlockAudio, true);
  if (typeof view.addEventListener === 'function') view.addEventListener('resize', applyLayout);

  engine.subscribe(handleEngineEvent);
  applySettings();
  startGame(restoreInitialConfig());
  ensureTickLoop();

  return {
    engine,
    renderer,
    input,
    records,
    achievements,
    settings,
    audio,
    dialogs,
    menu,
    notifier,
    els,
    startStandard,
    restart: restartCurrent,
    openCustomDialog,
    handleCommand,
    destroy() {
      if (tickHandle !== null) view.clearInterval(tickHandle);
      input.destroy();
      menu.destroy();
      dialogs.closeAll();
      notifier.clear();
      audio.dispose();
    },
  };
}

/* ---------- 浏览器自动启动 ---------- */
if (typeof document !== 'undefined' && document.getElementById('board') && !globalThis.__classicMinesweeperBooted) {
  globalThis.__classicMinesweeperBooted = true;
  const start = () => bootApp(document);
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start, { once: true });
  else start();
}
