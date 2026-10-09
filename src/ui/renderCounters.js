/**
 * LED 计数器渲染（剩余地雷 / 计时）。
 * 使用纯 CSS 七段数码管，高 DPI 下依然清晰，且不依赖任何字体或图片。
 */

const SEGMENT_KEYS = ['a', 'b', 'c', 'd', 'e', 'f', 'g'];

const DIGIT_MAP = {
  0: 'abcdef',
  1: 'bc',
  2: 'abged',
  3: 'abgcd',
  4: 'fgbc',
  5: 'afgcd',
  6: 'afgedc',
  7: 'abc',
  8: 'abcdefg',
  9: 'abcdfg',
  '-': 'g',
  ' ': '',
};

/** 把数值格式化成经典计数器的显示文本（负数保留负号，正数补零）。 */
export function formatCounterText(value, digits = 3) {
  const safe = Number.isFinite(value) ? Math.trunc(value) : 0;
  if (safe < 0) {
    const abs = Math.min(Math.abs(safe), Math.pow(10, digits - 1) - 1);
    return `-${String(abs).padStart(digits - 1, '0')}`;
  }
  const capped = Math.min(safe, Math.pow(10, digits) - 1);
  return String(capped).padStart(digits, '0');
}

/**
 * @param {HTMLElement} container
 * @param {{digits?: number}} [options]
 */
export function createLedDisplay(container, { digits = 3 } = {}) {
  container.classList.add('led');
  const segments = [];

  for (let i = 0; i < digits; i += 1) {
    const digit = document.createElement('span');
    digit.className = 'led-digit';
    const map = {};
    for (const key of SEGMENT_KEYS) {
      const seg = document.createElement('i');
      seg.className = `seg s-${key}`;
      digit.appendChild(seg);
      map[key] = seg;
    }
    container.appendChild(digit);
    segments.push(map);
  }

  let current = null;

  function setValue(value, label) {
    const text = formatCounterText(value, digits);
    if (text === current) return text;
    current = text;
    for (let i = 0; i < digits; i += 1) {
      const char = text[i] ?? ' ';
      const active = DIGIT_MAP[char] ?? '';
      const map = segments[i];
      for (const key of SEGMENT_KEYS) {
        map[key].classList.toggle('on', active.includes(key));
      }
    }
    container.dataset.value = text;
    if (label) container.setAttribute('aria-label', label);
    return text;
  }

  return {
    setValue,
    getValue() {
      return current;
    },
    digits,
  };
}
