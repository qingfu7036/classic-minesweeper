/**
 * 模态对话框系统。
 * 提供通用的 show() 能力（Promise + 焦点陷阱 + Esc 取消），以及具体的业务弹窗：
 * 自定义难度、游戏规则、操作说明、最佳成绩、成就列表、关于、消息框。
 */
import { el } from './dom.js';
import { CUSTOM_LIMITS, DIFFICULTIES, STANDARD_DIFFICULTIES, maxMinesFor } from '../game/config.js';
import { validateCustomConfig, safeInt } from '../utils/validation.js';
import { formatDuration } from '../utils/formatTime.js';

const FOCUSABLE_SELECTOR =
  'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

export function createDialogManager({ root }) {
  const stack = [];
  let previousOverflow = '';

  function syncBodyScroll() {
    if (stack.length > 0) {
      document.body.style.overflow = 'hidden';
    } else {
      document.body.style.overflow = previousOverflow;
    }
  }

  /**
   * 打开一个对话框。
   * @param {object} options
   * @param {string} options.title
   * @param {Node} options.content
   * @param {Array<{label:string, value:any, primary?:boolean, submit?:boolean}>} [options.buttons]
   * @param {string} [options.formId] submit 按钮关联的表单 id
   * @param {any} [options.cancelValue] Esc / 关闭按钮 / 遮罩外点击的返回值
   * @param {string} [options.className] 追加到 .dialog 的类名
   * @param {(dialog:HTMLElement, api:{close:(value:any)=>void, body:HTMLElement})=>void} [options.onMount]
   * @returns {Promise<any>}
   */
  function show({
    title,
    content,
    buttons = [],
    formId = null,
    cancelValue = null,
    className = '',
    onMount = null,
  }) {
    return new Promise((resolve) => {
      if (stack.length === 0) previousOverflow = document.body.style.overflow;
      const focusBefore = document.activeElement;
      let settled = false;

      const body = el('div.dialog__body', {}, [content]);
      const footer = el('div.dialog__footer');
      const closeButton = el('button.dialog__close', { type: 'button', 'aria-label': '关闭', title: '关闭' });

      const dialog = el(`div.dialog${className ? `.${className}` : ''}`, {
        role: 'dialog',
        'aria-modal': 'true',
        'aria-label': title,
      }, [
        el('div.dialog__titlebar', {}, [el('span.dialog__title', { text: title }), closeButton]),
        body,
        footer,
      ]);

      const overlay = el('div.overlay', {}, [dialog]);

      const entry = { overlay, dialog };
      stack.push(entry);
      syncBodyScroll();

      function close(value) {
        if (settled) return;
        settled = true;
        const index = stack.indexOf(entry);
        if (index !== -1) stack.splice(index, 1);
        overlay.remove();
        document.removeEventListener('keydown', handleKeyDown, true);
        syncBodyScroll();
        if (focusBefore && typeof focusBefore.focus === 'function' && document.contains(focusBefore)) {
          focusBefore.focus();
        }
        resolve(value);
      }
      entry.close = close;

      function handleKeyDown(event) {
        // 只有最上层的对话框响应键盘，避免一次 Esc 关闭所有层
        if (stack[stack.length - 1] !== entry) return;
        if (event.key === 'Escape') {
          event.preventDefault();
          event.stopPropagation();
          close(cancelValue);
          return;
        }
        if (event.key !== 'Tab') return;
        const focusables = [...dialog.querySelectorAll(FOCUSABLE_SELECTOR)];
        if (focusables.length === 0) return;
        const first = focusables[0];
        const last = focusables[focusables.length - 1];
        if (event.shiftKey && (document.activeElement === first || !dialog.contains(document.activeElement))) {
          event.preventDefault();
          last.focus();
        } else if (!event.shiftKey && document.activeElement === last) {
          event.preventDefault();
          first.focus();
        }
      }

      const buttonNodes = [];
      for (const config of buttons) {
        const node = el(`button.btn${config.primary ? '.btn--primary' : ''}`, {
          type: config.submit ? 'submit' : 'button',
          text: config.label,
        });
        if (config.submit && formId) {
          node.setAttribute('form', formId);
        } else {
          node.addEventListener('click', () => close(config.value));
        }
        footer.appendChild(node);
        buttonNodes.push(node);
      }
      if (buttons.length === 0) {
        footer.appendChild(
          el('button.btn.btn--primary', { type: 'button', text: '确定', on: { click: () => close(null) } }),
        );
      }

      closeButton.addEventListener('click', () => close(cancelValue));
      document.addEventListener('keydown', handleKeyDown, true);
      root.appendChild(overlay);

      if (typeof onMount === 'function') onMount(dialog, { close, body, buttons: buttonNodes });

      const initial = dialog.querySelector('input, select, textarea, button.btn--primary, button');
      if (initial && typeof initial.focus === 'function') initial.focus();
    });
  }

  return {
    show,
    isOpen() {
      return stack.length > 0;
    },
    /** 关闭所有对话框，并以给定值结算未决的 Promise（避免调用方永远挂起）。 */
    closeAll(value = null) {
      for (const entry of [...stack]) {
        if (typeof entry.close === 'function') entry.close(value);
        else entry.overlay.remove();
      }
      stack.length = 0;
      syncBodyScroll();
      return value;
    },
    get count() {
      return stack.length;
    },
  };
}

function numberInput({ id, value, min, max, label }) {
  return el('input', {
    type: 'number',
    id,
    value: String(value),
    min: String(min),
    max: String(max),
    step: '1',
    inputmode: 'numeric',
    'aria-label': label,
  });
}

/**
 * 自定义难度弹窗。
 * 输入非法时不关闭弹窗；用户取消时返回 null，当前游戏不受影响。
 * @returns {Promise<{rows:number, cols:number, mines:number}|null>}
 */
export function showCustomDifficulty(dialogs, { initial = null } = {}) {
  const clampInt = (value, min, max, fallbackValue) => {
    const parsed = safeInt(value, fallbackValue);
    return Math.min(max, Math.max(min, parsed));
  };
  const startRows = clampInt(initial?.rows, CUSTOM_LIMITS.minRows, CUSTOM_LIMITS.maxRows, 16);
  const startCols = clampInt(initial?.cols, CUSTOM_LIMITS.minCols, CUSTOM_LIMITS.maxCols, 16);
  const startMines = clampInt(initial?.mines, CUSTOM_LIMITS.minMines, maxMinesFor(startRows, startCols), 40);

  const formId = 'custom-difficulty-form';
  const rowsInput = numberInput({
    id: 'custom-rows',
    value: startRows,
    min: CUSTOM_LIMITS.minRows,
    max: CUSTOM_LIMITS.maxRows,
    label: '行数',
  });
  const colsInput = numberInput({
    id: 'custom-cols',
    value: startCols,
    min: CUSTOM_LIMITS.minCols,
    max: CUSTOM_LIMITS.maxCols,
    label: '列数',
  });
  const minesInput = numberInput({
    id: 'custom-mines',
    value: startMines,
    min: CUSTOM_LIMITS.minMines,
    max: maxMinesFor(startRows, startCols),
    label: '地雷数',
  });

  const errorRows = el('p.field-error', { id: 'custom-rows-error', role: 'alert' });
  const errorCols = el('p.field-error', { id: 'custom-cols-error', role: 'alert' });
  const errorMines = el('p.field-error', { id: 'custom-mines-error', role: 'alert' });
  const hint = el('p.dialog__hint');

  function readValues() {
    return { rows: rowsInput.value, cols: colsInput.value, mines: minesInput.value };
  }

  function applyErrors(errors) {
    errorRows.textContent = errors.rows ?? '';
    errorCols.textContent = errors.cols ?? '';
    errorMines.textContent = errors.mines ?? '';
    rowsInput.setAttribute('aria-invalid', errors.rows ? 'true' : 'false');
    colsInput.setAttribute('aria-invalid', errors.cols ? 'true' : 'false');
    minesInput.setAttribute('aria-invalid', errors.mines ? 'true' : 'false');
  }

  function refreshHint() {
    const parsed = validateCustomConfig(readValues());
    const rows = safeInt(rowsInput.value, 0);
    const cols = safeInt(colsInput.value, 0);
    if (rows > 0 && cols > 0) {
      const limit = maxMinesFor(rows, cols);
      minesInput.setAttribute('max', String(limit));
      hint.textContent = `${rows} × ${cols} 棋盘（共 ${rows * cols} 格），地雷上限 ${limit} 颗（需为首次点击保留 9 格安全区）。`;
    } else {
      hint.textContent = '';
    }
    return parsed;
  }

  const form = el('form', { id: formId, novalidate: true }, [
    el('div.form-grid', {}, [
      el('label', { for: 'custom-rows', text: `行数（${CUSTOM_LIMITS.minRows} - ${CUSTOM_LIMITS.maxRows}）` }),
      rowsInput,
      errorRows,
      el('label', { for: 'custom-cols', text: `列数（${CUSTOM_LIMITS.minCols} - ${CUSTOM_LIMITS.maxCols}）` }),
      colsInput,
      errorCols,
      el('label', { for: 'custom-mines', text: `地雷数（至少 ${CUSTOM_LIMITS.minMines}）` }),
      minesInput,
      errorMines,
    ]),
    hint,
  ]);

  for (const input of [rowsInput, colsInput, minesInput]) {
    input.addEventListener('input', () => {
      const parsed = refreshHint();
      applyErrors(parsed.ok ? {} : parsed.errors);
    });
  }
  refreshHint();
  applyErrors(validateCustomConfig(readValues()).errors ?? {});

  return dialogs.show({
    title: '自定义难度',
    content: form,
    formId,
    cancelValue: null,
    buttons: [
      { label: '开始游戏', submit: true, primary: true },
      { label: '取消', value: null },
    ],
    onMount(dialog, { close }) {
      form.addEventListener('submit', (event) => {
        event.preventDefault();
        const parsed = validateCustomConfig(readValues());
        if (!parsed.ok) {
          applyErrors(parsed.errors);
          return;
        }
        close(parsed.value);
      });
      rowsInput.focus();
      rowsInput.select();
    },
  });
}

/** 简单消息框。 */
export function showMessage(dialogs, { title, message, detail = '', okLabel = '确定' }) {
  const content = el('div', {}, [
    el('p', { text: message }),
    detail ? el('p.dialog__hint', { text: detail }) : null,
  ]);
  return dialogs.show({
    title,
    content,
    buttons: [{ label: okLabel, value: true, primary: true }],
    cancelValue: true,
  });
}

/** 二选一确认框。 */
export function showConfirm(dialogs, { title, message, detail = '', okLabel = '确定', cancelLabel = '取消' }) {
  const content = el('div', {}, [
    el('p', { text: message }),
    detail ? el('p.dialog__hint', { text: detail }) : null,
  ]);
  return dialogs.show({
    title,
    content,
    cancelValue: false,
    buttons: [
      { label: okLabel, value: true, primary: true },
      { label: cancelLabel, value: false },
    ],
  });
}

/** 游戏规则。 */
export function showRules(dialogs) {
  const content = el('div', {}, [
    el('h3', { text: '目标' }),
    el('p', { text: '打开所有非地雷格即获胜；踩到地雷立即失败。' }),
    el('h3', { text: '三种标准难度' }),
    el('ul', {}, [
      el('li', { text: '初级：9 × 9，10 颗地雷' }),
      el('li', { text: '中级：16 × 16，40 颗地雷' }),
      el('li', { text: '高级：30 × 16，99 颗地雷' }),
      el('li', { text: '自定义：通过「游戏 → 自定义…」设置行列与地雷数' }),
    ]),
    el('h3', { text: '数字与安全区' }),
    el('ul', {}, [
      el('li', { text: '数字表示该格周围 8 格中的地雷数量。' }),
      el('li', { text: '首次点击（即第一次左键打开的格子）及其周围 8 格一定不是地雷（延迟初始化）。' }),
      el('li', { text: '打开空白格会自动展开相连的空白区域，已插旗的格子会阻挡展开。' }),
    ]),
    el('h3', { text: '标记与计数器' }),
    el('ul', {}, [
      el('li', { text: '右键循环切换：未标记 → 红旗 → 问号 → 未标记。' }),
      el('li', { text: '只有红旗计入剩余地雷计数：剩余 = 地雷总数 − 红旗数，允许为负数。' }),
      el('li', { text: '问号仅作备忘，不计入计数，也不阻止左键打开。' }),
    ]),
    el('h3', { text: '快速开格' }),
    el('p', {
      text: '当已打开数字格周围的红旗数量等于该数字时，可以一次打开周围其余未插旗、未打开的格子；如果旗子插错，会直接踩雷。',
    }),
    el('h3', { text: '计时与成绩' }),
    el('ul', {}, [
      el('li', { text: '首次有效开格后开始计时，胜利或失败后停止。' }),
      el('li', { text: '只有通关才会计入最佳成绩；自定义难度不参与三种标准难度的排名。' }),
    ]),
  ]);
  return dialogs.show({
    title: '游戏规则',
    content,
    buttons: [{ label: '关闭', value: true, primary: true }],
    cancelValue: true,
  });
}

/** 操作说明。 */
export function showControls(dialogs) {
  const kbd = (text) => el('kbd', { text });
  const content = el('div', {}, [
    el('h3', { text: '鼠标' }),
    el('ul', {}, [
      el('li', {}, ['左键单击未打开格：开格（首次点击保证安全）']),
      el('li', {}, ['右键单击未打开格：循环标记 未标记 → 红旗 → 问号 → 未标记']),
      el('li', {}, ['按住右键拖动：连续标记，每个格子只循环一次']),
      el('li', {}, ['左键按住已打开数字格再松开：快速开格（旗数等于数字时生效）']),
      el('li', {}, ['左右键同时按下、中键单击、双击：快速开格']),
      el('li', {}, ['点击笑脸：开新局']),
    ]),
    el('h3', { text: '键盘' }),
    el('ul', {}, [
      el('li', {}, [kbd('↑'), kbd('↓'), kbd('←'), kbd('→'), ' 移动光标（需先点击雷区或按 Tab 聚焦）']),
      el('li', {}, [kbd('Space'), ' / ', kbd('Enter'), ' 打开光标所在格；已在打开的数字格上则快速开格']),
      el('li', {}, [kbd('F'), ' 对光标所在格插旗 / 切换问号']),
      el('li', {}, [kbd('F2'), ' 新游戏']),
      el('li', {}, [kbd('Esc'), ' 关闭菜单或对话框']),
    ]),
    el('h3', { text: '窗口' }),
    el('ul', {}, [
      el('li', { text: '网页版：右上角按钮仅用于演示 Win7 窗口视觉，关闭会给出提示。' }),
      el('li', { text: '桌面版：右上角按钮为真实的最小化 / 最大化 / 关闭窗口。' }),
    ]),
  ]);
  return dialogs.show({
    title: '操作说明',
    content,
    buttons: [{ label: '关闭', value: true, primary: true }],
    cancelValue: true,
  });
}

/** 关于本项目。 */
export function showAbout(dialogs, info = {}) {
  const rows = [
    ['项目名称', info.productName ?? 'Classic Minesweeper'],
    ['版本', info.version ?? '1.0.0'],
    ['运行环境', info.platform ?? '浏览器'],
    ['渲染引擎', info.runtime ?? '—'],
    ['存储状态', info.persistence ?? '—'],
  ];
  const content = el('div', {}, [
    el('p', {
      text: 'Windows 7 经典扫雷的网页与桌面复刻，使用 HTML5 + CSS3 + 原生 ES Modules + Vite 实现，桌面端由 Electron 封装。',
    }),
    el('table.record-table', {}, [
      el('tbody', {}, rows.map(([key, value]) => el('tr', {}, [el('th', { text: key }), el('td', { text: String(value) })]))),
    ]),
    el('p.dialog__hint', {
      text: '所有图标、音效均为本项目自行生成，未使用任何原版游戏资源；不含任何联网请求。',
    }),
  ]);
  return dialogs.show({
    title: '关于本项目',
    content,
    buttons: [{ label: '关闭', value: true, primary: true }],
    cancelValue: true,
  });
}

function formatDate(at) {
  if (!at) return '—';
  try {
    return new Date(at).toLocaleString('zh-CN', { hour12: false });
  } catch {
    return '—';
  }
}

/** 最佳成绩、统计与最近战绩。 */
export function showRecords(dialogs, records) {
  const bests = records.getBests();
  const stats = records.getStats();
  const history = records.getHistory();

  const bestRows = STANDARD_DIFFICULTIES.map((id) => {
    const def = DIFFICULTIES[id];
    const best = bests[id];
    return el('tr', {}, [
      el('td', { text: `${def.label}（${def.cols} × ${def.rows}，${def.mines} 雷）` }),
      el('td', { class: best ? 'is-best' : '', text: best ? formatDuration(best.timeMs) : '尚无记录' }),
      el('td', { text: best ? formatDate(best.at) : '—' }),
    ]);
  });

  const winRate = stats.played > 0 ? `${Math.round((stats.won / stats.played) * 100)}%` : '—';
  const historyRows = history.slice(0, 10).map((item) =>
    el('tr', {}, [
      el('td', { text: `${item.label}${item.custom ? '（自定义）' : ''}` }),
      el('td', { text: item.result === 'win' ? '胜利' : '失败' }),
      el('td', { text: item.result === 'win' ? formatDuration(item.timeMs) : '—' }),
      el('td', { text: formatDate(item.at) }),
    ]),
  );

  const content = el('div', {}, [
    el('h3', { text: '最佳通关时间（标准难度）' }),
    el('table.record-table', {}, [
      el('thead', {}, [el('tr', {}, [el('th', { text: '难度' }), el('th', { text: '最佳时间' }), el('th', { text: '达成时间' })])]),
      el('tbody', {}, bestRows),
    ]),
    el('div.progress-summary', {}, [
      el('span', { text: `总局数：${stats.played}` }),
      el('span', { text: `胜：${stats.won}` }),
      el('span', { text: `负：${stats.lost}` }),
      el('span', { text: `胜率：${winRate}` }),
      el('span', { text: `自定义局数：${stats.byDifficulty.custom?.played ?? 0}` }),
    ]),
    el('h3', { text: '最近 10 局' }),
    historyRows.length > 0
      ? el('table.record-table', {}, [
          el('thead', {}, [el('tr', {}, [el('th', { text: '难度' }), el('th', { text: '结果' }), el('th', { text: '用时' }), el('th', { text: '时间' })])]),
          el('tbody', {}, historyRows),
        ])
      : el('p.dialog__hint', { text: '还没有完成的局。' }),
    el('p.dialog__hint', { text: '自定义难度的战绩只记入历史，不参与上述标准难度排名。' }),
  ]);

  return dialogs.show({
    title: '最佳成绩',
    content,
    className: 'dialog--wide',
    buttons: [{ label: '关闭', value: true, primary: true }],
    cancelValue: true,
  });
}

/** 成就列表。 */
export function showAchievements(dialogs, achievements) {
  const list = achievements.list();
  const progress = achievements.progress();
  const unlockedCount = list.filter((item) => item.unlocked).length;

  const items = list.map((def) =>
    el(`li.achievement${def.unlocked ? '.achievement--unlocked' : '.achievement--locked'}`, {}, [
      el('span.achievement__icon', { 'aria-hidden': 'true' }),
      el('div', {}, [
        el('div.achievement__name', { text: def.name }),
        el('div.achievement__desc', { text: def.description }),
      ]),
      el('span.achievement__state', {
        text: def.unlocked ? `已解锁 ${formatDate(def.unlockedAt)}` : '未解锁',
      }),
    ]),
  );

  const content = el('div', {}, [
    el('div.progress-summary', {}, [
      el('span', { text: `已解锁：${unlockedCount} / ${list.length}` }),
      el('span', { text: `完成局数：${progress.games}` }),
      el('span', { text: `当前连胜：${progress.winStreak}` }),
      el('span', { text: `历史最长连胜：${progress.bestStreak}` }),
    ]),
    el('ul.achievement-list', {}, items),
    el('p.dialog__hint', {
      text: '「完成一局」指到达胜利或失败；中途重新开始不计入；连续胜利会被失败重置。',
    }),
  ]);

  return dialogs.show({
    title: '成就列表',
    content,
    className: 'dialog--wide',
    buttons: [{ label: '关闭', value: true, primary: true }],
    cancelValue: true,
  });
}
