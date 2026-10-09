/**
 * 菜单栏。菜单结构在此集中声明，行为通过 onCommand 回调交给应用层处理，
 * UI 模块不直接修改游戏状态。
 */
import { el } from './dom.js';

export const MENU_DEFINITION = [
  {
    id: 'game',
    label: '游戏',
    items: [
      { id: 'game.new', label: '新游戏', shortcut: 'F2' },
      { type: 'separator' },
      { id: 'difficulty.beginner', label: '初级', group: 'difficulty' },
      { id: 'difficulty.intermediate', label: '中级', group: 'difficulty' },
      { id: 'difficulty.expert', label: '高级', group: 'difficulty' },
      { id: 'difficulty.custom', label: '自定义…', group: 'difficulty' },
      { type: 'separator' },
      { id: 'records', label: '最佳成绩…' },
      { type: 'separator' },
      { id: 'exit', label: '退出' },
    ],
  },
  {
    id: 'settings',
    label: '设置',
    items: [
      { id: 'setting.sound', label: '音效', check: true },
      { id: 'setting.reducedMotion', label: '减少动画', check: true },
      { id: 'setting.allowQuestion', label: '允许问号标记', check: true },
      { type: 'separator' },
      { id: 'setting.scale.1', label: '显示缩放：100%', group: 'scale' },
      { id: 'setting.scale.1.25', label: '显示缩放：125%', group: 'scale' },
      { id: 'setting.scale.1.5', label: '显示缩放：150%', group: 'scale' },
      { type: 'separator' },
      { id: 'setting.resetRecords', label: '清除成绩与统计…' },
    ],
  },
  {
    id: 'help',
    label: '帮助',
    items: [
      { id: 'help.rules', label: '游戏规则' },
      { id: 'help.controls', label: '操作说明' },
      { id: 'help.achievements', label: '成就列表…' },
      { id: 'help.records', label: '最佳成绩…' },
      { type: 'separator' },
      { id: 'help.about', label: '关于本项目' },
    ],
  },
];

function isSeparator(item) {
  return item.type === 'separator';
}

export function createMenuBar({ container, onCommand, definition = MENU_DEFINITION }) {
  const entries = new Map(); // itemId -> HTMLElement
  const menus = new Map(); // menuId -> { button, popup, menu }
  let openId = null;

  function closeMenu({ focusButton = false } = {}) {
    if (!openId) return;
    const current = menus.get(openId);
    if (current) {
      current.popup.hidden = true;
      current.menu.classList.remove('is-open');
      current.button.setAttribute('aria-expanded', 'false');
      if (focusButton) current.button.focus();
    }
    openId = null;
  }

  function openMenu(menuId, { focusFirst = false } = {}) {
    if (openId === menuId) return;
    closeMenu();
    const target = menus.get(menuId);
    if (!target) return;
    target.popup.hidden = false;
    target.menu.classList.add('is-open');
    target.button.setAttribute('aria-expanded', 'true');
    openId = menuId;
    if (focusFirst) {
      const first = target.popup.querySelector('[role^="menuitem"]:not([disabled])');
      if (first) first.focus();
    }
  }

  function moveTop(direction) {
    const ids = [...menus.keys()];
    const currentIndex = openId ? ids.indexOf(openId) : -1;
    const nextIndex = currentIndex === -1 ? 0 : (currentIndex + direction + ids.length) % ids.length;
    openMenu(ids[nextIndex], { focusFirst: true });
  }

  function moveWithinPopup(popup, direction) {
    const items = [...popup.querySelectorAll('[role^="menuitem"]:not([disabled])')];
    if (items.length === 0) return;
    const current = document.activeElement;
    const index = items.indexOf(current);
    const next = index === -1 ? 0 : (index + direction + items.length) % items.length;
    items[next].focus();
  }

  function dispatch(itemId) {
    closeMenu();
    onCommand(itemId);
  }

  for (const menuDef of definition) {
    const menu = el('div.menu', { dataset: { menu: menuDef.id } });
    const popupId = `menu-popup-${menuDef.id}`;
    const button = el(
      'button.menu__button',
      {
        type: 'button',
        role: 'menuitem',
        'aria-haspopup': 'true',
        'aria-expanded': 'false',
        'aria-controls': popupId,
        text: menuDef.label,
        on: {
          click: (event) => {
            event.stopPropagation();
            if (openId === menuDef.id) closeMenu();
            else openMenu(menuDef.id);
          },
          mouseenter: () => {
            if (openId && openId !== menuDef.id) openMenu(menuDef.id);
          },
          keydown: (event) => {
            if (event.key === 'ArrowDown' || event.key === 'Enter' || event.key === ' ') {
              event.preventDefault();
              openMenu(menuDef.id, { focusFirst: true });
            } else if (event.key === 'ArrowRight') {
              event.preventDefault();
              moveTop(1);
            } else if (event.key === 'ArrowLeft') {
              event.preventDefault();
              moveTop(-1);
            } else if (event.key === 'Escape') {
              closeMenu();
            }
          },
        },
      },
    );

    const popup = el('div.menu__popup', { id: popupId, role: 'menu', hidden: true, 'aria-label': menuDef.label });

    for (const item of menuDef.items) {
      if (isSeparator(item)) {
        popup.appendChild(el('div.menu__separator', { role: 'separator' }));
        continue;
      }
      const role = item.group ? 'menuitemradio' : item.check ? 'menuitemcheckbox' : 'menuitem';
      const node = el('button.menu__item', {
        type: 'button',
        role,
        'aria-checked': item.group || item.check ? 'false' : null,
        dataset: { item: item.id },
        on: {
          click: (event) => {
            event.stopPropagation();
            // 禁用项在程序化 dispatch 时也会触发监听器，这里显式拦截
            if (node.disabled) return;
            dispatch(item.id);
          },
          keydown: (event) => {
            if (event.key === 'ArrowDown') {
              event.preventDefault();
              moveWithinPopup(popup, 1);
            } else if (event.key === 'ArrowUp') {
              event.preventDefault();
              moveWithinPopup(popup, -1);
            } else if (event.key === 'Home') {
              event.preventDefault();
              const first = popup.querySelector('[role^="menuitem"]:not([disabled])');
              if (first) first.focus();
            } else if (event.key === 'End') {
              event.preventDefault();
              const items = popup.querySelectorAll('[role^="menuitem"]:not([disabled])');
              if (items.length > 0) items[items.length - 1].focus();
            } else if (event.key === 'Escape') {
              event.preventDefault();
              closeMenu({ focusButton: true });
            } else if (event.key === 'ArrowRight') {
              event.preventDefault();
              moveTop(1);
            } else if (event.key === 'ArrowLeft') {
              event.preventDefault();
              moveTop(-1);
            }
          },
        },
      });
      node.appendChild(el('span.menu__item-label', { text: item.label }));
      if (item.shortcut) node.appendChild(el('span.menu__shortcut', { text: item.shortcut }));
      popup.appendChild(node);
      entries.set(item.id, node);
    }

    menu.append(button, popup);
    container.appendChild(menu);
    menus.set(menuDef.id, { menu, button, popup });
  }

  function handleDocumentPointer(event) {
    if (!openId) return;
    if (!container.contains(event.target)) closeMenu();
  }

  document.addEventListener('pointerdown', handleDocumentPointer, true);

  return {
    close: closeMenu,
    isOpen() {
      return Boolean(openId);
    },
    /** 勾选项状态（音效 / 减少动画 / 问号标记）。 */
    setChecked(itemId, checked) {
      const node = entries.get(itemId);
      if (node) node.setAttribute('aria-checked', checked ? 'true' : 'false');
    },
    /** 单选项状态（难度、显示缩放）。 */
    setRadio(group, activeId) {
      for (const [itemId, node] of entries) {
        const definition_ = definition
          .flatMap((menu) => menu.items)
          .find((item) => item && item.id === itemId);
        if (definition_?.group === group) {
          node.setAttribute('aria-checked', itemId === activeId ? 'true' : 'false');
        }
      }
    },
    setEnabled(itemId, enabled) {
      const node = entries.get(itemId);
      if (!node) return;
      node.disabled = !enabled;
      node.setAttribute('aria-disabled', enabled ? 'false' : 'true');
    },
    getItem(itemId) {
      return entries.get(itemId) ?? null;
    },
    destroy() {
      document.removeEventListener('pointerdown', handleDocumentPointer, true);
      container.textContent = '';
      entries.clear();
      menus.clear();
      openId = null;
    },
  };
}
