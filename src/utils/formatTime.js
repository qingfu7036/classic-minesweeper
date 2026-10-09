/**
 * 数字与格式工具。
 */

/** 把毫秒格式化成经典三位计数器用法（秒，向下取整，封顶 999）。 */
export function formatElapsedSeconds(elapsedMs, max = 999) {
  if (!Number.isFinite(elapsedMs) || elapsedMs <= 0) return 0;
  return Math.min(max, Math.floor(elapsedMs / 1000));
}

/** 毫秒 → `12.34 秒` / `1 分 05.20 秒` 之类的人类可读文本（用于成绩与历史）。 */
export function formatDuration(elapsedMs) {
  if (!Number.isFinite(elapsedMs) || elapsedMs < 0) return '—';
  const totalSeconds = elapsedMs / 1000;
  if (totalSeconds < 60) return `${totalSeconds.toFixed(2)} 秒`;
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds - minutes * 60;
  return `${minutes} 分 ${seconds.toFixed(2).padStart(5, '0')} 秒`;
}

/** 计数器（剩余地雷）显示值：地雷数 - 红旗数，允许为负。 */
export function mineCounterValue(mineCount, flagCount) {
  return mineCount - flagCount;
}

/** 把数字限制在闭区间内。 */
export function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}
