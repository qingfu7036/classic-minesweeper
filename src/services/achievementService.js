/**
 * 成就系统：条件判断与解锁完全由游戏事件驱动，与展示 UI 解耦。
 *
 * 判定规则（必须与 UI 文案一致）：
 *  - 「完成一局」= 一局游戏到达胜利或失败；中途点笑脸/新游戏重开不计入。
 *  - 「连续胜利」= 胜利 +1，失败归零，重开不改变连胜数。
 *  - 同一成就只会解锁一次，解锁时间随成就一起持久化。
 */
import { STORAGE_KEYS } from '../game/config.js';
import { isPlainObject, safeInt } from '../utils/validation.js';

export const ACHIEVEMENTS = Object.freeze([
  { id: 'first_win', name: '初次胜利', description: '首次成功通关任意难度。' },
  { id: 'win_beginner', name: '初级通关', description: '完成初级难度（9×9，10 颗雷）。' },
  { id: 'win_intermediate', name: '中级通关', description: '完成中级难度（16×16，40 颗雷）。' },
  { id: 'win_expert', name: '高级通关', description: '完成高级难度（30×16，99 颗雷）。' },
  { id: 'speed_beginner', name: '速度挑战', description: '在初级模式下 10 秒内获胜。' },
  { id: 'perfect_flags', name: '完美标记', description: '通关时全程没有一次错误插旗。' },
  { id: 'streak_3', name: '连胜挑战', description: '连续赢下 3 局（失败会重置连胜）。' },
  { id: 'veteran_20', name: '扫雷老手', description: '累计完成 20 局游戏（胜或负）。' },
  { id: 'custom_win', name: '自定义挑战', description: '成功通关一局自定义难度。' },
]);

const SPEED_BEGINNER_MS = 10_000;

/** 解锁条件：只依赖当前这一局的结果与累计进度。 */
const CONDITIONS = {
  first_win: ({ progress }) => progress.wins >= 1,
  win_beginner: ({ result }) => isStandardWin(result, 'beginner'),
  win_intermediate: ({ result }) => isStandardWin(result, 'intermediate'),
  win_expert: ({ result }) => isStandardWin(result, 'expert'),
  speed_beginner: ({ result }) => isStandardWin(result, 'beginner') && result.elapsedMs <= SPEED_BEGINNER_MS,
  perfect_flags: ({ result }) => result.result === 'win' && safeInt(result.misflags, 0) === 0,
  streak_3: ({ progress }) => progress.winStreak >= 3,
  veteran_20: ({ progress }) => progress.games >= 20,
  custom_win: ({ result }) => result.result === 'win' && result.custom === true,
};

function isStandardWin(result, id) {
  return result.result === 'win' && !result.custom && result.difficultyId === id;
}

function emptyProgress() {
  return {
    games: 0,
    wins: 0,
    losses: 0,
    winStreak: 0,
    bestStreak: 0,
    customWins: 0,
    standardWins: { beginner: 0, intermediate: 0, expert: 0 },
  };
}

function sanitize(raw) {
  const unlocked = {};
  const progress = emptyProgress();
  if (!isPlainObject(raw)) return { unlocked, progress };

  if (isPlainObject(raw.unlocked)) {
    for (const def of ACHIEVEMENTS) {
      const entry = raw.unlocked[def.id];
      if (!isPlainObject(entry)) continue;
      unlocked[def.id] = { at: safeInt(entry.at, 0) };
    }
  }
  if (isPlainObject(raw.progress)) {
    const p = raw.progress;
    progress.games = Math.max(0, safeInt(p.games, 0));
    progress.wins = Math.max(0, safeInt(p.wins, 0));
    progress.losses = Math.max(0, safeInt(p.losses, 0));
    progress.winStreak = Math.max(0, safeInt(p.winStreak, 0));
    progress.bestStreak = Math.max(progress.winStreak, safeInt(p.bestStreak, 0));
    progress.customWins = Math.max(0, safeInt(p.customWins, 0));
    if (isPlainObject(p.standardWins)) {
      for (const id of Object.keys(progress.standardWins)) {
        progress.standardWins[id] = Math.max(0, safeInt(p.standardWins[id], 0));
      }
    }
  }
  return { unlocked, progress };
}

/** 根据当前进度计算应当解锁的成就 id（纯函数，便于测试）。 */
export function evaluateUnlocks({ result, progress }) {
  const unlocked = [];
  for (const def of ACHIEVEMENTS) {
    const condition = CONDITIONS[def.id];
    if (typeof condition !== 'function') continue;
    try {
      if (condition({ result, progress })) unlocked.push(def.id);
    } catch {
      // 条件异常视为不满足，不能影响游戏
    }
  }
  return unlocked;
}

/**
 * @param {object} options
 * @param {ReturnType<import('./storageService.js').createStorageService>} options.storage
 * @param {() => number} [options.clock]
 */
export function createAchievementService({ storage, clock = () => Date.now() } = {}) {
  let state = sanitize(storage.read(STORAGE_KEYS.achievements, null));

  function persist() {
    storage.write(STORAGE_KEYS.achievements, state);
  }

  /** 记录一局结束（只应由引擎的 finished 事件调用）。 */
  function handleGameFinished(result) {
    const won = result.result === 'win';
    const progress = state.progress;

    progress.games += 1;
    if (won) {
      progress.wins += 1;
      progress.winStreak += 1;
      progress.bestStreak = Math.max(progress.bestStreak, progress.winStreak);
      if (result.custom) progress.customWins += 1;
      else if (progress.standardWins[result.difficultyId] !== undefined) {
        progress.standardWins[result.difficultyId] += 1;
      }
    } else {
      progress.losses += 1;
      progress.winStreak = 0;
    }

    const candidates = evaluateUnlocks({ result, progress });
    const unlockedNow = [];
    const at = clock();
    for (const id of candidates) {
      if (state.unlocked[id]) continue;
      state.unlocked[id] = { at };
      const def = ACHIEVEMENTS.find((item) => item.id === id);
      if (def) unlockedNow.push({ ...def, unlockedAt: at });
    }

    persist();
    return { unlocked: unlockedNow, progress: { ...progress } };
  }

  /** 把历史进度重新套用到所有成就上（用于修复数据/测试）。 */
  function reevaluate(progress) {
    return evaluateUnlocks({
      result: { result: 'win', custom: false, difficultyId: 'beginner', misflags: 0, elapsedMs: Number.POSITIVE_INFINITY },
      progress: { ...emptyProgress(), ...progress },
    });
  }

  return {
    handleGameFinished,
    reevaluate,
    list() {
      return ACHIEVEMENTS.map((def) => ({
        ...def,
        unlocked: Boolean(state.unlocked[def.id]),
        unlockedAt: state.unlocked[def.id]?.at ?? null,
      }));
    },
    unlockedCount() {
      return Object.keys(state.unlocked).length;
    },
    total: ACHIEVEMENTS.length,
    progress() {
      return { ...state.progress, standardWins: { ...state.progress.standardWins } };
    },
    reset() {
      state = { unlocked: {}, progress: emptyProgress() };
      persist();
      return state;
    },
  };
}
