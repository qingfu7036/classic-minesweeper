/**
 * 单局游戏状态机：统一管理开局、操作、计时与胜负状态。
 * UI 只能通过本模块暴露的方法改变游戏，订阅事件后被动渲染。
 */
import {
  GAME_STATUS,
  MARK,
  DEFAULT_DIFFICULTY,
  STANDARD_DIFFICULTIES,
  getDifficulty,
  maxMinesFor,
} from './config.js';
import { createBoard, placeMines } from './boardGenerator.js';
import { revealAt, chordAt, REVEAL_STATUS } from './reveal.js';
import { cycleMark, countFlags } from './marking.js';
import { applyLoss, applyWin, buildResult, countOpenedSafeCells, isBoardCleared } from './winLose.js';

/** 事件类型常量，UI 与测试都从这里引用，避免字符串拼写错误。 */
export const GAME_EVENT = {
  NEW: 'new',
  STARTED: 'started',
  CELLS: 'cells',
  STATE: 'state',
  FINISHED: 'finished',
};

/** 把难度 id 或配置对象规范化为内部配置结构。 */
export function normalizeConfig(source) {
  const raw = typeof source === 'string' ? getDifficulty(source) : source ?? getDifficulty(DEFAULT_DIFFICULTY);
  // 未显式声明 custom 时：只有标准难度 id 才按标准难度处理，其余一律视为自定义，
  // 避免自定义棋盘的战绩污染标准难度记录/成就。
  const custom = raw.custom === undefined ? !STANDARD_DIFFICULTIES.includes(raw.id) : Boolean(raw.custom);
  const rows = Math.trunc(raw.rows);
  const cols = Math.trunc(raw.cols);
  const mines = Math.trunc(raw.mines);
  const total = rows * cols;

  if (!Number.isInteger(rows) || rows < 1) throw new RangeError('行数必须是正整数');
  if (!Number.isInteger(cols) || cols < 1) throw new RangeError('列数必须是正整数');
  if (!Number.isInteger(mines) || mines < 1) throw new RangeError('地雷数必须是正整数');
  if (mines > maxMinesFor(rows, cols)) {
    throw new RangeError(`地雷数超过该棋盘允许的上限（${maxMinesFor(rows, cols)}）`);
  }

  return {
    id: custom ? 'custom' : raw.id ?? DEFAULT_DIFFICULTY,
    label: raw.label ?? (custom ? '自定义' : raw.id),
    custom,
    rows,
    cols,
    mines,
    total,
  };
}

function buildState(config) {
  return {
    status: GAME_STATUS.READY,
    config,
    rows: config.rows,
    cols: config.cols,
    mines: config.mines,
    board: createBoard(config.rows, config.cols),
    minesPlaced: false,
    flags: 0,
    openedSafe: 0,
    safeTotal: config.total - config.mines,
    startedAt: null,
    endedAt: null,
    explodedIndex: -1,
    /** 本局中「把旗子插到安全格」的次数（完美标记成就的判定依据）。 */
    misflags: 0,
    moves: 0,
  };
}

/**
 * 创建游戏引擎。
 * @param {object} [options]
 * @param {() => number} [options.now] 时间源，测试可注入假时钟
 * @param {() => number} [options.rng] 随机源，测试可注入种子随机数
 * @param {boolean} [options.allowQuestion] 是否启用问号标记
 */
export function createGameEngine({ now = () => Date.now(), rng = Math.random, allowQuestion = true } = {}) {
  const listeners = new Set();
  let options = { allowQuestion };
  let state = buildState(normalizeConfig(DEFAULT_DIFFICULTY));

  function emit(event) {
    for (const listener of Array.from(listeners)) {
      try {
        listener(event, api);
      } catch (error) {
        // 单个订阅者异常不能影响游戏进行
        if (typeof console !== 'undefined') console.error('[gameEngine] listener failed', error);
      }
    }
  }

  function isLocked() {
    return state.status === GAME_STATUS.WON || state.status === GAME_STATUS.LOST;
  }

  function elapsedMs() {
    if (state.startedAt === null) return 0;
    const end = state.endedAt === null ? now() : state.endedAt;
    return Math.max(0, end - state.startedAt);
  }

  function startIfNeeded(firstIndex) {
    if (state.minesPlaced) return;
    placeMines({
      board: state.board,
      rows: state.rows,
      cols: state.cols,
      mines: state.mines,
      safeIndex: firstIndex,
      rng,
    });
    state.minesPlaced = true;
    state.status = GAME_STATUS.PLAYING;
    state.startedAt = now();

    // 首次点击前玩家可能已经插了旗：地雷生成后才知道对错，这里补计错误插旗。
    for (const cell of state.board) {
      if (!cell.mine && cell.mark === MARK.FLAG) state.misflags += 1;
    }

    emit({ type: GAME_EVENT.STARTED, elapsedMs: 0 });
  }

  /** 统一的终局出口：冻结计时、发状态事件与结果事件。 */
  function finish(result) {
    state.endedAt = now();
    const elapsed = elapsedMs();
    const payload = buildResult(state, { result, elapsedMs: elapsed, finishedAt: now() });
    emit({ type: GAME_EVENT.STATE });
    emit({ type: GAME_EVENT.FINISHED, result, payload });
    return payload;
  }

  function win() {
    state.status = GAME_STATUS.WON;
    const { autoFlagged } = applyWin(state);
    state.flags = countFlags(state.board);
    state.openedSafe = countOpenedSafeCells(state.board);
    if (autoFlagged.length > 0) emit({ type: GAME_EVENT.CELLS, indexes: autoFlagged, reason: 'win' });
    return finish('win');
  }

  function checkWin() {
    if (!isBoardCleared(state)) return null;
    return win();
  }

  function lose(explodedIndex) {
    state.status = GAME_STATUS.LOST;
    state.explodedIndex = explodedIndex;
    const { revealedMines, wrongFlags } = applyLoss(state, explodedIndex);
    state.flags = countFlags(state.board);
    emit({
      type: GAME_EVENT.CELLS,
      indexes: [...new Set([...revealedMines, ...wrongFlags, explodedIndex])],
      reason: 'loss',
    });
    return finish('loss');
  }

  const api = {
    subscribe(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    get state() {
      return state;
    },
    get config() {
      return state.config;
    },
    get status() {
      return state.status;
    },
    isLocked,
    getElapsedMs: elapsedMs,
    setOptions(next) {
      options = { ...options, ...next };
    },
    getOptions() {
      return { ...options };
    },

    /** 按配置或难度 id 开新局（清空棋盘、标记、计时与统计）。 */
    newGame(source = state.config) {
      const config = normalizeConfig(source);
      state = buildState(config);
      emit({ type: GAME_EVENT.NEW, config });
      emit({ type: GAME_EVENT.STATE });
      return state;
    },

    /** 用当前难度重开。 */
    reset() {
      return api.newGame(state.config);
    },

    /**
     * 左键开格。首次有效开格时生成雷区并开始计时。
     * @returns {{status:string, opened:number[]}}
     */
    open(index) {
      if (isLocked()) return { status: 'locked', opened: [] };
      // 索引必须是棋盘内的整数：否则可能出现「已布雷计时但本次点击被忽略」的怪状态
      if (!Number.isInteger(index) || index < 0 || index >= state.board.length) {
        return { status: REVEAL_STATUS.IGNORED, opened: [] };
      }
      const cell = state.board[index];
      if (cell.open || cell.mark === MARK.FLAG) return { status: REVEAL_STATUS.IGNORED, opened: [] };

      startIfNeeded(index);
      state.moves += 1;
      const result = revealAt(state, index);

      if (result.status === REVEAL_STATUS.MINE) {
        const payload = lose(index);
        return { status: 'lost', opened: [], payload };
      }
      if (result.status !== REVEAL_STATUS.OPENED || result.opened.length === 0) {
        return { status: result.status, opened: [] };
      }

      state.openedSafe = countOpenedSafeCells(state.board);
      emit({ type: GAME_EVENT.CELLS, indexes: result.opened, reason: 'open' });
      const won = checkWin();
      if (won) return { status: 'won', opened: result.opened, payload: won };
      emit({ type: GAME_EVENT.STATE });
      return { status: 'opened', opened: result.opened };
    },

    /**
     * 右键循环标记：无 → 红旗 → 问号 → 无。
     * @returns {{status:'ignored'|'changed'|'locked', mark?:string, flagDelta?:number}}
     */
    mark(index) {
      if (isLocked()) return { status: 'locked' };
      const before = state.board[index];
      if (!before) return { status: 'ignored' };
      const result = cycleMark(state, index, { allowQuestion: options.allowQuestion });
      if (result.status !== 'changed') return result;

      if (result.flagDelta > 0 && !before.mine && state.minesPlaced) state.misflags += 1;
      state.flags += result.flagDelta;
      emit({ type: GAME_EVENT.CELLS, indexes: [index], reason: 'mark' });
      emit({ type: GAME_EVENT.STATE });
      return result;
    },

    /**
     * 快速开格（双击 / 左右键 / 中键）。
     * @returns {{status:string, opened:number[]}}
     */
    chord(index) {
      if (isLocked()) return { status: 'locked', opened: [] };
      if (!Number.isInteger(index) || index < 0 || index >= state.board.length) {
        return { status: REVEAL_STATUS.IGNORED, opened: [] };
      }
      const result = chordAt(state, index);
      if (result.status === REVEAL_STATUS.MINE) {
        state.moves += 1;
        const payload = lose(result.mineIndex);
        return { status: 'lost', opened: [], payload };
      }
      if (result.status !== REVEAL_STATUS.OPENED || result.opened.length === 0) {
        // 未生效的快速开格不计入操作数
        return { status: result.status, opened: [] };
      }
      state.moves += 1;
      state.openedSafe = countOpenedSafeCells(state.board);
      emit({ type: GAME_EVENT.CELLS, indexes: result.opened, reason: 'chord' });
      const won = checkWin();
      if (won) return { status: 'won', opened: result.opened, payload: won };
      emit({ type: GAME_EVENT.STATE });
      return { status: 'opened', opened: result.opened };
    },

    /** 剩余地雷计数（允许为负）。 */
    getMineCounter() {
      return state.mines - state.flags;
    },
  };

  return api;
}
