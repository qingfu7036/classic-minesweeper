/**
 * 本地持久化读写的唯一入口。
 * 所有数据都带版本号（v），读取失败 / 版本不符 / JSON 损坏时统一回退默认值，
 * 绝不让存储问题导致游戏无法启动。
 */
import { DATA_VERSION } from '../game/config.js';
import { isPlainObject } from '../utils/validation.js';

/** 内存后备存储：无 localStorage 环境（如测试、部分沙箱）下依然可用。 */
export function createMemoryStorage() {
  const map = new Map();
  return {
    getItem: (key) => (map.has(key) ? map.get(key) : null),
    setItem: (key, value) => {
      map.set(key, String(value));
    },
    removeItem: (key) => {
      map.delete(key);
    },
    clear: () => map.clear(),
    key: (i) => Array.from(map.keys())[i] ?? null,
    get length() {
      return map.size;
    },
  };
}

/** 探测可用的 localStorage（隐私模式/被禁用时会抛错）。 */
export function resolveDefaultStorage() {
  try {
    const candidate = globalThis.localStorage;
    if (!candidate) return null;
    const probe = '__cms_probe__';
    candidate.setItem(probe, '1');
    candidate.removeItem(probe);
    return candidate;
  } catch {
    return null;
  }
}

/**
 * @param {object} [options]
 * @param {Storage|null} [options.storage] 注入存储实现（默认自动探测 localStorage）
 * @param {string} [options.prefix] 键名前缀
 * @param {number} [options.version] 数据结构版本
 */
export function createStorageService({ storage, prefix = 'classic-minesweeper', version = DATA_VERSION } = {}) {
  const injected = storage !== undefined;
  const backing = injected ? storage : resolveDefaultStorage();
  const memory = createMemoryStorage();
  const store = backing ?? memory;

  const fullKey = (key) => `${prefix}:${key}`;

  function read(key, fallback = null) {
    try {
      const raw = store.getItem(fullKey(key));
      if (raw === null || raw === undefined) return fallback;
      const parsed = JSON.parse(raw);
      if (!isPlainObject(parsed)) return fallback;
      if (parsed.v !== version) return fallback;
      if (!('data' in parsed)) return fallback;
      return parsed.data;
    } catch {
      return fallback;
    }
  }

  function write(key, data) {
    try {
      store.setItem(fullKey(key), JSON.stringify({ v: version, data }));
      return true;
    } catch {
      return false;
    }
  }

  function remove(key) {
    try {
      store.removeItem(fullKey(key));
      return true;
    } catch {
      return false;
    }
  }

  return {
    read,
    write,
    remove,
    /** 是否真的写进了磁盘（false 表示只在内存里，刷新会丢）。 */
    isPersistent: Boolean(backing),
    version,
    prefix,
  };
}
