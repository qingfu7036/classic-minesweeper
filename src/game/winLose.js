/**
 * 胜负判定与终局棋盘处理。
 * 判定只依赖棋盘状态，不依赖 UI 事件。
 */
import { MARK } from './config.js';
import { countFlags } from './marking.js';

/** 胜利条件：所有非地雷格都已打开。 */
export function isBoardCleared(state) {
  const { board } = state;
  for (const cell of board) {
    if (cell.mine) continue;
    if (!cell.open) return false;
  }
  return true;
}

/** 统计已打开的非地雷格数量（用于显示与回归测试）。 */
export function countOpenedSafeCells(board) {
  let count = 0;
  for (const cell of board) if (!cell.mine && cell.open) count += 1;
  return count;
}

/**
 * 失败处理：显示全部地雷、标记踩中的那颗雷、显示插错的旗。
 * @returns {{revealedMines:number[], wrongFlags:number[]}}
 */
export function applyLoss(state, explodedIndex = -1) {
  const { board } = state;
  const revealedMines = [];
  const wrongFlags = [];

  for (let i = 0; i < board.length; i += 1) {
    const cell = board[i];
    if (cell.mine) {
      // 正确插旗的雷保持旗子显示，不翻成地雷图标（与经典扫雷一致）
      if (cell.mark === MARK.FLAG) continue;
      if (!cell.open) {
        cell.open = true;
        revealedMines.push(i);
      }
      if (cell.mark === MARK.QUESTION) cell.mark = MARK.NONE;
      continue;
    }
    if (cell.mark === MARK.FLAG) {
      cell.wrong = true;
      wrongFlags.push(i);
    }
  }

  if (Number.isInteger(explodedIndex) && explodedIndex >= 0 && explodedIndex < board.length) {
    board[explodedIndex].exploded = true;
  }

  return { revealedMines, wrongFlags };
}

/**
 * 胜利处理：按经典规则把尚未标记的地雷自动插上红旗。
 * @returns {{autoFlagged:number[]}}
 */
export function applyWin(state) {
  const { board } = state;
  const autoFlagged = [];
  for (let i = 0; i < board.length; i += 1) {
    const cell = board[i];
    if (!cell.mine) continue;
    if (cell.mark !== MARK.FLAG) {
      cell.mark = MARK.FLAG;
      autoFlagged.push(i);
    }
  }
  return { autoFlagged };
}

/** 终局结果快照，供成绩与成就服务消费。 */
export function buildResult(state, { result, elapsedMs, finishedAt = Date.now() }) {
  const config = state.config;
  return {
    result, // 'win' | 'loss'
    difficultyId: config.custom ? 'custom' : config.id,
    label: config.label,
    custom: Boolean(config.custom),
    rows: config.rows,
    cols: config.cols,
    mines: config.mines,
    elapsedMs,
    misflags: state.misflags,
    flags: countFlags(state.board),
    moves: state.moves,
    finishedAt,
  };
}
