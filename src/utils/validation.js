/**
 * 自定义难度与持久化数据的校验工具。
 * 所有校验失败都返回 { ok:false, errors:{field:message} }，UI 负责展示。
 */
import { CUSTOM_LIMITS, maxMinesFor } from '../game/config.js';

function toInteger(value) {
  if (typeof value === 'number') return Number.isFinite(value) ? Math.trunc(value) : NaN;
  if (typeof value === 'string' && value.trim() !== '') {
    const parsed = Number(value.trim());
    return Number.isFinite(parsed) ? Math.trunc(parsed) : NaN;
  }
  return NaN;
}

/**
 * 校验自定义难度输入。
 * 规则：行列为正整数且在上下限内；地雷 ≥1；地雷必须小于总格子数（并尽量保留首次点击安全区）。
 * @returns {{ok:boolean, errors:Record<string,string>, value?:{rows:number,cols:number,mines:number}}}
 */
export function validateCustomConfig(input = {}) {
  const errors = {};
  const rows = toInteger(input.rows);
  const cols = toInteger(input.cols);
  const mines = toInteger(input.mines);

  if (!Number.isInteger(rows)) errors.rows = '行数必须是整数';
  else if (rows < CUSTOM_LIMITS.minRows || rows > CUSTOM_LIMITS.maxRows) {
    errors.rows = `行数必须在 ${CUSTOM_LIMITS.minRows} - ${CUSTOM_LIMITS.maxRows} 之间`;
  }

  if (!Number.isInteger(cols)) errors.cols = '列数必须是整数';
  else if (cols < CUSTOM_LIMITS.minCols || cols > CUSTOM_LIMITS.maxCols) {
    errors.cols = `列数必须在 ${CUSTOM_LIMITS.minCols} - ${CUSTOM_LIMITS.maxCols} 之间`;
  }

  if (!Number.isInteger(mines)) errors.mines = '地雷数必须是整数';
  else if (mines < CUSTOM_LIMITS.minMines) errors.mines = `地雷数不能少于 ${CUSTOM_LIMITS.minMines}`;

  if (!errors.rows && !errors.cols && Number.isInteger(mines)) {
    const limit = maxMinesFor(rows, cols);
    if (mines > limit) errors.mines = `地雷数不能超过 ${limit}（需为首次点击留出安全区）`;
  }

  if (Object.keys(errors).length > 0) return { ok: false, errors };
  return { ok: true, errors: {}, value: { rows, cols, mines } };
}

/** 判断一个值是否是可用于持久化的普通对象。 */
export function isPlainObject(value) {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/** 安全取整数，失败返回 fallback。 */
export function safeInt(value, fallback = 0) {
  const parsed = toInteger(value);
  return Number.isInteger(parsed) ? parsed : fallback;
}
