/**
 * C. 最佳成绩与统计测试
 */
import { describe, expect, it } from 'vitest';
import { createStorageService, createMemoryStorage } from '../src/services/storageService.js';
import { createRecordsService } from '../src/services/recordsService.js';

function createRecords() {
  const backing = createMemoryStorage();
  const storage = createStorageService({ storage: backing });
  return { records: createRecordsService({ storage }), backing };
}

function winResult(overrides = {}) {
  return {
    result: 'win',
    difficultyId: 'beginner',
    label: '初级',
    custom: false,
    rows: 9,
    cols: 9,
    mines: 10,
    elapsedMs: 20_000,
    misflags: 0,
    moves: 30,
    finishedAt: 1_700_000_000_000,
    ...overrides,
  };
}

describe('最佳成绩', () => {
  it('只有获胜才更新最佳成绩', () => {
    const { records } = createRecords();
    records.recordGame(winResult({ result: 'loss', elapsedMs: 5_000 }));
    expect(records.getBest('beginner')).toBeNull();
    records.recordGame(winResult({ elapsedMs: 21_000 }));
    expect(records.getBest('beginner').timeMs).toBe(21_000);
  });

  it('更快的成绩会刷新纪录，更慢的不会', () => {
    const { records } = createRecords();
    records.recordGame(winResult({ elapsedMs: 30_000 }));
    expect(records.getBest('beginner').timeMs).toBe(30_000);
    records.recordGame(winResult({ elapsedMs: 45_000 }));
    expect(records.getBest('beginner').timeMs).toBe(30_000);
    records.recordGame(winResult({ elapsedMs: 12_000 }));
    expect(records.getBest('beginner').timeMs).toBe(12_000);
  });

  it('时间相同时保留首次达成的记录', () => {
    const { records } = createRecords();
    records.recordGame(winResult({ elapsedMs: 15_000, finishedAt: 111 }));
    records.recordGame(winResult({ elapsedMs: 15_000, finishedAt: 222 }));
    expect(records.getBest('beginner').at).toBe(111);
  });

  it('三种标准难度的最佳成绩互相独立', () => {
    const { records } = createRecords();
    records.recordGame(winResult({ difficultyId: 'beginner', label: '初级', elapsedMs: 9_000 }));
    records.recordGame(winResult({ difficultyId: 'expert', label: '高级', rows: 16, cols: 30, mines: 99, elapsedMs: 120_000 }));
    expect(records.getBest('beginner').timeMs).toBe(9_000);
    expect(records.getBest('expert').timeMs).toBe(120_000);
    expect(records.getBest('intermediate')).toBeNull();
  });

  it('自定义难度不参与标准难度排名，但会进入历史与统计', () => {
    const { records } = createRecords();
    records.recordGame(winResult({ custom: true, difficultyId: 'custom', label: '自定义', rows: 5, cols: 5, mines: 3, elapsedMs: 1_000 }));
    expect(records.getBest('beginner')).toBeNull();
    expect(records.getBest('custom')).toBeNull();
    expect(records.getHistory()).toHaveLength(1);
    expect(records.getHistory()[0].custom).toBe(true);
    expect(records.getStats().byDifficulty.custom.played).toBe(1);
    expect(records.getStats().byDifficulty.custom.won).toBe(1);
  });
});

describe('统计与历史', () => {
  it('胜负与各难度局数分别累计', () => {
    const { records } = createRecords();
    records.recordGame(winResult());
    records.recordGame(winResult({ result: 'loss' }));
    records.recordGame(winResult({ difficultyId: 'intermediate', label: '中级', result: 'loss' }));
    const stats = records.getStats();
    expect(stats.played).toBe(3);
    expect(stats.won).toBe(1);
    expect(stats.lost).toBe(2);
    expect(stats.byDifficulty.beginner).toMatchObject({ played: 2, won: 1, lost: 1 });
    expect(stats.byDifficulty.intermediate).toMatchObject({ played: 1, won: 0, lost: 1 });
  });

  it('历史记录按时间倒序保存，且可以清空', () => {
    const { records } = createRecords();
    records.recordGame(winResult({ finishedAt: 1 }));
    records.recordGame(winResult({ finishedAt: 2 }));
    expect(records.getHistory().map((item) => item.at)).toEqual([2, 1]);
    records.clearHistory();
    expect(records.getHistory()).toHaveLength(0);
  });

  it('reset 会清空成绩、统计与历史', () => {
    const { records } = createRecords();
    records.recordGame(winResult());
    records.reset();
    expect(records.getBest('beginner')).toBeNull();
    expect(records.getStats().played).toBe(0);
    expect(records.getHistory()).toHaveLength(0);
  });
});

describe('持久化', () => {
  it('重建 service 后成绩仍然存在（等价于刷新页面）', () => {
    const backing = createMemoryStorage();
    const first = createRecordsService({ storage: createStorageService({ storage: backing }) });
    first.recordGame(winResult({ elapsedMs: 8_888 }));
    first.recordGame(winResult({ result: 'loss' }));

    const second = createRecordsService({ storage: createStorageService({ storage: backing }) });
    expect(second.getBest('beginner').timeMs).toBe(8_888);
    expect(second.getStats()).toMatchObject({ played: 2, won: 1, lost: 1 });
    expect(second.getHistory()).toHaveLength(2);
  });

  it('存储内容损坏时回退到默认值而不抛错', () => {
    const backing = createMemoryStorage();
    backing.setItem('classic-minesweeper:records', '{ this is not json');
    const service = createRecordsService({ storage: createStorageService({ storage: backing }) });
    expect(service.getBest('beginner')).toBeNull();
    expect(service.getStats().played).toBe(0);
  });

  it('版本不符时丢弃旧数据', () => {
    const backing = createMemoryStorage();
    backing.setItem(
      'classic-minesweeper:records',
      JSON.stringify({ v: 999, data: { best: { beginner: { timeMs: 1 } } } }),
    );
    const service = createRecordsService({ storage: createStorageService({ storage: backing }) });
    expect(service.getBest('beginner')).toBeNull();
  });

  it('字段缺失或类型错误时逐项回退', () => {
    const backing = createMemoryStorage();
    backing.setItem(
      'classic-minesweeper:records',
      JSON.stringify({
        v: 1,
        data: {
          best: { beginner: { timeMs: 'abc' }, expert: { timeMs: 42 } },
          stats: { played: -5, byDifficulty: { beginner: { won: 'x' } } },
          history: 'nope',
        },
      }),
    );
    const service = createRecordsService({ storage: createStorageService({ storage: backing }) });
    expect(service.getBest('beginner')).toBeNull();
    expect(service.getBest('expert').timeMs).toBe(42);
    expect(service.getStats().played).toBe(0);
    expect(service.getHistory()).toEqual([]);
  });

  it('history 数组里的非对象脏项会被剔除', () => {
    const backing = createMemoryStorage();
    backing.setItem(
      'classic-minesweeper:records',
      JSON.stringify({
        v: 1,
        data: {
          history: [
            { result: 'win', at: 5, timeMs: 1000, label: '初级' },
            'junk',
            42,
            null,
            { result: 'weird' },
            { result: 'loss', timeMs: -5 },
          ],
        },
      }),
    );
    const service = createRecordsService({ storage: createStorageService({ storage: backing }) });
    const history = service.getHistory();
    expect(history).toHaveLength(2);
    expect(history.map((item) => item.result)).toEqual(['win', 'loss']);
    expect(history[1].timeMs).toBe(0);
  });

  it('历史记录最多保留 30 条，超出后丢弃最早的', () => {
    const { records } = createRecords();
    for (let i = 0; i < 35; i += 1) records.recordGame(winResult({ finishedAt: i + 1 }));
    const history = records.getHistory();
    expect(history).toHaveLength(30);
    expect(history[0].at).toBe(35);
    expect(history.at(-1).at).toBe(6);
  });
});
