/**
 * E. 雷区渲染测试（jsdom）
 * @vitest-environment jsdom
 */
import { beforeEach, describe, expect, it } from 'vitest';
import { createBoardRenderer } from '../src/ui/renderBoard.js';
import { createGameEngine } from '../src/game/gameEngine.js';
import { MARK } from '../src/game/config.js';
import { createPrng } from '../src/game/boardGenerator.js';

function createContainer() {
  const container = document.createElement('div');
  container.className = 'board';
  document.body.appendChild(container);
  return container;
}

function setup(rows = 9, cols = 9) {
  const container = createContainer();
  const renderer = createBoardRenderer(container);
  const engine = createGameEngine({ rng: createPrng(1234) });
  engine.newGame({ id: 'custom', label: '测试', custom: true, rows, cols, mines: 5 });
  renderer.build(engine.state);
  return { container, renderer, engine };
}

describe('棋盘渲染', () => {
  beforeEach(() => {
    document.body.innerHTML = '';
  });

  it('按行列生成正确数量的格子，并设置 --cols 变量', () => {
    const { container, renderer } = setup(9, 9);
    expect(container.querySelectorAll('.cell')).toHaveLength(81);
    expect(container.style.getPropertyValue('--cols')).toBe('9');
    expect(renderer.size).toEqual({ rows: 9, cols: 9, total: 81 });
  });

  it('初始状态全部为未打开的凸起格', () => {
    const { container } = setup();
    const cells = [...container.querySelectorAll('.cell')];
    expect(cells.every((cell) => cell.classList.contains('cell--closed'))).toBe(true);
    expect(container.querySelector('.cell--open')).toBeNull();
  });

  it('打开数字格后显示数字并带上对应颜色类', () => {
    const { renderer, engine } = setup();
    const index = 40;
    engine.open(index);
    engine.state.board[index].adjacent = 3;
    renderer.refresh(engine.state);
    const cell = renderer.getCellElement(index);
    expect(cell.classList.contains('cell--open')).toBe(true);
    expect(cell.textContent).toBe('3');
    expect(cell.dataset.n).toBe('3');
  });

  it('红旗 / 问号 / 地雷 / 踩雷 / 错旗分别使用独立样式', () => {
    const { renderer, engine } = setup();
    const board = engine.state.board;
    board[0].mark = MARK.FLAG;
    board[1].mark = MARK.QUESTION;
    board[2].mine = true;
    board[2].open = true;
    board[3].mine = true;
    board[3].open = true;
    board[3].exploded = true;
    board[4].mark = MARK.FLAG;
    board[4].wrong = true;
    renderer.refresh(engine.state);

    expect(renderer.getCellElement(0).classList.contains('cell--flag')).toBe(true);
    expect(renderer.getCellElement(1).classList.contains('cell--question')).toBe(true);
    expect(renderer.getCellElement(2).classList.contains('cell--mine')).toBe(true);
    expect(renderer.getCellElement(3).classList.contains('cell--exploded')).toBe(true);
    expect(renderer.getCellElement(4).classList.contains('cell--wrong')).toBe(true);
    expect(renderer.getCellElement(4).classList.contains('cell--flag')).toBe(false);
  });

  it('标记变化时旧状态类会被清除（不会残留）', () => {
    const { renderer, engine } = setup();
    const cell = renderer.getCellElement(10);
    engine.mark(10);
    renderer.update([10]);
    expect(cell.classList.contains('cell--flag')).toBe(true);
    engine.mark(10); // flag -> question
    renderer.update([10]);
    expect(cell.classList.contains('cell--flag')).toBe(false);
    expect(cell.classList.contains('cell--question')).toBe(true);
    engine.mark(10); // question -> none
    renderer.update([10]);
    expect(cell.className.trim()).toBe('cell cell--closed');
  });

  it('按下预览与键盘光标可以叠加显示', () => {
    const { renderer, engine } = setup();
    renderer.setPressed([0, 1, 2]);
    expect(renderer.getCellElement(1).classList.contains('cell--pressed')).toBe(true);
    renderer.clearPressed();
    expect(renderer.getCellElement(1).classList.contains('cell--pressed')).toBe(false);

    renderer.setCursor(5);
    expect(renderer.getCellElement(5).classList.contains('cell--cursor')).toBe(true);
    renderer.setCursor(6);
    expect(renderer.getCellElement(5).classList.contains('cell--cursor')).toBe(false);
    expect(renderer.getCellElement(6).classList.contains('cell--cursor')).toBe(true);
    expect(engine.state.board.length).toBe(81);
  });

  it('每个格子都有描述状态的无障碍标签', () => {
    const { renderer, engine } = setup();
    engine.open(0);
    engine.state.board[0].adjacent = 2;
    renderer.refresh(engine.state);
    expect(renderer.getCellElement(0).getAttribute('aria-label')).toContain('数字 2');
    expect(renderer.getCellElement(80).getAttribute('aria-label')).toBe('第 9 行第 9 列，未打开');
  });

  it('从事件目标解析索引', () => {
    const { container, renderer } = setup(3, 3);
    const cell = renderer.getCellElement(4);
    expect(renderer.indexFromTarget(cell)).toBe(4);
    expect(renderer.indexFromTarget(container)).toBeNull();
    expect(renderer.indexFromTarget(null)).toBeNull();
  });

  it('结束状态会给棋盘加上锁定类', () => {
    const { container, renderer, engine } = setup(3, 3);
    engine.open(0); // 首次开格生成雷区
    for (let i = 0; i < engine.state.board.length; i += 1) {
      if (!engine.state.board[i].mine) engine.open(i);
    }
    expect(engine.status).toBe('won');
    renderer.refresh(engine.state);
    expect(container.classList.contains('board--locked')).toBe(true);
    expect(container.querySelectorAll('.cell').length).toBe(9);
    // 锁定状态变化时所有格子的 aria-disabled 都要同步，
    // 不能只更新本次改动过的格子（否则屏幕阅读器会以为还能操作）。
    const cells = [...container.querySelectorAll('.cell')];
    expect(cells.every((cell) => cell.getAttribute('aria-disabled') === 'true')).toBe(true);
  });

  it('重建棋盘会清空旧 DOM（切换难度时不会残留）', () => {
    const { container, renderer, engine } = setup(9, 9);
    engine.newGame({ id: 'custom', label: '测试', custom: true, rows: 5, cols: 4, mines: 2 });
    renderer.build(engine.state);
    expect(container.querySelectorAll('.cell')).toHaveLength(20);
    expect(container.style.getPropertyValue('--cols')).toBe('4');
  });
});
