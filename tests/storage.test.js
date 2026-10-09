/**
 * 存储与设置服务测试
 */
import { describe, expect, it, vi } from 'vitest';
import { createMemoryStorage, createStorageService, resolveDefaultStorage } from '../src/services/storageService.js';
import { DEFAULT_SETTINGS, createSettingsService } from '../src/services/settingsService.js';

describe('storageService', () => {
  it('写入后可以读回，并带上版本号', () => {
    const backing = createMemoryStorage();
    const storage = createStorageService({ storage: backing });
    expect(storage.write('demo', { a: 1 })).toBe(true);
    expect(storage.read('demo', null)).toEqual({ a: 1 });
    expect(JSON.parse(backing.getItem('classic-minesweeper:demo')).v).toBe(1);
  });

  it('读取不存在的键返回默认值', () => {
    const storage = createStorageService({ storage: createMemoryStorage() });
    expect(storage.read('missing', 'fallback')).toBe('fallback');
  });

  it('JSON 损坏时返回默认值', () => {
    const backing = createMemoryStorage();
    backing.setItem('classic-minesweeper:broken', '</not json>');
    const storage = createStorageService({ storage: backing });
    expect(storage.read('broken', 'safe')).toBe('safe');
  });

  it('版本不匹配时返回默认值', () => {
    const backing = createMemoryStorage();
    backing.setItem('classic-minesweeper:old', JSON.stringify({ v: 0, data: { keep: true } }));
    const storage = createStorageService({ storage: backing });
    expect(storage.read('old', null)).toBeNull();
  });

  it('非对象数据不会被当作合法载荷', () => {
    const backing = createMemoryStorage();
    backing.setItem('classic-minesweeper:arr', JSON.stringify({ v: 1, data: [1, 2] }));
    const storage = createStorageService({ storage: backing });
    expect(storage.read('arr', 'fallback')).toEqual([1, 2]);
    backing.setItem('classic-minesweeper:num', JSON.stringify(42));
    expect(storage.read('num', 'fallback')).toBe('fallback');
  });

  it('存储抛错（配额/禁用）时写入返回 false 且读取安全回退', () => {
    const broken = {
      getItem: () => {
        throw new Error('blocked');
      },
      setItem: () => {
        throw new Error('quota');
      },
      removeItem: () => {
        throw new Error('blocked');
      },
    };
    const storage = createStorageService({ storage: broken });
    expect(storage.read('any', 'safe')).toBe('safe');
    expect(storage.write('any', { a: 1 })).toBe(false);
    expect(storage.remove('any')).toBe(false);
  });

  it('未注入 storage 时自动探测环境', () => {
    const storage = createStorageService();
    // node 环境下没有 localStorage，应当退化到内存并标记为非持久化
    expect(typeof storage.isPersistent).toBe('boolean');
    expect(storage.write('x', { ok: true })).toBe(true);
    expect(storage.read('x', null)).toEqual({ ok: true });
  });

  it('resolveDefaultStorage 在无 localStorage 时返回 null', () => {
    expect(resolveDefaultStorage()).toBeNull();
  });
});

describe('settingsService', () => {
  it('默认值符合预期', () => {
    const settings = createSettingsService({ storage: createStorageService({ storage: createMemoryStorage() }) });
    expect(settings.get()).toEqual(DEFAULT_SETTINGS);
  });

  it('设置会被持久化并在重建后保留', () => {
    const backing = createMemoryStorage();
    const first = createSettingsService({ storage: createStorageService({ storage: backing }) });
    first.set({ soundEnabled: false, reducedMotion: true, uiScale: 1.25 });
    const second = createSettingsService({ storage: createStorageService({ storage: backing }) });
    expect(second.get()).toMatchObject({ soundEnabled: false, reducedMotion: true, uiScale: 1.25 });
  });

  it('toggle 切换布尔项', () => {
    const settings = createSettingsService({ storage: createStorageService({ storage: createMemoryStorage() }) });
    expect(settings.toggle('soundEnabled').soundEnabled).toBe(false);
    expect(settings.toggle('soundEnabled').soundEnabled).toBe(true);
  });

  it('非法缩放值回退到默认值', () => {
    const backing = createMemoryStorage();
    backing.setItem(
      'classic-minesweeper:settings',
      JSON.stringify({ v: 1, data: { uiScale: 7, soundEnabled: 'yes', reducedMotion: 'no' } }),
    );
    const settings = createSettingsService({ storage: createStorageService({ storage: backing }) });
    expect(settings.get()).toEqual({ soundEnabled: true, reducedMotion: false, allowQuestion: true, uiScale: 1 });
  });

  it('reset 恢复默认值', () => {
    const settings = createSettingsService({ storage: createStorageService({ storage: createMemoryStorage() }) });
    settings.set({ soundEnabled: false });
    expect(settings.reset()).toEqual(DEFAULT_SETTINGS);
  });

  it('写入失败不会抛出异常', () => {
    const failing = { write: vi.fn(() => false), read: vi.fn(() => null) };
    const settings = createSettingsService({ storage: failing });
    expect(() => settings.set({ soundEnabled: false })).not.toThrow();
    expect(failing.write).toHaveBeenCalled();
  });
});
