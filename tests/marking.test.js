/**
 * B. 标记循环测试
 */
import { describe, expect, it } from 'vitest';
import { countFlags, countQuestions, cycleMark, markCycle } from '../src/game/marking.js';
import { MARK } from '../src/game/config.js';
import { idx, makeState, snapshot } from './helpers.js';

describe('cycleMark', () => {
  it('循环顺序为 无 → 红旗 → 问号 → 无', () => {
    const state = makeState(3, 3, [idx(0, 0, 3)]);
    const target = idx(2, 2, 3);

    expect(cycleMark(state, target)).toMatchObject({ status: 'changed', mark: MARK.FLAG, flagDelta: 1 });
    expect(cycleMark(state, target)).toMatchObject({ status: 'changed', mark: MARK.QUESTION, flagDelta: -1 });
    expect(cycleMark(state, target)).toMatchObject({ status: 'changed', mark: MARK.NONE, flagDelta: 0 });
    expect(cycleMark(state, target).mark).toBe(MARK.FLAG);
  });

  it('关闭问号选项后只在前两态之间循环', () => {
    const state = makeState(3, 3, []);
    const target = 0;
    expect(cycleMark(state, target, { allowQuestion: false }).mark).toBe(MARK.FLAG);
    expect(cycleMark(state, target, { allowQuestion: false }).mark).toBe(MARK.NONE);
    expect(cycleMark(state, target, { allowQuestion: false }).mark).toBe(MARK.FLAG);
    expect(markCycle(false)).toEqual([MARK.NONE, MARK.FLAG]);
  });

  it('已打开的格子不能插旗', () => {
    const state = makeState(3, 3, [idx(0, 0, 3)]);
    const target = idx(2, 2, 3);
    state.board[target].open = true;
    expect(cycleMark(state, target).status).toBe('ignored');
    expect(state.board[target].mark).toBe(MARK.NONE);
  });

  it('只有红旗计入计数，问号不计入', () => {
    const state = makeState(3, 3, [idx(0, 0, 3)]);
    cycleMark(state, 4);
    expect(countFlags(state.board)).toBe(1);
    cycleMark(state, 4);
    expect(countFlags(state.board)).toBe(0);
    expect(countQuestions(state.board)).toBe(1);
    cycleMark(state, 4);
    expect(countQuestions(state.board)).toBe(0);
  });

  it('可以在多格上分别标记', () => {
    const state = makeState(4, 4, [idx(0, 0, 4)]);
    cycleMark(state, 5);
    cycleMark(state, 6);
    cycleMark(state, 7);
    expect(snapshot(state).flags).toBe(3);
  });

  it('越界索引与非法输入被安全忽略', () => {
    const state = makeState(3, 3, []);
    expect(cycleMark(state, -1).status).toBe('ignored');
    expect(cycleMark(state, 100).status).toBe('ignored');
    expect(cycleMark(state, undefined).status).toBe('ignored');
  });

  it('地雷格同样可以正常插旗', () => {
    const mine = idx(1, 1, 3);
    const state = makeState(3, 3, [mine]);
    expect(cycleMark(state, mine).mark).toBe(MARK.FLAG);
    expect(countFlags(state.board)).toBe(1);
  });
});
