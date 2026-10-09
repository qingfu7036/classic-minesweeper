/**
 * D. 成就系统测试
 */
import { describe, expect, it } from 'vitest';
import { ACHIEVEMENTS, createAchievementService, evaluateUnlocks } from '../src/services/achievementService.js';
import { createStorageService, createMemoryStorage } from '../src/services/storageService.js';
import { createGameEngine, GAME_EVENT } from '../src/game/gameEngine.js';
import { createPrng } from '../src/game/boardGenerator.js';
import { createClock } from './helpers.js';

function createService() {
  const backing = createMemoryStorage();
  return { service: createAchievementService({ storage: createStorageService({ storage: backing }), clock: () => 555 }), backing };
}

function result(overrides = {}) {
  return {
    result: 'win',
    difficultyId: 'beginner',
    label: '初级',
    custom: false,
    rows: 9,
    cols: 9,
    mines: 10,
    elapsedMs: 30_000,
    misflags: 0,
    moves: 40,
    finishedAt: 1,
    ...overrides,
  };
}

describe('成就定义', () => {
  it('包含任务书要求的 9 个成就，且 id 唯一、描述完整', () => {
    const required = [
      'first_win',
      'win_beginner',
      'win_intermediate',
      'win_expert',
      'speed_beginner',
      'perfect_flags',
      'streak_3',
      'veteran_20',
      'custom_win',
    ];
    const ids = ACHIEVEMENTS.map((item) => item.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const id of required) expect(ids).toContain(id);
    for (const item of ACHIEVEMENTS) {
      expect(item.name.length).toBeGreaterThan(0);
      expect(item.description.length).toBeGreaterThan(0);
    }
  });

  it('初始全部未解锁', () => {
    const { service } = createService();
    expect(service.list().every((item) => !item.unlocked)).toBe(true);
    expect(service.unlockedCount()).toBe(0);
    expect(service.total).toBe(9);
  });
});

describe('解锁条件', () => {
  it('初次胜利', () => {
    const { service } = createService();
    const outcome = service.handleGameFinished(result());
    expect(outcome.unlocked.map((item) => item.id)).toContain('first_win');
  });

  it('三种标准难度分别解锁', () => {
    const { service } = createService();
    service.handleGameFinished(result({ difficultyId: 'intermediate', label: '中级' }));
    let unlocked = service.list().filter((item) => item.unlocked).map((item) => item.id);
    expect(unlocked).toContain('win_intermediate');
    expect(unlocked).not.toContain('win_beginner');

    service.handleGameFinished(result({ difficultyId: 'expert', label: '高级' }));
    unlocked = service.list().filter((item) => item.unlocked).map((item) => item.id);
    expect(unlocked).toContain('win_expert');
  });

  it('速度挑战：初级 10 秒内获胜（含边界 10 秒）', () => {
    const { service } = createService();
    service.handleGameFinished(result({ elapsedMs: 10_000 }));
    expect(service.list().find((item) => item.id === 'speed_beginner').unlocked).toBe(true);

    const { service: slower } = createService();
    slower.handleGameFinished(result({ elapsedMs: 10_001 }));
    expect(slower.list().find((item) => item.id === 'speed_beginner').unlocked).toBe(false);
  });

  it('速度挑战不因中级/自定义的快速通关而解锁', () => {
    const { service } = createService();
    service.handleGameFinished(result({ difficultyId: 'intermediate', label: '中级', elapsedMs: 4_000 }));
    service.handleGameFinished(result({ custom: true, difficultyId: 'custom', elapsedMs: 2_000 }));
    expect(service.list().find((item) => item.id === 'speed_beginner').unlocked).toBe(false);
  });

  it('完美标记：全程没有错误插旗才解锁', () => {
    const { service } = createService();
    service.handleGameFinished(result({ misflags: 1 }));
    expect(service.list().find((item) => item.id === 'perfect_flags').unlocked).toBe(false);

    const { service: perfect } = createService();
    perfect.handleGameFinished(result({ misflags: 0 }));
    expect(perfect.list().find((item) => item.id === 'perfect_flags').unlocked).toBe(true);
  });

  it('连胜挑战：连续 3 局胜利才解锁，失败会重置', () => {
    const { service } = createService();
    service.handleGameFinished(result());
    service.handleGameFinished(result());
    expect(service.list().find((item) => item.id === 'streak_3').unlocked).toBe(false);
    service.handleGameFinished(result());
    expect(service.list().find((item) => item.id === 'streak_3').unlocked).toBe(true);

    const { service: reset } = createService();
    reset.handleGameFinished(result());
    reset.handleGameFinished(result());
    reset.handleGameFinished(result({ result: 'loss' }));
    expect(reset.progress().winStreak).toBe(0);
    reset.handleGameFinished(result());
    reset.handleGameFinished(result());
    expect(reset.list().find((item) => item.id === 'streak_3').unlocked).toBe(false);
  });

  it('扫雷老手：累计完成 20 局（胜或负都算）', () => {
    const { service } = createService();
    for (let i = 0; i < 19; i += 1) service.handleGameFinished(result({ result: 'loss' }));
    expect(service.list().find((item) => item.id === 'veteran_20').unlocked).toBe(false);
    service.handleGameFinished(result({ result: 'loss' }));
    expect(service.list().find((item) => item.id === 'veteran_20').unlocked).toBe(true);
    expect(service.progress().games).toBe(20);
  });

  it('失败局不会解锁「初次胜利」', () => {
    const { service } = createService();
    service.handleGameFinished(result({ result: 'loss' }));
    expect(service.list().find((item) => item.id === 'first_win').unlocked).toBe(false);
    expect(service.progress().wins).toBe(0);
  });

  it('标准难度通关不会解锁「自定义挑战」，自定义通关也不会解锁标准难度成就', () => {
    const { service } = createService();
    service.handleGameFinished(result({ difficultyId: 'beginner', custom: false }));
    expect(service.list().find((item) => item.id === 'custom_win').unlocked).toBe(false);

    const { service: customOnly } = createService();
    customOnly.handleGameFinished(result({ difficultyId: 'custom', custom: true }));
    expect(customOnly.list().find((item) => item.id === 'custom_win').unlocked).toBe(true);
    expect(customOnly.list().find((item) => item.id === 'win_beginner').unlocked).toBe(false);
    expect(customOnly.list().find((item) => item.id === 'speed_beginner').unlocked).toBe(false);
  });

  it('解锁后的成就不会因为再次满足条件而重复解锁或刷新时间', () => {
    let tick = 1_000;
    const { service } = createService({ clock: () => tick });
    service.handleGameFinished(result());
    const firstTime = service.list().find((item) => item.id === 'first_win').unlockedAt;
    expect(firstTime).toBeTruthy();

    tick = 9_999;
    service.handleGameFinished(result());
    expect(service.list().find((item) => item.id === 'first_win').unlockedAt).toBe(firstTime);
    // 解锁数量与标记为已解锁的条目数一致（不存在重复解锁）
    expect(service.unlockedCount()).toBe(service.list().filter((item) => item.unlocked).length);
  });

  it('自定义挑战：通关自定义难度解锁，且不影响标准难度成就', () => {
    const { service } = createService();
    service.handleGameFinished(result({ custom: true, difficultyId: 'custom', label: '自定义', rows: 5, cols: 5, mines: 3 }));
    const unlocked = service.list().filter((item) => item.unlocked).map((item) => item.id);
    expect(unlocked).toContain('custom_win');
    expect(unlocked).toContain('first_win');
    expect(unlocked).not.toContain('win_beginner');
  });
});

describe('解锁唯一性与持久化', () => {
  it('同一个成就只会解锁一次，解锁时间不会变化', () => {
    const backing = createMemoryStorage();
    let tick = 1000;
    const service = createAchievementService({
      storage: createStorageService({ storage: backing }),
      clock: () => (tick += 1000),
    });
    const first = service.handleGameFinished(result());
    expect(first.unlocked.length).toBeGreaterThan(0);
    const second = service.handleGameFinished(result());
    expect(second.unlocked).toHaveLength(0);
    const entry = service.list().find((item) => item.id === 'first_win');
    expect(entry.unlockedAt).toBe(1000 + 1000);
  });

  it('重建 service 后解锁状态与进度仍然存在', () => {
    const backing = createMemoryStorage();
    const first = createAchievementService({ storage: createStorageService({ storage: backing }) });
    first.handleGameFinished(result({ difficultyId: 'expert', label: '高级', elapsedMs: 90_000 }));

    const second = createAchievementService({ storage: createStorageService({ storage: backing }) });
    expect(second.list().find((item) => item.id === 'win_expert').unlocked).toBe(true);
    expect(second.progress().games).toBe(1);
  });

  it('存储损坏时回退为空进度', () => {
    const backing = createMemoryStorage();
    backing.setItem('classic-minesweeper:achievements', 'not json at all');
    const service = createAchievementService({ storage: createStorageService({ storage: backing }) });
    expect(service.unlockedCount()).toBe(0);
    expect(service.progress().games).toBe(0);
  });

  it('reset 清空解锁与进度', () => {
    const { service } = createService();
    service.handleGameFinished(result());
    service.reset();
    expect(service.unlockedCount()).toBe(0);
    expect(service.progress().games).toBe(0);
  });
});

describe('与引擎联动', () => {
  it('重开不计入完成局数（只有胜负才触发 finished）', () => {
    const { service } = createService();
    const clock = createClock();
    const engine = createGameEngine({ now: clock.now, rng: createPrng(9) });
    const finished = [];
    engine.subscribe((event) => {
      if (event.type === GAME_EVENT.FINISHED) {
        finished.push(event.payload);
        service.handleGameFinished(event.payload);
      }
    });

    engine.newGame('beginner');
    engine.newGame('beginner');
    engine.reset();
    expect(finished).toHaveLength(0);
    expect(service.progress().games).toBe(0);

    // 真实打完一局（踩雷失败）
    engine.open(0);
    const mineIndex = engine.state.board.findIndex((cell) => cell.mine);
    engine.open(mineIndex);
    expect(finished).toHaveLength(1);
    expect(service.progress().games).toBe(1);
    expect(service.progress().losses).toBe(1);
  });
});

describe('evaluateUnlocks', () => {
  it('是纯函数：不修改传入的进度对象', () => {
    const progress = { games: 3, wins: 3, losses: 0, winStreak: 3, bestStreak: 3, customWins: 0, standardWins: {} };
    const copy = JSON.parse(JSON.stringify(progress));
    const unlocked = evaluateUnlocks({ result: result(), progress });
    expect(unlocked).toContain('streak_3');
    expect(progress).toEqual(copy);
  });
});
