/**
 * E. 菜单栏测试（jsdom）
 * @vitest-environment jsdom
 */
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { MENU_DEFINITION, createMenuBar } from '../src/ui/menus.js';

function pointerDown(target) {
  target.dispatchEvent(new MouseEvent('pointerdown', { bubbles: true }));
}

describe('菜单栏', () => {
  let container;
  let commands;
  let menu;

  beforeEach(() => {
    document.body.innerHTML = '';
    container = document.createElement('div');
    container.className = 'menubar';
    document.body.appendChild(container);
    commands = [];
    menu = createMenuBar({ container, onCommand: (id) => commands.push(id) });
  });

  afterEach(() => {
    menu.destroy();
  });

  it('按定义渲染所有菜单与菜单项', () => {
    expect(container.querySelectorAll('.menu')).toHaveLength(MENU_DEFINITION.length);
    for (const menuDef of MENU_DEFINITION) {
      for (const item of menuDef.items) {
        if (item.type === 'separator') continue;
        expect(container.querySelector(`[data-item="${item.id}"]`), `${item.id} 应该存在`).toBeTruthy();
      }
    }
  });

  it('默认全部收起，点击按钮后展开', () => {
    const button = container.querySelector('[data-menu="game"] .menu__button');
    const popup = container.querySelector('#menu-popup-game');
    expect(popup.hidden).toBe(true);

    button.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    expect(popup.hidden).toBe(false);
    expect(menu.isOpen()).toBe(true);
    expect(button.getAttribute('aria-expanded')).toBe('true');

    button.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    expect(popup.hidden).toBe(true);
    expect(menu.isOpen()).toBe(false);
  });

  it('点击菜单项派发命令并收起菜单', () => {
    container.querySelector('[data-menu="game"] .menu__button').dispatchEvent(new MouseEvent('click', { bubbles: true }));
    const item = container.querySelector('[data-item="game.new"]');
    item.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    expect(commands).toEqual(['game.new']);
    expect(menu.isOpen()).toBe(false);
  });

  it('点击菜单外部会收起菜单', () => {
    container.querySelector('[data-menu="help"] .menu__button').dispatchEvent(new MouseEvent('click', { bubbles: true }));
    expect(menu.isOpen()).toBe(true);
    pointerDown(document.body);
    expect(menu.isOpen()).toBe(false);
  });

  it('Escape 关闭菜单', () => {
    container.querySelector('[data-menu="settings"] .menu__button').dispatchEvent(new MouseEvent('click', { bubbles: true }));
    const button = container.querySelector('[data-menu="settings"] .menu__button');
    button.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    expect(menu.isOpen()).toBe(false);
  });

  it('setChecked 控制勾选状态', () => {
    menu.setChecked('setting.sound', true);
    expect(container.querySelector('[data-item="setting.sound"]').getAttribute('aria-checked')).toBe('true');
    menu.setChecked('setting.sound', false);
    expect(container.querySelector('[data-item="setting.sound"]').getAttribute('aria-checked')).toBe('false');
  });

  it('setRadio 在同一个分组内互斥选中', () => {
    menu.setRadio('difficulty', 'difficulty.expert');
    expect(container.querySelector('[data-item="difficulty.expert"]').getAttribute('aria-checked')).toBe('true');
    expect(container.querySelector('[data-item="difficulty.beginner"]').getAttribute('aria-checked')).toBe('false');

    menu.setRadio('difficulty', 'difficulty.custom');
    expect(container.querySelector('[data-item="difficulty.custom"]').getAttribute('aria-checked')).toBe('true');
    expect(container.querySelector('[data-item="difficulty.expert"]').getAttribute('aria-checked')).toBe('false');

    menu.setRadio('scale', 'setting.scale.1.25');
    expect(container.querySelector('[data-item="setting.scale.1.25"]').getAttribute('aria-checked')).toBe('true');
    expect(container.querySelector('[data-item="difficulty.custom"]').getAttribute('aria-checked')).toBe('true');
  });

  it('禁用的菜单项不会派发命令', () => {
    menu.setEnabled('exit', false);
    const node = container.querySelector('[data-item="exit"]');
    expect(node.disabled).toBe(true);
    node.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    expect(commands).toEqual([]);
    menu.setEnabled('exit', true);
    expect(node.disabled).toBe(false);
  });

  it('菜单项包含快捷键提示', () => {
    const item = container.querySelector('[data-item="game.new"]');
    expect(item.textContent).toContain('新游戏');
    expect(item.querySelector('.menu__shortcut').textContent).toBe('F2');
  });

  it('destroy 后清空 DOM 并移除全局监听', () => {
    menu.destroy();
    expect(container.children).toHaveLength(0);
    expect(menu.getItem('game.new')).toBeNull();
    // 再次点击不应抛错
    pointerDown(document.body);
  });
});
