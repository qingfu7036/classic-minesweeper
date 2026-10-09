/**
 * 最佳成绩 + 历史统计。
 * 规则：
 *  - 只有通关才更新最佳成绩；失败局不计入。
 *  - 三种标准难度各自独立；自定义难度不参与标准排名（只有历史记录）。
 *  - 时间相同时保留首次达成的记录（严格小于才刷新）。
 */
import { STANDARD_DIFFICULTIES, STORAGE_KEYS } from '../game/config.js';
import { isPlainObject, safeInt } from '../utils/validation.js';

const HISTORY_LIMIT = 30;

function emptyStats() {
  return {
    played: 0,
    won: 0,
    lost: 0,
    byDifficulty: {
      beginner: { played: 0, won: 0, lost: 0 },
      intermediate: { played: 0, won: 0, lost: 0 },
      expert: { played: 0, won: 0, lost: 0 },
      custom: { played: 0, won: 0, lost: 0 },
    },
  };
}

function emptyBest() {
  const best = {};
  for (const id of STANDARD_DIFFICULTIES) best[id] = null;
  return best;
}

function sanitizeBest(raw) {
  const best = emptyBest();
  if (!isPlainObject(raw)) return best;
  for (const id of STANDARD_DIFFICULTIES) {
    const entry = raw[id];
    if (!isPlainObject(entry)) continue;
    const timeMs = safeInt(entry.timeMs, -1);
    if (timeMs < 0) continue;
    best[id] = { timeMs, at: safeInt(entry.at, 0), moves: safeInt(entry.moves, 0) };
  }
  return best;
}

function sanitizeStats(raw) {
  const stats = emptyStats();
  if (!isPlainObject(raw)) return stats;
  stats.played = Math.max(0, safeInt(raw.played, 0));
  stats.won = Math.max(0, safeInt(raw.won, 0));
  stats.lost = Math.max(0, safeInt(raw.lost, 0));
  const by = isPlainObject(raw.byDifficulty) ? raw.byDifficulty : {};
  for (const key of Object.keys(stats.byDifficulty)) {
    const entry = isPlainObject(by[key]) ? by[key] : {};
    stats.byDifficulty[key] = {
      played: Math.max(0, safeInt(entry.played, 0)),
      won: Math.max(0, safeInt(entry.won, 0)),
      lost: Math.max(0, safeInt(entry.lost, 0)),
    };
  }
  return stats;
}

function sanitizeHistory(raw) {
  if (!Array.isArray(raw)) return [];
  return raw
    .filter((item) => isPlainObject(item) && (item.result === 'win' || item.result === 'loss'))
    .slice(0, HISTORY_LIMIT)
    .map((item) => ({
      at: safeInt(item.at, 0),
      difficultyId: String(item.difficultyId ?? 'custom'),
      label: String(item.label ?? ''),
      custom: item.custom === true,
      rows: safeInt(item.rows, 0),
      cols: safeInt(item.cols, 0),
      mines: safeInt(item.mines, 0),
      result: item.result,
      timeMs: Math.max(0, safeInt(item.timeMs, 0)),
    }));
}

export function createRecordsService({ storage, historyLimit = HISTORY_LIMIT } = {}) {
  const raw = storage.read(STORAGE_KEYS.records, null);
  let data = {
    best: sanitizeBest(isPlainObject(raw) ? raw.best : null),
    stats: sanitizeStats(isPlainObject(raw) ? raw.stats : null),
    history: sanitizeHistory(isPlainObject(raw) ? raw.history : null),
  };

  function persist() {
    storage.write(STORAGE_KEYS.records, data);
  }

  /** 记录一局结束。返回是否刷新了最佳成绩。 */
  function recordGame(result) {
    const difficultyId = result.custom ? 'custom' : String(result.difficultyId);
    const won = result.result === 'win';

    data.stats.played += 1;
    if (won) data.stats.won += 1;
    else data.stats.lost += 1;
    const bucket = data.stats.byDifficulty[difficultyId] ?? { played: 0, won: 0, lost: 0 };
    bucket.played += 1;
    if (won) bucket.won += 1;
    else bucket.lost += 1;
    data.stats.byDifficulty[difficultyId] = bucket;

    const entry = {
      at: safeInt(result.finishedAt, Date.now()),
      difficultyId,
      label: result.label ?? difficultyId,
      custom: Boolean(result.custom),
      rows: result.rows,
      cols: result.cols,
      mines: result.mines,
      result: result.result,
      timeMs: Math.max(0, safeInt(result.elapsedMs, 0)),
    };
    data.history.unshift(entry);
    if (data.history.length > historyLimit) data.history.length = historyLimit;

    let bestUpdated = false;
    if (won && !result.custom && STANDARD_DIFFICULTIES.includes(difficultyId)) {
      const previous = data.best[difficultyId];
      if (!previous || entry.timeMs < previous.timeMs) {
        data.best[difficultyId] = { timeMs: entry.timeMs, at: entry.at, moves: safeInt(result.moves, 0) };
        bestUpdated = true;
      }
    }

    persist();
    return { bestUpdated, entry, best: data.best[difficultyId] ?? null };
  }

  return {
    recordGame,
    getBest(difficultyId) {
      return data.best[difficultyId] ?? null;
    },
    getBests() {
      return { ...data.best };
    },
    getStats() {
      return {
        ...data.stats,
        byDifficulty: Object.fromEntries(
          Object.entries(data.stats.byDifficulty).map(([k, v]) => [k, { ...v }]),
        ),
      };
    },
    getHistory() {
      return data.history.map((item) => ({ ...item }));
    },
    clearHistory() {
      data.history = [];
      persist();
    },
    /** 清空成绩与统计（用于设置菜单的“重置记录”）。 */
    reset() {
      data = { best: emptyBest(), stats: emptyStats(), history: [] };
      persist();
      return data;
    },
  };
}
