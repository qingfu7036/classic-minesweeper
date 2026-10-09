/**
 * B. 胜负判定与终局棋盘处理测试
 */
import { describe, expect, it } from 'vitest';
import { applyLoss, applyWin, buildResult, countOpenedSafeCells, isBoardCleared } from '../src/game/winLose.js';
import { revealAt } from '../src/game/reveal.js';
import { MARK } from '../src/game/config.js';
import { idx, makeState, snapshot } from './helpers.js';

describe('isBoardCleared', () => {
  it('所有非地雷格都打开时才算胜利', () => {
    const cols = 3;
    const state = makeState(3, 3, [idx(0, 0, cols)]);
    expect(isBoardCleared(state)).toBe(false);
    revealAt(state, idx(0, 1, cols));
    expect(isBoardCleared(state)).toBe(false);
    // 手动打开剩余所有非雷格
    for (let i = 0; i < state.board.length; i += 1) {
      if (!state.board[i].mine) state.board[i].open = true;
    }
    expect(isBoardCleared(state)).toBe(true);
  });

  it('地雷本身不需要打开', () => {
    const cols = 3;
    const state = makeState(3, 3, [idx(0, 0, cols), idx(1, 1, cols)]);
    for (let i = 0; i < state.board.length; i += 1) {
      if (!state.board[i].mine) state.board[i].open = true;
    }
    expect(isBoardCleared(state)).toBe(true);
    expect(countOpenedSafeCells(state.board)).toBe(7);
  });
});

describe('applyLoss', () => {
  it('显示全部地雷、标记踩中的那颗、显示插错的旗', () => {
    const cols = 3;
    const mine = idx(0, 0, cols);
    const state = makeState(3, 3, [mine, idx(2, 2, cols)]);
    const wrongFlag = idx(1, 1, cols);
    state.board[wrongFlag].mark = MARK.FLAG;

    const result = applyLoss(state, mine);

    expect(state.board[mine].exploded).toBe(true);
    expect(state.board[mine].open).toBe(true);
    expect(state.board[idx(2, 2, cols)].open).toBe(true);
    expect(result.revealedMines.length).toBeGreaterThan(0);
    expect(state.board[wrongFlag].wrong).toBe(true);
    expect(state.board[wrongFlag].open).toBe(false);
    expect(result.wrongFlags).toEqual([wrongFlag]);
    expect(snapshot(state).wrong).toBe(1);
  });

  it('正确插旗的地雷保持旗子显示（不会被翻开成地雷）', () => {
    const cols = 3;
    const mine = idx(0, 0, cols);
    const state = makeState(3, 3, [mine]);
    state.board[mine].mark = MARK.FLAG;
    applyLoss(state, idx(1, 1, cols));
    expect(state.board[mine].mark).toBe(MARK.FLAG);
    expect(state.board[mine].wrong).toBe(false);
    // 关键：不能把已插旗的雷置为已打开，否则渲染层会把旗子换成地雷图标
    expect(state.board[mine].open).toBe(false);
  });

  it('问号标记在地雷上会被清除', () => {
    const mine = idx(0, 0, 3);
    const state = makeState(3, 3, [mine]);
    state.board[mine].mark = MARK.QUESTION;
    applyLoss(state, idx(1, 1, 3));
    expect(state.board[mine].mark).toBe(MARK.NONE);
  });
});

describe('applyWin', () => {
  it('自动为未标记的地雷插旗，已插旗的不重复处理', () => {
    const cols = 3;
    const first = idx(0, 0, cols);
    const second = idx(2, 2, cols);
    const state = makeState(3, 3, [first, second]);
    state.board[first].mark = MARK.FLAG;
    const { autoFlagged } = applyWin(state);
    expect(autoFlagged).toEqual([second]);
    expect(state.board[second].mark).toBe(MARK.FLAG);
    expect(state.board[first].mark).toBe(MARK.FLAG);
  });

  it('问号标记的地雷会被改成红旗', () => {
    const mine = idx(1, 1, 3);
    const state = makeState(3, 3, [mine]);
    state.board[mine].mark = MARK.QUESTION;
    applyWin(state);
    expect(state.board[mine].mark).toBe(MARK.FLAG);
  });
});

describe('buildResult', () => {
  it('生成包含难度与用时的结果快照', () => {
    const state = makeState(9, 9, []);
    state.config = { id: 'beginner', label: '初级', custom: false, rows: 9, cols: 9, mines: 10, total: 81 };
    state.misflags = 2;
    state.moves = 7;
    const result = buildResult(state, { result: 'win', elapsedMs: 12_345, finishedAt: 999 });
    expect(result).toMatchObject({
      result: 'win',
      difficultyId: 'beginner',
      label: '初级',
      custom: false,
      rows: 9,
      cols: 9,
      mines: 10,
      elapsedMs: 12_345,
      misflags: 2,
      moves: 7,
      finishedAt: 999,
    });
  });

  it('自定义难度使用 custom 标识，避免污染标准难度记录', () => {
    const state = makeState(5, 5, []);
    state.config = { id: 'custom', label: '自定义', custom: true, rows: 5, cols: 5, mines: 3, total: 25 };
    const result = buildResult(state, { result: 'win', elapsedMs: 100, finishedAt: 1 });
    expect(result.difficultyId).toBe('custom');
    expect(result.custom).toBe(true);
  });
});
