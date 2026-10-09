/**
 * 测试公共工具：手工构造确定性棋盘，避免依赖随机布局。
 */
import { createBoard, computeAdjacent, createPrng } from '../src/game/boardGenerator.js';

export const idx = (row, col, cols) => row * cols + col;

/** 手工指定地雷位置构造棋盘状态。 */
export function makeState(rows, cols, mineIndexes = [], mines = null) {
  const board = createBoard(rows, cols);
  for (const i of mineIndexes) board[i].mine = true;
  computeAdjacent(board, rows, cols);
  return {
    rows,
    cols,
    mines: mines ?? mineIndexes.length,
    board,
  };
}

/** 统计棋盘上的红旗与已打开格子，方便断言。 */
export function snapshot(state) {
  return {
    open: state.board.filter((cell) => cell.open).length,
    flags: state.board.filter((cell) => cell.mark === 'flag').length,
    questions: state.board.filter((cell) => cell.mark === 'question').length,
    mines: state.board.filter((cell) => cell.mine).length,
    exploded: state.board.filter((cell) => cell.exploded).length,
    wrong: state.board.filter((cell) => cell.wrong).length,
  };
}

/** 固定种子的随机源，保证测试可复现。 */
export function seededRng(seed = 42) {
  return createPrng(seed);
}

/** 简易假时钟，用于计时相关断言。 */
export function createClock(start = 1_000_000) {
  let current = start;
  return {
    now: () => current,
    advance: (ms) => {
      current += ms;
      return current;
    },
    set: (value) => {
      current = value;
      return current;
    },
  };
}
