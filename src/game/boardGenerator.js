/**
 * 地雷生成与数字计算。
 * 采用延迟初始化：新局只创建空棋盘，首次有效左键时才调用 placeMines。
 */
import { MARK } from './config.js';

/** 新建一个格子对象。 */
export function createCell() {
  return {
    /** 是否是地雷。 */
    mine: false,
    /** 周围 8 格的地雷数量。 */
    adjacent: 0,
    /** 是否已打开。 */
    open: false,
    /** 标记状态：none | flag | question。 */
    mark: MARK.NONE,
    /** 是否是踩中的那颗雷（失败时高亮）。 */
    exploded: false,
    /** 是否是插错的旗（失败时用红叉显示）。 */
    wrong: false,
  };
}

/** 创建 rows × cols 的空棋盘（扁平数组，index = row * cols + col）。 */
export function createBoard(rows, cols) {
  const total = rows * cols;
  const board = new Array(total);
  for (let i = 0; i < total; i += 1) board[i] = createCell();
  return board;
}

/** 清空棋盘上的所有状态（重开时复用同一数组对象）。 */
export function resetBoard(board) {
  for (let i = 0; i < board.length; i += 1) {
    const cell = board[i];
    cell.mine = false;
    cell.adjacent = 0;
    cell.open = false;
    cell.mark = MARK.NONE;
    cell.exploded = false;
    cell.wrong = false;
  }
  return board;
}

export function indexOf(row, col, cols) {
  return row * cols + col;
}

export function rowOf(index, cols) {
  return Math.floor(index / cols);
}

export function colOf(index, cols) {
  return index % cols;
}

export function isInside(row, col, rows, cols) {
  return row >= 0 && row < rows && col >= 0 && col < cols;
}

/** 遍历 8 邻格，越界的自动跳过（边界与角落同样正确）。 */
export function forEachNeighbor(row, col, rows, cols, callback) {
  for (let dr = -1; dr <= 1; dr += 1) {
    for (let dc = -1; dc <= 1; dc += 1) {
      if (dr === 0 && dc === 0) continue;
      const r = row + dr;
      const c = col + dc;
      if (!isInside(r, c, rows, cols)) continue;
      callback(r, c, r * cols + c);
    }
  }
}

/** 返回某个格子的全部 8 邻格索引数组。 */
export function neighborIndexes(index, rows, cols) {
  const out = [];
  forEachNeighbor(rowOf(index, cols), colOf(index, cols), rows, cols, (r, c, i) => out.push(i));
  return out;
}

/** mulberry32：可复现的伪随机数生成器，测试与种子局使用。 */
export function createPrng(seed = 1) {
  let a = seed >>> 0;
  return function next() {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** 原地 Fisher-Yates 洗牌。 */
export function shuffle(array, rng = Math.random) {
  for (let i = array.length - 1; i > 0; i -= 1) {
    const j = Math.floor(rng() * (i + 1));
    const tmp = array[i];
    array[i] = array[j];
    array[j] = tmp;
  }
  return array;
}

/**
 * 生成地雷。
 * @param {object} options
 * @param {Array} options.board 已创建的棋盘
 * @param {number} options.rows
 * @param {number} options.cols
 * @param {number} options.mines 地雷数量（必须精确等于这个数字）
 * @param {number} [options.safeIndex] 首次点击的格子索引，该格与 8 邻格不放雷
 * @param {() => number} [options.rng]
 */
export function placeMines({ board, rows, cols, mines, safeIndex = -1, rng = Math.random }) {
  const total = rows * cols;
  if (!Number.isInteger(mines) || mines < 0) throw new RangeError('地雷数必须是 >= 0 的整数');
  if (mines > total - 1) throw new RangeError('地雷数必须小于总格子数');

  const banned = new Set();
  if (safeIndex >= 0 && safeIndex < total) {
    banned.add(safeIndex);
    for (const i of neighborIndexes(safeIndex, rows, cols)) banned.add(i);
  }
  // 棋盘太小或雷太密时，安全区降级为「只保证首次点击格安全」，地雷数量仍然精确。
  if (total - banned.size < mines) {
    banned.clear();
    if (safeIndex >= 0 && safeIndex < total) banned.add(safeIndex);
  }

  const candidates = [];
  for (let i = 0; i < total; i += 1) {
    if (!banned.has(i)) candidates.push(i);
  }
  if (candidates.length < mines) throw new RangeError('无法在排除安全区后放置指定数量的地雷');

  shuffle(candidates, rng);
  for (let k = 0; k < mines; k += 1) board[candidates[k]].mine = true;

  computeAdjacent(board, rows, cols);
  return board;
}

/** 重新计算每个非雷格周围的雷数。 */
export function computeAdjacent(board, rows, cols) {
  for (let i = 0; i < board.length; i += 1) {
    const cell = board[i];
    if (cell.mine) {
      cell.adjacent = 0;
      continue;
    }
    let count = 0;
    forEachNeighbor(rowOf(i, cols), colOf(i, cols), rows, cols, (r, c, n) => {
      if (board[n].mine) count += 1;
    });
    cell.adjacent = count;
  }
  return board;
}

/** 统计棋盘上的地雷数量（测试与校验用）。 */
export function countMines(board) {
  let count = 0;
  for (const cell of board) if (cell.mine) count += 1;
  return count;
}
