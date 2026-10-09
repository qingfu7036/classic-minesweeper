/**
 * 开格与空白区域展开。
 * 全部使用显式队列迭代实现，不存在递归，因此不会栈溢出。
 */
import { MARK } from './config.js';
import { neighborIndexes, rowOf, colOf } from './boardGenerator.js';

export const REVEAL_STATUS = {
  IGNORED: 'ignored',
  OPENED: 'opened',
  MINE: 'mine',
  NOOP: 'noop',
};

function inRange(board, index) {
  return Number.isInteger(index) && index >= 0 && index < board.length;
}

/**
 * 打开单个格子。已打开的格子、插旗的格子会被忽略；
 * 问号标记不阻止左键打开（与经典行为一致，打开后问号清除）。
 */
export function revealAt(state, index) {
  const { board } = state;
  if (!inRange(board, index)) return { status: REVEAL_STATUS.IGNORED, opened: [] };
  const cell = board[index];
  if (cell.open || cell.mark === MARK.FLAG) return { status: REVEAL_STATUS.IGNORED, opened: [] };
  if (cell.mine) return { status: REVEAL_STATUS.MINE, opened: [], mineIndex: index };
  const opened = floodFill(state, index);
  return { status: REVEAL_STATUS.OPENED, opened };
}

/**
 * 从 start 开始展开相连空白区域。
 * 规则：只从 adjacent === 0 的格子继续扩散；旗子阻挡扩散；地雷永不被自动打开。
 */
export function floodFill(state, start) {
  const { board, rows, cols } = state;
  const opened = [];
  const queue = [start];
  const seen = new Set([start]);
  let head = 0;

  while (head < queue.length) {
    const index = queue[head];
    head += 1;
    const cell = board[index];
    if (cell.open || cell.mine || cell.mark === MARK.FLAG) continue;

    cell.open = true;
    if (cell.mark === MARK.QUESTION) cell.mark = MARK.NONE;
    opened.push(index);

    if (cell.adjacent !== 0) continue;
    for (const next of neighborIndexes(index, rows, cols)) {
      if (seen.has(next)) continue;
      const neighbor = board[next];
      if (neighbor.open || neighbor.mine || neighbor.mark === MARK.FLAG) continue;
      seen.add(next);
      queue.push(next);
    }
  }
  return opened;
}

/**
 * 快速开格（双击 / 左右键同时按 / 中键）。
 * 只有当已打开数字格周围的红旗数量恰好等于该数字时才生效。
 * 若周围存在未插旗的地雷，则正常触发失败。
 */
export function chordAt(state, index) {
  const { board } = state;
  if (!inRange(board, index)) return { status: REVEAL_STATUS.IGNORED, opened: [] };
  const cell = board[index];
  if (!cell.open || cell.adjacent === 0) return { status: REVEAL_STATUS.IGNORED, opened: [] };

  const neighbors = neighborIndexes(index, state.rows, state.cols);
  let flags = 0;
  const targets = [];
  for (const n of neighbors) {
    const neighbor = board[n];
    if (neighbor.open) continue;
    if (neighbor.mark === MARK.FLAG) {
      flags += 1;
      continue;
    }
    targets.push(n);
  }

  if (flags !== cell.adjacent) return { status: REVEAL_STATUS.NOOP, opened: [] };
  if (targets.length === 0) return { status: REVEAL_STATUS.NOOP, opened: [] };

  for (const n of targets) {
    if (board[n].mine) return { status: REVEAL_STATUS.MINE, opened: [], mineIndex: n };
  }

  const opened = [];
  for (const n of targets) {
    if (board[n].open) continue;
    if (board[n].mark === MARK.FLAG) continue;
    opened.push(...floodFill(state, n));
  }
  return { status: REVEAL_STATUS.OPENED, opened };
}

/** 判断索引是否在棋盘内（UI 层复用）。 */
export function isValidIndex(state, index) {
  return inRange(state.board, index);
}

export { rowOf, colOf };
