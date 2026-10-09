/**
 * B/C. 游戏引擎：状态机、计时、锁定与事件测试
 */
import { describe, expect, it } from 'vitest';
import { GAME_EVENT, createGameEngine, normalizeConfig } from '../src/game/gameEngine.js';
import { GAME_STATUS, MARK, getDifficulty } from '../src/game/config.js';
import { computeAdjacent, countMines } from '../src/game/boardGenerator.js';
import { createClock, seededRng } from './helpers.js';

function createEngine(options = {}) {
  const clock = createClock();
  const engine = createGameEngine({
    now: clock.now,
    rng: options.rng ?? seededRng(2024),
    allowQuestion: options.allowQuestion ?? true,
  });
  return { engine, clock };
}

/** 收集引擎事件，便于断言顺序与内容。 */
function recordEvents(engine) {
  const events = [];
  engine.subscribe((event) => events.push(event));
  return events;
}

describe('初始状态', () => {
  it('新局处于「已就绪但未布雷」状态，计时为 0', () => {
    const { engine } = createEngine();
    expect(engine.status).toBe(GAME_STATUS.READY);
    expect(engine.state.minesPlaced).toBe(false);
    expect(countMines(engine.state.board)).toBe(0);
    expect(engine.getElapsedMs()).toBe(0);
    expect(engine.config.id).toBe('beginner');
    expect(engine.state.rows).toBe(9);
    expect(engine.state.cols).toBe(9);
  });

  it('延迟初始化：首次点击后才布雷并开始计时', () => {
    const { engine, clock } = createEngine();
    const events = recordEvents(engine);
    clock.advance(5_000);
    expect(engine.getElapsedMs()).toBe(0);

    engine.open(40);
    expect(engine.state.minesPlaced).toBe(true);
    expect(countMines(engine.state.board)).toBe(10);
    expect(engine.status).toBe(GAME_STATUS.PLAYING);
    expect(events.map((event) => event.type)).toContain(GAME_EVENT.STARTED);

    clock.advance(1_500);
    expect(engine.getElapsedMs()).toBe(1_500);
  });

  it('首次点击绝不踩雷，并且相邻 8 格安全（多种随机种子）', () => {
    for (let seed = 1; seed <= 40; seed += 1) {
      const { engine } = createEngine({ rng: seededRng(seed * 31) });
      const firstIndex = (seed * 7) % 81;
      engine.open(firstIndex);
      const { board, cols } = engine.state;
      expect(board[firstIndex].mine).toBe(false);
      const row = Math.floor(firstIndex / cols);
      const col = firstIndex % cols;
      for (let dr = -1; dr <= 1; dr += 1) {
        for (let dc = -1; dc <= 1; dc += 1) {
          const r = row + dr;
          const c = col + dc;
          if (r < 0 || c < 0 || r >= engine.state.rows || c >= cols) continue;
          expect(board[r * cols + c].mine).toBe(false);
        }
      }
    }
  });
});

describe('开格与标记', () => {
  it('已插旗的格子左键无效，问号格可以打开', () => {
    const { engine } = createEngine();
    engine.open(40);
    const flagIndex = 0;
    engine.mark(flagIndex);
    expect(engine.state.board[flagIndex].mark).toBe(MARK.FLAG);
    expect(engine.open(flagIndex).status).toBe('ignored');
    expect(engine.state.board[flagIndex].open).toBe(false);

    const questionIndex = 2;
    engine.mark(questionIndex); // flag
    engine.mark(questionIndex); // question
    expect(engine.state.board[questionIndex].mark).toBe(MARK.QUESTION);
    if (!engine.state.board[questionIndex].mine) {
      expect(engine.open(questionIndex).status).not.toBe('ignored');
    }
  });

  it('剩余地雷计数等于总雷数减红旗数，允许为负', () => {
    const { engine } = createEngine();
    expect(engine.getMineCounter()).toBe(10);
    // 先不打开任何格，直接插 11 面旗（比地雷多 1 面）
    for (let i = 0; i < 11; i += 1) engine.mark(i);
    expect(engine.state.flags).toBe(11);
    expect(engine.getMineCounter()).toBe(-1);
    expect(engine.getMineCounter()).toBe(engine.state.mines - engine.state.flags);
  });

  it('问号不计入红旗数量', () => {
    const { engine } = createEngine();
    engine.open(40);
    engine.mark(0);
    engine.mark(0);
    expect(engine.state.flags).toBe(0);
    expect(engine.getMineCounter()).toBe(10);
  });
});

describe('胜负与锁定', () => {
  function playToWin(engine) {
    const { board } = engine.state;
    for (let i = 0; i < board.length; i += 1) {
      if (!board[i].mine) engine.open(i);
    }
  }

  it('打开所有非地雷格后胜利，并自动为剩余地雷插旗', () => {
    const { engine, clock } = createEngine();
    const events = recordEvents(engine);
    engine.open(40);
    clock.advance(3_200);
    playToWin(engine);

    expect(engine.status).toBe(GAME_STATUS.WON);
    expect(engine.state.flags).toBe(10);
    expect(engine.getElapsedMs()).toBe(3_200);

    const finished = events.find((event) => event.type === GAME_EVENT.FINISHED);
    expect(finished).toBeDefined();
    expect(finished.result).toBe('win');
    expect(finished.payload).toMatchObject({ result: 'win', difficultyId: 'beginner', elapsedMs: 3_200 });
  });

  it('胜利后计时冻结，且棋盘锁定', () => {
    const { engine, clock } = createEngine();
    engine.open(40);
    playToWin(engine);
    const frozen = engine.getElapsedMs();
    clock.advance(9_999);
    expect(engine.getElapsedMs()).toBe(frozen);

    expect(engine.open(0).status).toBe('locked');
    expect(engine.mark(0).status).toBe('locked');
    expect(engine.chord(0).status).toBe('locked');
  });

  it('踩雷后失败：显示全部地雷、锁定棋盘、发出 loss 结果', () => {
    const { engine, clock } = createEngine();
    const events = recordEvents(engine);
    engine.open(40);
    clock.advance(1_000);

    const mineIndex = engine.state.board.findIndex((cell) => cell.mine);
    engine.open(mineIndex);

    expect(engine.status).toBe(GAME_STATUS.LOST);
    expect(engine.state.board[mineIndex].exploded).toBe(true);
    expect(countMines(engine.state.board.filter((cell) => cell.open))).toBe(10);
    expect(engine.open(0).status).toBe('locked');

    const finished = events.find((event) => event.type === GAME_EVENT.FINISHED);
    expect(finished.result).toBe('loss');
    expect(finished.payload.elapsedMs).toBe(1_000);
  });

  it('失败时插错的旗会被标记为错误', () => {
    const { engine } = createEngine();
    engine.open(40);
    const safeIndex = engine.state.board.findIndex((cell) => !cell.mine && !cell.open);
    engine.mark(safeIndex);
    const mineIndex = engine.state.board.findIndex((cell) => cell.mine);
    engine.open(mineIndex);
    expect(engine.state.board[safeIndex].wrong).toBe(true);
  });

  it('misflags 统计「把旗插到安全格」的次数，用于完美标记成就', () => {
    const { engine } = createEngine();
    engine.open(40);
    const safe = engine.state.board.findIndex((cell) => !cell.mine && !cell.open);
    engine.mark(safe); // 错误插旗
    engine.mark(safe); // 问号
    expect(engine.state.misflags).toBe(1);
    const mine = engine.state.board.findIndex((cell) => cell.mine);
    engine.mark(mine);
    expect(engine.state.misflags).toBe(1);
  });
});

describe('重开与切换难度', () => {
  it('重开清空棋盘、标记、计时与统计', () => {
    const { engine, clock } = createEngine();
    engine.open(40);
    engine.mark(0);
    clock.advance(4_000);
    const before = engine.state;

    engine.reset();

    expect(engine.state).not.toBe(before);
    expect(engine.status).toBe(GAME_STATUS.READY);
    expect(engine.state.minesPlaced).toBe(false);
    expect(engine.state.flags).toBe(0);
    expect(engine.state.misflags).toBe(0);
    expect(engine.state.moves).toBe(0);
    expect(engine.getElapsedMs()).toBe(0);
    expect(engine.state.board.every((cell) => cell.mark === MARK.NONE && !cell.open && !cell.mine)).toBe(true);
  });

  it('重开后重新生成雷区，且不会复用上一局布局', () => {
    const { engine } = createEngine({ rng: seededRng(99) });
    engine.open(40);
    const firstLayout = engine.state.board.map((cell) => cell.mine);

    engine.reset();
    engine.open(40);
    const secondLayout = engine.state.board.map((cell) => cell.mine);

    expect(countMines(engine.state.board)).toBe(10);
    expect(secondLayout).not.toEqual(firstLayout);
  });

  it('切换难度会同步更新行列、雷数与计数器', () => {
    const { engine } = createEngine();
    engine.newGame(getDifficulty('expert'));
    expect(engine.state.rows).toBe(16);
    expect(engine.state.cols).toBe(30);
    expect(engine.state.mines).toBe(99);
    expect(engine.getMineCounter()).toBe(99);
    engine.open(0);
    expect(countMines(engine.state.board)).toBe(99);

    engine.newGame(getDifficulty('intermediate'));
    expect(engine.state.rows).toBe(16);
    expect(engine.state.cols).toBe(16);
    expect(engine.getMineCounter()).toBe(40);
  });

  it('已结束的游戏不会被重开以外的操作改变', () => {
    const { engine } = createEngine();
    engine.open(40);
    const mineIndex = engine.state.board.findIndex((cell) => cell.mine);
    engine.open(mineIndex);
    const snapshotFlags = engine.state.flags;
    engine.mark(0);
    engine.open(1);
    expect(engine.state.flags).toBe(snapshotFlags);
  });
});

describe('快速开格的引擎集成', () => {
  /** 手工铺一个 3×3 棋盘：左上角一颗雷，中心格数字为 1。 */
  function manualBoard() {
    const { engine } = createEngine();
    engine.newGame({ id: 'custom', label: '测试', custom: true, rows: 3, cols: 3, mines: 1 });
    const board = engine.state.board;
    board[0].mine = true;
    computeAdjacent(board, 3, 3);
    engine.state.minesPlaced = true;
    engine.state.status = GAME_STATUS.PLAYING;
    return engine;
  }

  it('旗子插错时快速开格直接判负，并发出 finished(loss)', () => {
    const engine = manualBoard();
    const events = recordEvents(engine);
    engine.open(4);
    engine.mark(8); // 旗插在安全格上
    const result = engine.chord(4);

    expect(result.status).toBe('lost');
    expect(engine.status).toBe(GAME_STATUS.LOST);
    expect(engine.state.board[0].exploded).toBe(true);
    expect(engine.state.board[0].open).toBe(true);
    expect(events.at(-1)).toMatchObject({ type: GAME_EVENT.FINISHED, result: 'loss' });
  });

  it('旗数正确时打开剩余安全格，凑满即判胜并自动插旗', () => {
    const engine = manualBoard();
    const events = recordEvents(engine);
    engine.open(4);
    engine.mark(0); // 正确的旗
    const result = engine.chord(4);

    expect(result.status).toBe('won');
    expect(engine.status).toBe(GAME_STATUS.WON);
    expect(engine.state.flags).toBe(1);
    expect(engine.state.board.every((cell) => cell.mine || cell.open)).toBe(true);
    expect(engine.state.board[0].open).toBe(false); // 旗子保留
    expect(events.at(-1)).toMatchObject({ type: GAME_EVENT.FINISHED, result: 'win' });
  });

  it('旗数与数字不符时快速开格不产生任何变化，也不计入操作数', () => {
    const engine = manualBoard();
    engine.open(4);
    const movesBefore = engine.state.moves;
    expect(engine.chord(4).status).toBe('noop');
    expect(engine.state.moves).toBe(movesBefore);
    expect(engine.state.board[1].open).toBe(false);
  });
});

describe('索引与配置防御', () => {
  it('非整数或越界索引不会布雷、不会开始计时', () => {
    const { engine } = createEngine();
    expect(engine.open('40').status).toBe('ignored');
    expect(engine.open(-1).status).toBe('ignored');
    expect(engine.open(999).status).toBe('ignored');
    expect(engine.chord(1.5).status).toBe('ignored');
    expect(engine.state.minesPlaced).toBe(false);
    expect(engine.state.startedAt).toBeNull();
    expect(countMines(engine.state.board)).toBe(0);
  });

  it('未显式声明 custom 的配置按自定义处理，不污染标准难度记录', () => {
    const { engine } = createEngine();
    engine.newGame({ rows: 12, cols: 12, mines: 20 });
    expect(engine.config.custom).toBe(true);
    expect(engine.config.id).toBe('custom');
  });

  it('1×1 棋盘在配置层就被拒绝，不会拖到点击时才抛错', () => {
    const { engine } = createEngine();
    expect(() => engine.newGame({ rows: 1, cols: 1, mines: 1, custom: true })).toThrow(RangeError);
  });
});

describe('normalizeConfig', () => {
  it('接受难度 id 与自定义配置', () => {
    expect(normalizeConfig('expert')).toMatchObject({ rows: 16, cols: 30, mines: 99 });
    expect(normalizeConfig({ rows: 10, cols: 12, mines: 15, custom: true, label: '自定义' })).toMatchObject({
      rows: 10,
      cols: 12,
      mines: 15,
      custom: true,
      total: 120,
    });
  });

  it('拒绝非法配置，避免产生不可玩的棋盘', () => {
    expect(() => normalizeConfig({ rows: 0, cols: 9, mines: 10 })).toThrow(RangeError);
    expect(() => normalizeConfig({ rows: 9, cols: 9, mines: 0 })).toThrow(RangeError);
    expect(() => normalizeConfig({ rows: 9, cols: 9, mines: 80 })).toThrow(RangeError);
  });

  it('未知难度 id 回退到初级', () => {
    expect(normalizeConfig('does-not-exist').id).toBe('beginner');
  });
});

describe('自定义难度引擎行为', () => {
  it('自定义棋盘可以正常开局、通关并输出自定义结果', () => {
    const { engine } = createEngine();
    engine.newGame({ id: 'custom', label: '自定义', custom: true, rows: 5, cols: 8, mines: 6 });
    expect(engine.state.rows).toBe(5);
    expect(engine.state.cols).toBe(8);
    engine.open(20);
    expect(countMines(engine.state.board)).toBe(6);
    for (let i = 0; i < engine.state.board.length; i += 1) {
      if (!engine.state.board[i].mine) engine.open(i);
    }
    expect(engine.status).toBe(GAME_STATUS.WON);
  });
});
