/**
 * 全局配置常量。
 * 这里的数值是游戏规则与界面的唯一事实来源，UI 与逻辑都必须从这里读取。
 */

/** 本地持久化数据结构版本号，结构变化时递增以便迁移/丢弃旧数据。 */
export const DATA_VERSION = 1;

/** 单局游戏状态机。 */
export const GAME_STATUS = {
  /** 新局已创建，地雷尚未生成（延迟初始化）。 */
  READY: 'ready',
  /** 首次开格后，计时开始。 */
  PLAYING: 'playing',
  /** 胜利，棋盘锁定。 */
  WON: 'won',
  /** 失败，棋盘锁定。 */
  LOST: 'lost',
};

/** 格子标记状态。只有 FLAG 计入剩余地雷计数。 */
export const MARK = {
  NONE: 'none',
  FLAG: 'flag',
  QUESTION: 'question',
};

/** 三种标准难度。 */
export const DIFFICULTIES = {
  beginner: { id: 'beginner', label: '初级', cols: 9, rows: 9, mines: 10, custom: false },
  intermediate: { id: 'intermediate', label: '中级', cols: 16, rows: 16, mines: 40, custom: false },
  expert: { id: 'expert', label: '高级', cols: 30, rows: 16, mines: 99, custom: false },
};

/** 标准难度顺序（菜单顺序、成绩排序都依赖它）。 */
export const STANDARD_DIFFICULTIES = ['beginner', 'intermediate', 'expert'];

export const DEFAULT_DIFFICULTY = 'beginner';

/** 自定义难度输入范围：防止创建超大棋盘导致页面卡死。 */
export const CUSTOM_LIMITS = {
  minCols: 5,
  maxCols: 60,
  minRows: 5,
  maxRows: 40,
  minMines: 1,
};

/** 计时器显示上限（经典三位计数器）。 */
export const TIMER_MAX_SECONDS = 999;

/** 计数器显示上限与下限。 */
export const COUNTER_MAX = 999;
export const COUNTER_MIN = -99;

/** 首次点击安全区要求：9 宫格（自身 + 8 邻格）不能有雷。 */
export const FIRST_CLICK_SAFE_ZONE = 9;

/** 默认界面缩放档位。 */
export const UI_SCALES = [1, 1.25, 1.5];

/** 本地存储键名。 */
export const STORAGE_KEYS = {
  settings: 'settings',
  records: 'records',
  achievements: 'achievements',
  session: 'session',
};

/** 获取标准难度配置，未知 id 回退到初级。 */
export function getDifficulty(id) {
  return DIFFICULTIES[id] ?? DIFFICULTIES[DEFAULT_DIFFICULTY];
}

/** 棋盘总格数允许的最大雷数：至少留 1 格空（并在可能时保留 9 宫格安全区）。 */
export function maxMinesFor(rows, cols) {
  const total = rows * cols;
  // 极小棋盘（1 格）合法雷数为 0：让配置层直接拒绝，而不是留到布雷时才报错
  if (total <= FIRST_CLICK_SAFE_ZONE) return Math.max(0, total - 1);
  return total - FIRST_CLICK_SAFE_ZONE;
}

/** 由配置对象生成用于展示与统计的难度标识。 */
export function describeConfig(config) {
  const custom = Boolean(config.custom);
  return {
    id: custom ? 'custom' : config.id,
    label: custom ? '自定义' : config.label,
    custom,
    rows: config.rows,
    cols: config.cols,
    mines: config.mines,
  };
}
