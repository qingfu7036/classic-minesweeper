/**
 * E. LED 计数器与笑脸渲染测试（jsdom）
 * @vitest-environment jsdom
 */
import { beforeEach, describe, expect, it } from 'vitest';
import { createLedDisplay, formatCounterText } from '../src/ui/renderCounters.js';
import { createFaceRenderer } from '../src/ui/renderFace.js';
import { formatElapsedSeconds } from '../src/utils/formatTime.js';

describe('formatCounterText', () => {
  it('正数补零到三位（经典计数器观感）', () => {
    expect(formatCounterText(10, 3)).toBe('010');
    expect(formatCounterText(0, 3)).toBe('000');
    expect(formatCounterText(99, 3)).toBe('099');
  });

  it('负数保留负号，最多显示两位数字', () => {
    expect(formatCounterText(-1, 3)).toBe('-01');
    expect(formatCounterText(-12, 3)).toBe('-12');
    expect(formatCounterText(-999, 3)).toBe('-99');
  });

  it('超过上限时截断到 999', () => {
    expect(formatCounterText(1234, 3)).toBe('999');
  });

  it('非法输入按 0 处理', () => {
    expect(formatCounterText(Number.NaN, 3)).toBe('000');
    expect(formatCounterText(undefined, 3)).toBe('000');
  });
});

describe('LED 显示', () => {
  beforeEach(() => {
    document.body.innerHTML = '';
  });

  it('创建指定数量的数码位，每段独立可控', () => {
    const container = document.createElement('div');
    document.body.appendChild(container);
    const led = createLedDisplay(container, { digits: 3 });
    expect(container.querySelectorAll('.led-digit')).toHaveLength(3);
    expect(container.querySelectorAll('.seg')).toHaveLength(21);
    expect(container.classList.contains('led')).toBe(true);
  });

  it('数字 1 只点亮右上与右下两段', () => {
    const container = document.createElement('div');
    const led = createLedDisplay(container, { digits: 3 });
    led.setValue(1);
    const first = container.querySelectorAll('.led-digit')[2];
    const on = [...first.querySelectorAll('.seg.on')].map((seg) => seg.className.split(' ')[1]);
    expect(on.sort()).toEqual(['s-b', 's-c']);
  });

  it('数字 8 点亮全部七段', () => {
    const container = document.createElement('div');
    const led = createLedDisplay(container, { digits: 3 });
    led.setValue(8);
    const digit = container.querySelectorAll('.led-digit')[2];
    expect(digit.querySelectorAll('.seg.on')).toHaveLength(7);
  });

  it('负数显示负号（用中间段表示）', () => {
    const container = document.createElement('div');
    const led = createLedDisplay(container, { digits: 3 });
    led.setValue(-3);
    expect(container.dataset.value).toBe('-03');
    const sign = container.querySelectorAll('.led-digit')[0];
    expect(sign.querySelectorAll('.seg.on')).toHaveLength(1);
    expect(sign.querySelector('.seg.on').className).toContain('s-g');
  });

  it('数值不变时不重复写 DOM，且记录 data-value 供断言', () => {
    const container = document.createElement('div');
    const led = createLedDisplay(container, { digits: 3 });
    expect(led.setValue(42)).toBe('042');
    expect(led.setValue(42)).toBe('042');
    expect(container.dataset.value).toBe('042');
    expect(led.getValue()).toBe('042');
  });

  it('可以设置无障碍标签', () => {
    const container = document.createElement('div');
    const led = createLedDisplay(container, { digits: 3 });
    led.setValue(7, '剩余地雷 7');
    expect(container.getAttribute('aria-label')).toBe('剩余地雷 7');
  });
});

describe('formatElapsedSeconds', () => {
  it('按秒向下取整并封顶 999', () => {
    expect(formatElapsedSeconds(0)).toBe(0);
    expect(formatElapsedSeconds(999)).toBe(0);
    expect(formatElapsedSeconds(1000)).toBe(1);
    expect(formatElapsedSeconds(1_999_999)).toBe(999);
    expect(formatElapsedSeconds(-5)).toBe(0);
  });
});

describe('笑脸按钮', () => {
  beforeEach(() => {
    document.body.innerHTML = '';
  });

  it('根据状态切换 data-face 与无障碍标签', () => {
    const button = document.createElement('button');
    document.body.appendChild(button);
    const face = createFaceRenderer(button);

    expect(face.get()).toBe('smile');
    expect(button.dataset.face).toBe('smile');

    face.set('oh');
    expect(button.dataset.face).toBe('oh');
    expect(button.getAttribute('aria-label')).toContain('快速开格');

    face.set('dead');
    face.set('win');
    expect(button.dataset.face).toBe('win');
    expect(button.getAttribute('aria-label')).toContain('胜利');
  });

  it('非法状态回退到笑脸', () => {
    const button = document.createElement('button');
    const face = createFaceRenderer(button);
    face.set('nonsense');
    expect(face.get()).toBe('smile');
  });

  it('按下状态通过 data-pressed 表示', () => {
    const button = document.createElement('button');
    const face = createFaceRenderer(button);
    face.setPressed(true);
    expect(button.dataset.pressed).toBe('true');
    face.setPressed(false);
    expect(button.dataset.pressed).toBeUndefined();
  });
});
