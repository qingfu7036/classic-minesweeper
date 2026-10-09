/**
 * 雷区渲染。
 * 只根据游戏状态生成/更新 DOM，不判断任何游戏规则。
 * 支持全量重建（新局）与增量更新（单格变化）两种模式。
 */
import { MARK, GAME_STATUS } from '../game/config.js';

const CELL_SELECTOR = '.cell';

/** 生成无障碍标签。 */
function ariaLabelFor(cell, index, cols) {
  const row = Math.floor(index / cols) + 1;
  const col = (index % cols) + 1;
  let content = '未打开';
  if (cell.open) {
    if (cell.mine) content = cell.exploded ? '踩中的地雷' : '地雷';
    else if (cell.adjacent > 0) content = `数字 ${cell.adjacent}`;
    else content = '空白';
  } else if (cell.mark === MARK.FLAG) {
    content = cell.wrong ? '插错的旗' : '已插旗';
  } else if (cell.mark === MARK.QUESTION) {
    content = '问号';
  }
  return `第 ${row} 行第 ${col} 列，${content}`;
}

export function createBoardRenderer(container) {
  let cells = [];
  let cols = 0;
  let rows = 0;
  const pressed = new Set();
  let cursor = null;
  let state = null;
  let lockedState = null;

  function classListFor(cell, index) {
    const classes = ['cell'];
    if (cell.open) {
      classes.push('cell--open');
      if (cell.mine) classes.push(cell.exploded ? 'cell--exploded' : 'cell--mine');
    } else {
      classes.push('cell--closed');
      if (cell.wrong) classes.push('cell--wrong');
      else if (cell.mark === MARK.FLAG) classes.push('cell--flag');
      else if (cell.mark === MARK.QUESTION) classes.push('cell--question');
    }
    if (pressed.has(index)) classes.push('cell--pressed');
    if (cursor === index) classes.push('cell--cursor');
    return classes.join(' ');
  }

  function paint(index) {
    const el = cells[index];
    if (!el || !state) return;
    const cell = state.board[index];
    el.className = classListFor(cell, index);
    if (cell.open && !cell.mine && cell.adjacent > 0) {
      el.textContent = String(cell.adjacent);
      el.dataset.n = String(cell.adjacent);
    } else {
      el.textContent = '';
      delete el.dataset.n;
    }
    el.setAttribute('aria-label', ariaLabelFor(cell, index, state.cols));
    el.setAttribute('aria-disabled', state.status === GAME_STATUS.WON || state.status === GAME_STATUS.LOST ? 'true' : 'false');
  }

  /** 全量重建（新局或尺寸变化时）。 */
  function build(nextState) {
    state = nextState;
    rows = nextState.rows;
    cols = nextState.cols;
    pressed.clear();
    cursor = null;
    container.style.setProperty('--cols', String(cols));
    container.textContent = '';
    cells = new Array(rows * cols);
    const fragment = document.createDocumentFragment();
    for (let i = 0; i < rows * cols; i += 1) {
      const el = document.createElement('div');
      el.dataset.index = String(i);
      el.setAttribute('role', 'gridcell');
      cells[i] = el;
      paint(i);
      fragment.appendChild(el);
    }
    container.appendChild(fragment);
    container.setAttribute('aria-rowcount', String(rows));
    container.setAttribute('aria-colcount', String(cols));
    lockedState = null; // 新棋盘强制重新计算锁定状态
    updateLockedState(nextState);
    return cells;
  }

  /** 增量更新指定格子。 */
  function update(indexes) {
    if (!state) return;
    for (const index of indexes) paint(index);
    updateLockedState(state);
  }

  function refresh(nextState = state) {
    if (!nextState) return;
    state = nextState;
    for (let i = 0; i < cells.length; i += 1) paint(i);
    updateLockedState(state);
  }

  function updateLockedState(current) {
    const locked = current.status === GAME_STATUS.WON || current.status === GAME_STATUS.LOST;
    if (locked === lockedState) return;
    lockedState = locked;
    container.classList.toggle('board--locked', locked);
    // 锁定状态变化时全量重绘：否则终局只更新改动过的格子，
    // 其余格子的 aria-disabled 会残留为 false（屏幕阅读器会以为还能操作）。
    for (let i = 0; i < cells.length; i += 1) paint(i);
  }

  function setPressed(indexes) {
    const next = new Set(indexes ?? []);
    const changed = new Set([...pressed, ...next]);
    pressed.clear();
    for (const index of next) pressed.add(index);
    for (const index of changed) paint(index);
  }

  function clearPressed() {
    if (pressed.size === 0) return;
    const changed = [...pressed];
    pressed.clear();
    for (const index of changed) paint(index);
  }

  function setCursor(index) {
    if (cursor === index) return;
    const previous = cursor;
    cursor = Number.isInteger(index) ? index : null;
    if (previous !== null) paint(previous);
    if (cursor !== null) paint(cursor);
  }

  /** 从事件目标解析格子索引。 */
  function indexFromTarget(target) {
    if (!target || typeof target.closest !== 'function') return null;
    const el = target.closest(CELL_SELECTOR);
    if (!el || !container.contains(el)) return null;
    const index = Number(el.dataset.index);
    return Number.isInteger(index) && index >= 0 && index < cells.length ? index : null;
  }

  return {
    build,
    update,
    refresh,
    setPressed,
    clearPressed,
    setCursor,
    indexFromTarget,
    getCursor() {
      return cursor;
    },
    getCellElement(index) {
      return cells[index] ?? null;
    },
    get size() {
      return { rows, cols, total: cells.length };
    },
  };
}
