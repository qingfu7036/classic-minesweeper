/**
 * E. 输入控制器测试（jsdom）：鼠标、双击、中键、右键拖动与键盘。
 * @vitest-environment jsdom
 */
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createInputController } from '../src/ui/inputController.js';
import { createBoardRenderer } from '../src/ui/renderBoard.js';
import { createFaceRenderer } from '../src/ui/renderFace.js';
import { createGameEngine } from '../src/game/gameEngine.js';
import { GAME_STATUS, MARK } from '../src/game/config.js';
import { computeAdjacent } from '../src/game/boardGenerator.js';

/** 构造 3×3 棋盘，左上角一颗地雷，中心格数字为 1。 */
function setup() {
  document.body.innerHTML = '';
  const board = document.createElement('div');
  board.className = 'board';
  board.tabIndex = 0;
  document.body.appendChild(board);
  const faceButton = document.createElement('button');
  document.body.appendChild(faceButton);

  const engine = createGameEngine();
  engine.newGame({ id: 'custom', label: '测试', custom: true, rows: 3, cols: 3, mines: 1 });
  const cells = engine.state.board;
  cells[0].mine = true;
  computeAdjacent(cells, 3, 3);
  engine.state.minesPlaced = true;
  engine.state.status = GAME_STATUS.PLAYING;
  engine.state.startedAt = 0;

  const renderer = createBoardRenderer(board);
  renderer.build(engine.state);
  const face = createFaceRenderer(faceButton);
  const actions = [];
  const controller = createInputController({
    board,
    renderer,
    engine,
    face,
    hooks: { onAction: (payload) => actions.push(payload) },
  });

  const cellAt = (index) => renderer.getCellElement(index);

  function press(index, button) {
    cellAt(index).dispatchEvent(new MouseEvent('mousedown', { bubbles: true, button }));
  }
  function release(index, button) {
    cellAt(index).dispatchEvent(new MouseEvent('mouseup', { bubbles: true, button }));
  }
  function click(index, button = 0) {
    press(index, button);
    release(index, button);
  }

  return { board, engine, renderer, face, controller, actions, cellAt, press, release, click, faceButton };
}

describe('鼠标交互', () => {
  let ctx;
  beforeEach(() => {
    ctx = setup();
  });
  afterEach(() => {
    ctx.controller.destroy();
  });

  it('左键按下再松开打开格子', () => {
    ctx.click(4);
    expect(ctx.engine.state.board[4].open).toBe(true);
    expect(ctx.actions.map((item) => item.type)).toContain('open');
  });

  it('左键按下后移动到别的格再松开不会打开原格', () => {
    ctx.press(4, 0);
    ctx.release(8, 0);
    expect(ctx.engine.state.board[4].open).toBe(false);
    expect(ctx.engine.state.board[8].open).toBe(false);
  });

  it('按下时笑脸变为惊愕，松开后恢复', () => {
    ctx.press(4, 0);
    expect(ctx.face.get()).toBe('oh');
    ctx.release(4, 0);
    expect(ctx.face.get()).toBe('smile');
  });

  it('右键按下立即循环标记，且不会打开格子', () => {
    ctx.press(8, 2);
    expect(ctx.engine.state.board[8].mark).toBe(MARK.FLAG);
    expect(ctx.engine.state.board[8].open).toBe(false);
    ctx.release(8, 2);
    ctx.press(8, 2);
    expect(ctx.engine.state.board[8].mark).toBe(MARK.QUESTION);
    ctx.release(8, 2);
  });

  it('按住右键拖动可以连续标记，且同一格不会被重复循环', () => {
    ctx.press(6, 2);
    ctx.cellAt(7).dispatchEvent(new MouseEvent('mousemove', { bubbles: true }));
    ctx.cellAt(8).dispatchEvent(new MouseEvent('mousemove', { bubbles: true }));
    ctx.cellAt(7).dispatchEvent(new MouseEvent('mousemove', { bubbles: true }));
    expect(ctx.engine.state.board[6].mark).toBe(MARK.FLAG);
    expect(ctx.engine.state.board[7].mark).toBe(MARK.FLAG);
    expect(ctx.engine.state.board[8].mark).toBe(MARK.FLAG);
    ctx.release(8, 2);
  });

  it('右键菜单被阻止', () => {
    const event = new MouseEvent('contextmenu', { bubbles: true, cancelable: true });
    ctx.cellAt(0).dispatchEvent(event);
    expect(event.defaultPrevented).toBe(true);
  });

  it('左键按下后右击别处，再依次松开，左键的开格动作不会被吞掉', () => {
    ctx.press(4, 0); // 左键按住中心格
    ctx.press(8, 2); // 同时右键另一格
    ctx.release(8, 2);
    expect(ctx.engine.state.board[8].mark).toBe(MARK.FLAG);
    ctx.release(4, 0);
    expect(ctx.engine.state.board[4].open).toBe(true);
  });

  it('终局后键盘光标不再移动', () => {
    ctx.engine.open(4);
    ctx.engine.open(0); // 踩到地雷
    expect(ctx.engine.status).toBe(GAME_STATUS.LOST);
    ctx.board.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true, cancelable: true }));
    expect(ctx.renderer.getCursor()).toBeNull();
  });

  it('双击已打开的数字格触发快速开格', () => {
    ctx.engine.open(4); // 中心格数字 1
    expect(ctx.engine.state.board[4].adjacent).toBe(1);
    ctx.engine.mark(0); // 正确插旗
    ctx.cellAt(4).dispatchEvent(new MouseEvent('dblclick', { bubbles: true }));
    expect(ctx.actions.some((item) => item.type === 'chord')).toBe(true);
    expect(ctx.engine.state.board[1].open).toBe(true); // 周围安全格被打开
  });

  it('中键单击已打开数字格触发快速开格', () => {
    ctx.engine.open(4);
    ctx.engine.mark(0);
    ctx.press(4, 1);
    ctx.release(4, 1);
    expect(ctx.actions.some((item) => item.type === 'chord')).toBe(true);
  });

  it('已结束的游戏不再响应点击', () => {
    ctx.engine.state.status = GAME_STATUS.LOST;
    ctx.engine.state.board[0].open = true;
    ctx.click(4);
    expect(ctx.engine.state.board[4].open).toBe(false);
  });

  it('右键标记已打开的格子不会改变状态', () => {
    ctx.engine.open(4);
    ctx.click(4, 2);
    expect(ctx.engine.state.board[4].mark).toBe(MARK.NONE);
  });
});

describe('键盘交互', () => {
  let ctx;
  beforeEach(() => {
    ctx = setup();
  });
  afterEach(() => {
    ctx.controller.destroy();
  });

  function key(k) {
    ctx.board.dispatchEvent(new KeyboardEvent('keydown', { key: k, bubbles: true, cancelable: true }));
  }

  it('方向键移动光标，Space / Enter 打开格子', () => {
    key('ArrowRight');
    expect(ctx.renderer.getCursor()).toBe(0);
    key('ArrowRight');
    expect(ctx.renderer.getCursor()).toBe(1);
    key('ArrowDown');
    expect(ctx.renderer.getCursor()).toBe(4);
    key('Enter');
    expect(ctx.engine.state.board[4].open).toBe(true);
  });

  it('光标不会越出棋盘边界', () => {
    key('ArrowUp');
    expect(ctx.renderer.getCursor()).toBe(0);
    key('ArrowLeft');
    expect(ctx.renderer.getCursor()).toBe(0);
    key('End');
    expect(ctx.renderer.getCursor()).toBe(8);
    key('ArrowRight');
    expect(ctx.renderer.getCursor()).toBe(8);
  });

  it('F 键切换当前光标格的标记', () => {
    key('ArrowRight');
    key('ArrowRight');
    key('f');
    expect(ctx.engine.state.board[1].mark).toBe(MARK.FLAG);
    key('F');
    expect(ctx.engine.state.board[1].mark).toBe(MARK.QUESTION);
  });

  it('空格在已打开的数字格上执行快速开格', () => {
    ctx.engine.open(4);
    ctx.engine.mark(0);
    key('ArrowRight');
    key('ArrowRight');
    key('ArrowDown');
    key(' ');
    expect(ctx.actions.some((item) => item.type === 'chord')).toBe(true);
  });
});
