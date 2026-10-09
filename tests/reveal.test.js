/**
 * B. 开格与快速开格测试
 */
import { describe, expect, it } from 'vitest';
import { REVEAL_STATUS, chordAt, floodFill, revealAt } from '../src/game/reveal.js';
import { createBoard, computeAdjacent } from '../src/game/boardGenerator.js';
import { MARK } from '../src/game/config.js';
import { idx, makeState, snapshot } from './helpers.js';

describe('revealAt', () => {
  it('点击数字格只打开该格，不牵连邻居', () => {
    const cols = 3;
    const state = makeState(3, 3, [idx(0, 0, cols)]);
    const target = idx(1, 1, cols);
    const result = revealAt(state, target);
    expect(result.status).toBe(REVEAL_STATUS.OPENED);
    expect(result.opened).toEqual([target]);
    expect(snapshot(state).open).toBe(1);
  });

  it('点击地雷返回 mine 且不打开任何格子', () => {
    const cols = 3;
    const mine = idx(0, 0, cols);
    const state = makeState(3, 3, [mine]);
    const result = revealAt(state, mine);
    expect(result.status).toBe(REVEAL_STATUS.MINE);
    expect(result.mineIndex).toBe(mine);
    expect(snapshot(state).open).toBe(0);
  });

  it('已插旗的格子不能被左键打开', () => {
    const cols = 3;
    const state = makeState(3, 3, [idx(0, 0, cols)]);
    state.board[idx(2, 2, cols)].mark = MARK.FLAG;
    const result = revealAt(state, idx(2, 2, cols));
    expect(result.status).toBe(REVEAL_STATUS.IGNORED);
    expect(snapshot(state).open).toBe(0);
  });

  it('问号标记不阻止打开，且打开后问号被清除', () => {
    const cols = 3;
    const state = makeState(3, 3, [idx(0, 0, cols)]);
    const target = idx(1, 1, cols);
    state.board[target].mark = MARK.QUESTION;
    const result = revealAt(state, target);
    expect(result.status).toBe(REVEAL_STATUS.OPENED);
    expect(state.board[target].mark).toBe(MARK.NONE);
  });

  it('已打开的格子重复点击被忽略', () => {
    const cols = 4;
    const state = makeState(4, 4, [idx(0, 0, cols)]);
    revealAt(state, idx(3, 3, cols));
    const again = revealAt(state, idx(3, 3, cols));
    expect(again.status).toBe(REVEAL_STATUS.IGNORED);
  });

  it('越界索引被安全忽略', () => {
    const state = makeState(3, 3, []);
    expect(revealAt(state, -1).status).toBe(REVEAL_STATUS.IGNORED);
    expect(revealAt(state, 99).status).toBe(REVEAL_STATUS.IGNORED);
    expect(revealAt(state, 1.5).status).toBe(REVEAL_STATUS.IGNORED);
  });
});

describe('空白区域展开', () => {
  it('展开相连空白并正确显示边缘数字', () => {
    const rows = 5;
    const cols = 5;
    // 只有右下角一颗地雷，其余全空
    const state = makeState(rows, cols, [idx(4, 4, cols)]);
    const result = revealAt(state, 0);
    expect(result.status).toBe(REVEAL_STATUS.OPENED);
    // 所有非雷格都应被展开（空白区域连成一片）
    expect(result.opened).toHaveLength(24);
    expect(snapshot(state).open).toBe(24);
    // 地雷旁边的格子数字为 1
    expect(state.board[idx(3, 3, cols)].adjacent).toBe(1);
    expect(state.board[idx(3, 3, cols)].open).toBe(true);
    // 地雷本身没有被打开
    expect(state.board[idx(4, 4, cols)].open).toBe(false);
  });

  it('旗子会阻挡空白展开', () => {
    const rows = 3;
    const cols = 5;
    const state = makeState(rows, cols, [idx(0, 0, cols)]);
    const blocker = idx(1, 2, cols);
    state.board[blocker].mark = MARK.FLAG;
    const opened = floodFill(state, idx(2, 0, cols));
    // 旗子自身不会被展开打开
    expect(opened).not.toContain(blocker);
    expect(state.board[blocker].open).toBe(false);
    // 旗子以外的空白区域仍然可以从其它路径正常展开
    expect(state.board[idx(2, 2, cols)].open).toBe(true);
  });

  it('大棋盘一次性展开不会栈溢出（迭代实现）', () => {
    const rows = 40;
    const cols = 60;
    const board = createBoard(rows, cols);
    computeAdjacent(board, rows, cols);
    const state = { rows, cols, mines: 0, board };
    const opened = floodFill(state, 0);
    expect(opened).toHaveLength(rows * cols);
    expect(opened.length).toBe(2400);
  });

  it('展开过程不会打开地雷', () => {
    const rows = 4;
    const cols = 4;
    const mine = idx(3, 3, cols);
    const state = makeState(rows, cols, [mine]);
    revealAt(state, 0);
    expect(state.board[mine].open).toBe(false);
  });
});

describe('chordAt（快速开格）', () => {
  function chordState() {
    const rows = 3;
    const cols = 3;
    // 左上角是雷，中心格数字为 1
    const state = makeState(rows, cols, [idx(0, 0, cols)]);
    revealAt(state, idx(1, 1, cols));
    return state;
  }

  it('未打开的格子不能快速开格', () => {
    const cols = 3;
    const state = chordState();
    expect(chordAt(state, idx(2, 2, cols)).status).toBe(REVEAL_STATUS.IGNORED);
  });

  it('旗数与数字不符时不触发', () => {
    const cols = 3;
    const state = chordState();
    expect(chordAt(state, idx(1, 1, cols)).status).toBe(REVEAL_STATUS.NOOP);
  });

  it('旗数与数字相符时打开周围未插旗格子', () => {
    const cols = 3;
    const state = chordState();
    state.board[idx(0, 0, cols)].mark = MARK.FLAG;
    const result = chordAt(state, idx(1, 1, cols));
    expect(result.status).toBe(REVEAL_STATUS.OPENED);
    // 除地雷格外的 8 个邻居中已打开的会被跳过，其余被打开
    expect(state.board[idx(0, 1, cols)].open).toBe(true);
    expect(state.board[idx(2, 2, cols)].open).toBe(true);
    expect(state.board[idx(0, 0, cols)].open).toBe(false);
  });

  it('旗子插错时正常触发失败', () => {
    const rows = 3;
    const cols = 3;
    const state = makeState(rows, cols, [idx(0, 0, cols)]);
    revealAt(state, idx(1, 1, cols));
    // 把旗插在错误的格子上（不是雷），数量凑够 1
    state.board[idx(2, 2, cols)].mark = MARK.FLAG;
    const result = chordAt(state, idx(1, 1, cols));
    expect(result.status).toBe(REVEAL_STATUS.MINE);
    expect(result.mineIndex).toBe(idx(0, 0, cols));
  });

  it('数字为 0 的空白格不会触发快速开格', () => {
    const rows = 4;
    const cols = 4;
    const state = makeState(rows, cols, [idx(3, 3, cols)]);
    revealAt(state, 0);
    expect(chordAt(state, 0).status).toBe(REVEAL_STATUS.IGNORED);
  });
});
