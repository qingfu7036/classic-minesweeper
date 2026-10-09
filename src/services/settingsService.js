/**
 * 设置服务：音效开关、减少动画、问号标记、界面缩放。
 * 读取失败时回退默认值。
 *
 * 内部一律使用方法闭包（而非对象方法里的 this），避免解构调用时丢失 this 绑定。
 */
import { STORAGE_KEYS, UI_SCALES } from '../game/config.js';
import { isPlainObject } from '../utils/validation.js';

export const DEFAULT_SETTINGS = Object.freeze({
  soundEnabled: true,
  reducedMotion: false,
  allowQuestion: true,
  uiScale: 1,
});

function sanitize(raw) {
  if (!isPlainObject(raw)) return { ...DEFAULT_SETTINGS };
  const scale = Number(raw.uiScale);
  return {
    soundEnabled: raw.soundEnabled !== false,
    reducedMotion: raw.reducedMotion === true,
    allowQuestion: raw.allowQuestion !== false,
    uiScale: UI_SCALES.includes(scale) ? scale : DEFAULT_SETTINGS.uiScale,
  };
}

export function createSettingsService({ storage } = {}) {
  let settings = sanitize(storage.read(STORAGE_KEYS.settings, null));

  function persist() {
    storage.write(STORAGE_KEYS.settings, settings);
  }

  /** 不传参数返回完整设置的副本；传 key 返回单项值。 */
  function get(key) {
    if (key === undefined) return { ...settings };
    return settings[key];
  }

  function set(patch) {
    settings = sanitize({ ...settings, ...patch });
    persist();
    return { ...settings };
  }

  function toggle(key) {
    return set({ [key]: !settings[key] });
  }

  function reset() {
    settings = { ...DEFAULT_SETTINGS };
    persist();
    return { ...settings };
  }

  return { get, set, toggle, reset };
}
