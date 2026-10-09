/**
 * 校验工具与格式化工具测试
 */
import { describe, expect, it } from 'vitest';
import { isPlainObject, safeInt, validateCustomConfig } from '../src/utils/validation.js';
import { clamp, formatDuration, formatElapsedSeconds, mineCounterValue } from '../src/utils/formatTime.js';
import { CUSTOM_LIMITS, DIFFICULTIES, STANDARD_DIFFICULTIES, describeConfig, getDifficulty, maxMinesFor } from '../src/game/config.js';

describe('validateCustomConfig', () => {
  it('接受合法输入并把字符串转成整数', () => {
    const result = validateCustomConfig({ rows: '12', cols: '20', mines: '30' });
    expect(result.ok).toBe(true);
    expect(result.value).toEqual({ rows: 12, cols: 20, mines: 30 });
  });

  it('行列为 0、负数或非整数时拒绝', () => {
    expect(validateCustomConfig({ rows: 0, cols: 9, mines: 5 }).errors.rows).toBeTruthy();
    expect(validateCustomConfig({ rows: -3, cols: 9, mines: 5 }).errors.rows).toBeTruthy();
    expect(validateCustomConfig({ rows: 2.5, cols: 9, mines: 5 }).errors.rows).toBeTruthy();
    expect(validateCustomConfig({ rows: 9, cols: 0, mines: 5 }).errors.cols).toBeTruthy();
    expect(validateCustomConfig({ rows: 9, cols: 'abc', mines: 5 }).errors.cols).toBeTruthy();
    expect(validateCustomConfig({ rows: null, cols: null, mines: null }).ok).toBe(false);
  });

  it('超出上下限时拒绝，避免创建超大棋盘', () => {
    expect(validateCustomConfig({ rows: CUSTOM_LIMITS.maxRows + 1, cols: 10, mines: 5 }).errors.rows).toBeTruthy();
    expect(validateCustomConfig({ rows: 10, cols: CUSTOM_LIMITS.maxCols + 1, mines: 5 }).errors.cols).toBeTruthy();
    expect(validateCustomConfig({ rows: CUSTOM_LIMITS.minRows - 1, cols: 10, mines: 5 }).errors.rows).toBeTruthy();
  });

  it('地雷数必须 ≥1 且小于总格子数', () => {
    expect(validateCustomConfig({ rows: 9, cols: 9, mines: 0 }).errors.mines).toBeTruthy();
    expect(validateCustomConfig({ rows: 9, cols: 9, mines: 81 }).errors.mines).toBeTruthy();
    expect(validateCustomConfig({ rows: 9, cols: 9, mines: 80 }).errors.mines).toBeTruthy();
    // 81 - 9 = 72 是上限（保留首次点击安全区）
    expect(validateCustomConfig({ rows: 9, cols: 9, mines: 72 }).ok).toBe(true);
  });

  it('错误信息是中文可读文本', () => {
    const result = validateCustomConfig({ rows: 2, cols: 2, mines: 0 });
    expect(result.errors.rows).toContain('行数');
    expect(result.errors.cols).toContain('列数');
    expect(result.errors.mines).toContain('地雷数');
  });
});

describe('数据类型工具', () => {
  it('isPlainObject 只接受普通对象', () => {
    expect(isPlainObject({})).toBe(true);
    expect(isPlainObject([])).toBe(false);
    expect(isPlainObject(null)).toBe(false);
    expect(isPlainObject('x')).toBe(false);
  });

  it('safeInt 回退到默认值', () => {
    expect(safeInt('42', 0)).toBe(42);
    expect(safeInt('abc', 7)).toBe(7);
    expect(safeInt(undefined, 3)).toBe(3);
    expect(safeInt(4.9, 0)).toBe(4);
  });
});

describe('格式化工具', () => {
  it('formatDuration 输出可读时长', () => {
    expect(formatDuration(5_500)).toBe('5.50 秒');
    expect(formatDuration(65_200)).toBe('1 分 05.20 秒');
    expect(formatDuration(-1)).toBe('—');
    expect(formatDuration(Number.NaN)).toBe('—');
  });

  it('formatElapsedSeconds 用于三位计数器', () => {
    expect(formatElapsedSeconds(999)).toBe(0);
    expect(formatElapsedSeconds(1_500)).toBe(1);
    expect(formatElapsedSeconds(2_000_000)).toBe(999);
  });

  it('mineCounterValue 允许负数', () => {
    expect(mineCounterValue(10, 3)).toBe(7);
    expect(mineCounterValue(10, 13)).toBe(-3);
  });

  it('clamp 限制区间', () => {
    expect(clamp(5, 0, 3)).toBe(3);
    expect(clamp(-5, 0, 3)).toBe(0);
    expect(clamp(2, 0, 3)).toBe(2);
  });
});

describe('难度配置', () => {
  it('三种标准难度的参数与规格一致', () => {
    expect(DIFFICULTIES.beginner).toMatchObject({ cols: 9, rows: 9, mines: 10 });
    expect(DIFFICULTIES.intermediate).toMatchObject({ cols: 16, rows: 16, mines: 40 });
    expect(DIFFICULTIES.expert).toMatchObject({ cols: 30, rows: 16, mines: 99 });
    expect(STANDARD_DIFFICULTIES).toEqual(['beginner', 'intermediate', 'expert']);
  });

  it('未知难度回退到初级', () => {
    expect(getDifficulty('nope').id).toBe('beginner');
    expect(getDifficulty('expert').id).toBe('expert');
  });

  it('describeConfig 区分标准与自定义', () => {
    expect(describeConfig({ id: 'beginner', label: '初级', custom: false, rows: 9, cols: 9, mines: 10 })).toMatchObject({
      id: 'beginner',
      custom: false,
    });
    expect(describeConfig({ id: 'custom', label: '自定义', custom: true, rows: 8, cols: 8, mines: 5 })).toMatchObject({
      id: 'custom',
      custom: true,
      label: '自定义',
    });
  });

  it('maxMinesFor 为所有标准难度留出合法区间', () => {
    for (const key of STANDARD_DIFFICULTIES) {
      const def = DIFFICULTIES[key];
      expect(maxMinesFor(def.rows, def.cols)).toBeGreaterThan(def.mines);
    }
  });
});
