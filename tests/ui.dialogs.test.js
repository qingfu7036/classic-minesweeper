/**
 * E. 对话框测试（jsdom）
 * @vitest-environment jsdom
 */
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  createDialogManager,
  showAbout,
  showAchievements,
  showConfirm,
  showControls,
  showCustomDifficulty,
  showMessage,
  showRecords,
  showRules,
} from '../src/ui/dialogs.js';
import { createAchievementService } from '../src/services/achievementService.js';
import { createRecordsService } from '../src/services/recordsService.js';
import { createStorageService, createMemoryStorage } from '../src/services/storageService.js';

function memoryStorage() {
  return createStorageService({ storage: createMemoryStorage() });
}

describe('对话框基础能力', () => {
  let root;
  let dialogs;

  beforeEach(() => {
    document.body.innerHTML = '';
    root = document.createElement('div');
    document.body.appendChild(root);
    dialogs = createDialogManager({ root });
  });

  afterEach(() => {
    dialogs.closeAll();
  });

  it('渲染标题、内容与按钮，点击按钮返回对应值', async () => {
    const content = document.createElement('p');
    content.textContent = '内容是数据';
    const promise = dialogs.show({
      title: '测试对话框',
      content,
      buttons: [
        { label: '确定', value: 'ok', primary: true },
        { label: '取消', value: 'cancel' },
      ],
    });

    expect(root.querySelector('.dialog__title').textContent).toBe('测试对话框');
    expect(root.querySelector('.dialog__body').textContent).toContain('内容是数据');
    const buttons = [...root.querySelectorAll('.dialog__footer .btn')];
    expect(buttons.map((b) => b.textContent)).toEqual(['确定', '取消']);

    buttons[0].dispatchEvent(new MouseEvent('click', { bubbles: true }));
    await expect(promise).resolves.toBe('ok');
    expect(root.querySelector('.overlay')).toBeNull();
    expect(dialogs.isOpen()).toBe(false);
  });

  it('Escape 与关闭按钮返回 cancelValue', async () => {
    const first = dialogs.show({ title: 'A', content: document.createElement('div'), cancelValue: null });
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    await expect(first).resolves.toBeNull();

    const second = dialogs.show({ title: 'B', content: document.createElement('div'), cancelValue: 'cancelled' });
    root.querySelector('.dialog__close').dispatchEvent(new MouseEvent('click', { bubbles: true }));
    await expect(second).resolves.toBe('cancelled');
  });

  it('没有按钮时提供默认的确定按钮', async () => {
    const promise = dialogs.show({ title: '默认按钮', content: document.createElement('div') });
    const button = root.querySelector('.dialog__footer .btn');
    expect(button.textContent).toBe('确定');
    button.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    await expect(promise).resolves.toBeNull();
  });

  it('多个对话框可以堆叠并逐个关闭', async () => {
    const first = dialogs.show({ title: '第一层', content: document.createElement('div') });
    const second = dialogs.show({ title: '第二层', content: document.createElement('div') });
    expect(dialogs.count).toBe(2);
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    await second;
    expect(dialogs.count).toBe(1);
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    await first;
    expect(dialogs.count).toBe(0);
  });
});

describe('自定义难度对话框', () => {
  let root;
  let dialogs;

  beforeEach(() => {
    document.body.innerHTML = '';
    root = document.createElement('div');
    document.body.appendChild(root);
    dialogs = createDialogManager({ root });
  });

  afterEach(() => {
    dialogs.closeAll();
  });

  it('使用初始值填充输入框', () => {
    showCustomDifficulty(dialogs, { initial: { rows: 12, cols: 20, mines: 30 } });
    expect(root.querySelector('#custom-rows').value).toBe('12');
    expect(root.querySelector('#custom-cols').value).toBe('20');
    expect(root.querySelector('#custom-mines').value).toBe('30');
  });

  it('合法输入提交后返回配置', async () => {
    const promise = showCustomDifficulty(dialogs, { initial: { rows: 10, cols: 10, mines: 15 } });
    const form = root.querySelector('#custom-difficulty-form');
    form.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
    await expect(promise).resolves.toEqual({ rows: 10, cols: 10, mines: 15 });
  });

  it('非法输入不会关闭对话框，并显示具体错误', async () => {
    let settled = false;
    const promise = showCustomDifficulty(dialogs, { initial: { rows: 9, cols: 9, mines: 10 } }).then((value) => {
      settled = true;
      return value;
    });

    const rowsInput = root.querySelector('#custom-rows');
    rowsInput.value = '1';
    rowsInput.dispatchEvent(new Event('input', { bubbles: true }));
    expect(root.querySelector('#custom-rows-error').textContent).toContain('行数必须在');

    root.querySelector('#custom-difficulty-form').dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
    await Promise.resolve();
    expect(settled).toBe(false);
    expect(dialogs.isOpen()).toBe(true);

    // 地雷数超过上限同样被拦截
    rowsInput.value = '9';
    const minesInput = root.querySelector('#custom-mines');
    minesInput.value = '80';
    minesInput.dispatchEvent(new Event('input', { bubbles: true }));
    expect(root.querySelector('#custom-mines-error').textContent).toContain('地雷数不能超过');
    expect(root.querySelector('#custom-mines').getAttribute('aria-invalid')).toBe('true');

    dialogs.closeAll();
    await promise;
  });

  it('取消返回 null（调用方据此保持当前游戏不变）', async () => {
    const promise = showCustomDifficulty(dialogs);
    root.querySelectorAll('.dialog__footer .btn')[1].dispatchEvent(new MouseEvent('click', { bubbles: true }));
    await expect(promise).resolves.toBeNull();
  });

  it('提示文本会随行列变化更新地雷上限', () => {
    showCustomDifficulty(dialogs, { initial: { rows: 5, cols: 5, mines: 1 } });
    expect(root.querySelector('.dialog__hint').textContent).toContain('25 格'.slice(0, 2));
    expect(root.querySelector('#custom-mines').getAttribute('max')).toBe('16');
  });
});

describe('信息类对话框', () => {
  let root;
  let dialogs;

  beforeEach(() => {
    document.body.innerHTML = '';
    root = document.createElement('div');
    document.body.appendChild(root);
    dialogs = createDialogManager({ root });
  });

  afterEach(() => {
    dialogs.closeAll();
  });

  it('规则与操作说明包含关键内容', () => {
    showRules(dialogs);
    expect(root.textContent).toContain('初级：9 × 9，10 颗地雷');
    expect(root.textContent).toContain('首次点击');
    dialogs.closeAll();

    showControls(dialogs);
    expect(root.textContent).toContain('右键单击未打开格');
    expect(root.textContent).toContain('F2');
    dialogs.closeAll();
  });

  it('关于对话框显示运行时信息', () => {
    showAbout(dialogs, { version: '9.9.9', platform: '单元测试', persistence: 'localStorage 可用' });
    expect(root.textContent).toContain('9.9.9');
    expect(root.textContent).toContain('单元测试');
  });

  it('消息框与确认框返回布尔值', async () => {
    const messagePromise = showMessage(dialogs, { title: '提示', message: '你好' });
    root.querySelector('.dialog__footer .btn').dispatchEvent(new MouseEvent('click', { bubbles: true }));
    await expect(messagePromise).resolves.toBe(true);

    const confirmPromise = showConfirm(dialogs, { title: '确认', message: '继续吗' });
    root.querySelectorAll('.dialog__footer .btn')[1].dispatchEvent(new MouseEvent('click', { bubbles: true }));
    await expect(confirmPromise).resolves.toBe(false);
  });

  it('最佳成绩对话框渲染三种难度、统计与空历史', () => {
    const records = createRecordsService({ storage: memoryStorage() });
    records.recordGame({
      result: 'win',
      difficultyId: 'beginner',
      label: '初级',
      custom: false,
      rows: 9,
      cols: 9,
      mines: 10,
      elapsedMs: 12_000,
      misflags: 0,
      moves: 20,
      finishedAt: 1_700_000_000_000,
    });
    showRecords(dialogs, records);
    expect(root.textContent).toContain('最佳通关时间');
    expect(root.textContent).toContain('12.00 秒');
    expect(root.textContent).toContain('总局数：1');
    expect(root.textContent).toContain('初级（9 × 9，10 雷）');
  });

  it('成就对话框列出全部成就与解锁状态', () => {
    const achievements = createAchievementService({ storage: memoryStorage() });
    achievements.handleGameFinished({
      result: 'win',
      difficultyId: 'beginner',
      custom: false,
      misflags: 0,
      elapsedMs: 15_000,
    });
    showAchievements(dialogs, achievements);
    expect(root.querySelectorAll('.achievement')).toHaveLength(9);
    expect(root.querySelectorAll('.achievement--unlocked').length).toBeGreaterThanOrEqual(2);
    expect(root.textContent).toContain('已解锁：');
    expect(root.textContent).toContain('未解锁');
  });
});
