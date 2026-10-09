/**
 * 旗帜与问号标记循环。
 * 未标记 → 红旗 → 问号 → 未标记。
 */
import { MARK } from './config.js';

/** 标记循环顺序。关闭问号功能时退化为 未标记 ↔ 红旗（经典设置项）。 */
export function markCycle(allowQuestion = true) {
  return allowQuestion ? [MARK.NONE, MARK.FLAG, MARK.QUESTION] : [MARK.NONE, MARK.FLAG];
}

/**
 * 循环切换某个格子的标记状态。
 * 已打开的格子不允许插旗或加问号。
 * @returns {{status:'ignored'|'changed', index?:number, mark?:string, flagDelta?:number}}
 */
export function cycleMark(state, index, { allowQuestion = true } = {}) {
  const { board } = state;
  if (!Number.isInteger(index) || index < 0 || index >= board.length) return { status: 'ignored' };
  const cell = board[index];
  if (cell.open) return { status: 'ignored' };

  const order = markCycle(allowQuestion);
  const current = order.indexOf(cell.mark);
  const next = order[(current + 1) % order.length];
  const wasFlag = cell.mark === MARK.FLAG;
  const isFlag = next === MARK.FLAG;
  cell.mark = next;

  return {
    status: 'changed',
    index,
    mark: next,
    flagDelta: (isFlag ? 1 : 0) - (wasFlag ? 1 : 0),
  };
}

/** 统计棋盘上红旗数量（只有红旗计入剩余地雷计数）。 */
export function countFlags(board) {
  let count = 0;
  for (const cell of board) if (cell.mark === MARK.FLAG) count += 1;
  return count;
}

/** 统计问号数量（统计展示用）。 */
export function countQuestions(board) {
  let count = 0;
  for (const cell of board) if (cell.mark === MARK.QUESTION) count += 1;
  return count;
}
