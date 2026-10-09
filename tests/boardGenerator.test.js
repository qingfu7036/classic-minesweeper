/**
 * A. 棋盘生成测试
 */
import { describe, expect, it } from 'vitest';
import {
  computeAdjacent,
  countMines,
  createBoard,
  createPrng,
  forEachNeighbor,
  neighborIndexes,
  placeMines,
  resetBoard,
  shuffle,
} from '../src/game/boardGenerator.js';
import { DIFFICULTIES, MARK, maxMinesFor } from '../src/game/config.js';
import { idx, makeState } from './helpers.js';

describe('createBoard', () => {
  it('创建尺寸精确的棋盘且初始状态干净', () => {
    const board = createBoard(9, 9);
    expect(board).toHaveLength(81);
    for (const cell of board) {
      expect(cell.mine).toBe(false);
      expect(cell.adjacent).toBe(0);
      expect(cell.open).toBe(false);
      expect(cell.mark).toBe(MARK.NONE);
    }
  });

  it('支持非正方形棋盘', () => {
    expect(createBoard(16, 30)).toHaveLength(480);
    expect(createBoard(5, 7)).toHaveLength(35);
  });
});

describe('placeMines', () => {
  it('三种标准难度的尺寸与地雷总数准确', () => {
    for (const key of Object.keys(DIFFICULTIES)) {
      const def = DIFFICULTIES[key];
      const board = createBoard(def.rows, def.cols);
      placeMines({ board, rows: def.rows, cols: def.cols, mines: def.mines, safeIndex: 0, rng: createPrng(7) });
      expect(board).toHaveLength(def.rows * def.cols);
      expect(countMines(board)).toBe(def.mines);
    }
  });

  it('首次点击格与其 8 邻格绝对不是地雷', () => {
    const rows = 16;
    const cols = 16;
    for (const safeIndex of [0, 15, 255, idx(8, 8, cols), idx(3, 0, cols)]) {
      const board = createBoard(rows, cols);
      placeMines({ board, rows, cols, mines: 40, safeIndex, rng: createPrng(safeIndex + 1) });
      expect(board[safeIndex].mine).toBe(false);
      for (const neighbor of neighborIndexes(safeIndex, rows, cols)) {
        expect(board[neighbor].mine).toBe(false);
      }
      expect(countMines(board)).toBe(40);
    }
  });

  it('角落与边缘的安全区同样正确', () => {
    const rows = 9;
    const cols = 9;
    const corner = idx(0, 0, cols);
    const board = createBoard(rows, cols);
    placeMines({ board, rows, cols, mines: 10, safeIndex: corner, rng: createPrng(3) });
    expect(neighborIndexes(corner, rows, cols)).toHaveLength(3);
    for (const neighbor of neighborIndexes(corner, rows, cols)) {
      expect(board[neighbor].mine).toBe(false);
    }
  });

  it('雷太密导致安全区不可行时，仍保证首点安全且雷数精确', () => {
    const rows = 5;
    const cols = 5;
    const total = rows * cols;
    const mines = 20; // 25 - 9 = 16 < 20，安全区必须降级
    const board = createBoard(rows, cols);
    const safeIndex = idx(2, 2, cols);
    placeMines({ board, rows, cols, mines, safeIndex, rng: createPrng(5) });
    expect(countMines(board)).toBe(mines);
    expect(board[safeIndex].mine).toBe(false);
  });

  it('地雷数超过棋盘容量时抛错，避免生成不可玩的棋盘', () => {
    const board = createBoard(3, 3);
    expect(() => placeMines({ board, rows: 3, cols: 3, mines: 9 })).toThrow(RangeError);
    expect(() => placeMines({ board, rows: 3, cols: 3, mines: -1 })).toThrow(RangeError);
  });
});

describe('computeAdjacent', () => {
  it('角落、边缘与中间的数字都正确', () => {
    const cols = 3;
    const rows = 3;
    const state = makeState(rows, cols, [idx(0, 0, cols)]);
    const board = state.board;
    expect(board[idx(0, 0, cols)].adjacent).toBe(0); // 地雷格自身不计数
    expect(board[idx(0, 1, cols)].adjacent).toBe(1);
    expect(board[idx(1, 0, cols)].adjacent).toBe(1);
    expect(board[idx(1, 1, cols)].adjacent).toBe(1);
    expect(board[idx(2, 2, cols)].adjacent).toBe(0);
  });

  it('相邻多颗地雷时计数正确', () => {
    const cols = 4;
    const rows = 4;
    const state = makeState(rows, cols, [
      idx(0, 0, cols),
      idx(0, 1, cols),
      idx(1, 0, cols),
      idx(3, 3, cols),
    ]);
    expect(state.board[idx(1, 1, cols)].adjacent).toBe(3);
    expect(state.board[idx(2, 2, cols)].adjacent).toBe(1);
    expect(state.board[idx(0, 3, cols)].adjacent).toBe(0);
  });

  it('单行棋盘上下不存在虚拟行', () => {
    const board = createBoard(1, 5);
    board[2].mine = true;
    computeAdjacent(board, 1, 5);
    expect(board[1].adjacent).toBe(1);
    expect(board[3].adjacent).toBe(1);
    expect(board[0].adjacent).toBe(0);
    expect(board[4].adjacent).toBe(0);
  });
});

describe('辅助函数', () => {
  it('neighborIndexes 在角落/边缘/中间分别返回 3/5/8 个邻居', () => {
    expect(neighborIndexes(idx(0, 0, 5), 5, 5)).toHaveLength(3);
    expect(neighborIndexes(idx(0, 2, 5), 5, 5)).toHaveLength(5);
    expect(neighborIndexes(idx(2, 2, 5), 5, 5)).toHaveLength(8);
  });

  it('forEachNeighbor 不会越界', () => {
    const seen = [];
    forEachNeighbor(0, 0, 3, 3, (row, col) => seen.push(`${row},${col}`));
    expect(seen.sort()).toEqual(['0,1', '1,0', '1,1']);
  });

  it('shuffle 使用注入的随机源，结果可复现', () => {
    const a = shuffle([1, 2, 3, 4, 5, 6], createPrng(11));
    const b = shuffle([1, 2, 3, 4, 5, 6], createPrng(11));
    expect(a).toEqual(b);
    expect([...a].sort()).toEqual([1, 2, 3, 4, 5, 6]);
  });

  it('resetBoard 清除所有残留状态', () => {
    const board = createBoard(4, 4);
    board[5].mine = true;
    board[5].open = true;
    board[6].mark = MARK.FLAG;
    board[7].wrong = true;
    board[7].exploded = true;
    resetBoard(board);
    for (const cell of board) {
      expect(cell).toMatchObject({ mine: false, adjacent: 0, open: false, mark: MARK.NONE, wrong: false, exploded: false });
    }
  });

  it('maxMinesFor 为首次点击保留安全区', () => {
    expect(maxMinesFor(9, 9)).toBe(81 - 9);
    expect(maxMinesFor(5, 5)).toBe(25 - 9);
    // 小于安全区大小的棋盘退化为「至少留 1 格」
    expect(maxMinesFor(2, 2)).toBe(3);
  });
});
