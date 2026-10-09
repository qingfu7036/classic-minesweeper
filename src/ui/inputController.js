/**
 * 鼠标与键盘输入。
 *
 * 交互映射（与「帮助 → 操作说明」中的文案保持一致）：
 *  1. 左键单击未打开格           → 开格（首次点击保证安全）
 *  2. 右键单击未打开格           → 循环标记：未标记 → 红旗 → 问号 → 未标记
 *  3. 按住右键拖动               → 连续标记（每个格子只循环一次）
 *  4. 左键按住已打开数字格再松开 → 快速开格（旗数等于数字时生效，按下时显示预览）
 *  5. 左右键同时按下             → 快速开格
 *  6. 中键单击已打开数字格       → 快速开格
 *  7. 双击已打开数字格           → 快速开格
 * 所有操作都直接进入引擎，UI 只根据引擎返回结果与事件更新。
 */
import { GAME_STATUS, MARK } from '../game/config.js';
import { neighborIndexes } from '../game/boardGenerator.js';

export function createInputController({ board, renderer, engine, face, hooks = {} }) {
  const notify = (payload) => {
    if (typeof hooks.onAction === 'function') hooks.onAction(payload);
  };

  let leftDown = false;
  let rightDown = false;
  let middleDown = false;
  let pressedIndex = null;
  let chordIndex = null;
  let chordDone = false;
  const rightDragMarked = new Set();

  const cellAt = (index) => (index === null ? null : engine.state.board[index] ?? null);

  function syncFace() {
    if (leftDown || rightDown || middleDown) {
      face.set('oh');
      return;
    }
    if (engine.status === GAME_STATUS.LOST) face.set('dead');
    else if (engine.status === GAME_STATUS.WON) face.set('win');
    else face.set('smile');
  }

  function clearPress() {
    pressedIndex = null;
    chordIndex = null;
    chordDone = false;
    renderer.clearPressed();
  }

  function pressSingle(index) {
    pressedIndex = index;
    chordIndex = null;
    renderer.setPressed([index]);
  }

  function pressChord(index) {
    chordIndex = index;
    pressedIndex = null;
    chordDone = false;
    renderer.setPressed(neighborIndexes(index, engine.state.rows, engine.state.cols));
  }

  function markAt(index) {
    const result = engine.mark(index);
    notify({ type: 'mark', index, result });
    return result;
  }

  function openAt(index) {
    const result = engine.open(index);
    notify({ type: 'open', index, result });
    return result;
  }

  function chordAt(index) {
    const result = engine.chord(index);
    notify({ type: 'chord', index, result });
    return result;
  }

  function handleMouseDown(event) {
    const index = renderer.indexFromTarget(event.target);
    if (engine.isLocked()) return;

    if (event.button === 1) {
      event.preventDefault();
      middleDown = true;
      const cell = cellAt(index);
      if (cell && cell.open && cell.adjacent > 0) pressChord(index);
      syncFace();
      return;
    }

    if (event.button === 2) {
      rightDown = true;
      const cell = cellAt(index);
      if (cell && !cell.open) {
        markAt(index);
        rightDragMarked.add(index);
      } else if (cell && cell.open) {
        pressChord(index);
      }
      syncFace();
      return;
    }

    if (event.button !== 0) return;
    leftDown = true;
    const cell = cellAt(index);
    if (cell && cell.open) {
      if (cell.adjacent > 0) pressChord(index);
    } else if (cell && cell.mark !== MARK.FLAG) {
      pressSingle(index);
    }
    syncFace();
  }

  function handleMouseUp(event) {
    const index = renderer.indexFromTarget(event.target);
    if (event.button === 0) leftDown = false;
    else if (event.button === 2) rightDown = false;
    else if (event.button === 1) middleDown = false;

    if (!engine.isLocked()) {
      if (chordIndex !== null && !chordDone && index === chordIndex) {
        chordDone = true;
        chordAt(chordIndex);
      } else if (pressedIndex !== null && index === pressedIndex && event.button === 0) {
        openAt(pressedIndex);
      }
    }

    // 还有其它键按住时保留按下预览：
    // 否则「左键按下 A → 右击 B → 松开 B → 松开 A」会把左键的开格动作静默吞掉。
    if (!leftDown && !rightDown && !middleDown) {
      clearPress();
      rightDragMarked.clear();
    }
    syncFace();
  }

  function handleMouseMove(event) {
    if (engine.isLocked()) return;
    const index = renderer.indexFromTarget(event.target);
    if (index === null) return;

    if (rightDown && !leftDown) {
      if (rightDragMarked.has(index)) return;
      rightDragMarked.add(index);
      const cell = cellAt(index);
      if (cell && !cell.open) markAt(index);
      return;
    }

    if (leftDown && !rightDown) {
      const cell = cellAt(index);
      if (cell && !cell.open && cell.mark !== MARK.FLAG) {
        pressSingle(index);
      } else {
        clearPress();
      }
    }
  }

  function handleDoubleClick(event) {
    const index = renderer.indexFromTarget(event.target);
    if (index === null || engine.isLocked()) return;
    const cell = cellAt(index);
    if (cell && cell.open && cell.adjacent > 0) chordAt(index);
    syncFace();
  }

  function handleContextMenu(event) {
    event.preventDefault();
    event.stopPropagation();
  }

  function moveCursor(delta) {
    const total = engine.state.rows * engine.state.cols;
    if (total === 0) return;
    const current = renderer.getCursor();
    let next;
    if (current === null) next = 0;
    else next = Math.max(0, Math.min(total - 1, current + delta));
    renderer.setCursor(next);
  }

  function activateCursor() {
    const cursor = renderer.getCursor();
    if (cursor === null || engine.isLocked()) return;
    const cell = cellAt(cursor);
    if (!cell) return;
    if (cell.open) {
      if (cell.adjacent > 0) chordAt(cursor);
    } else {
      openAt(cursor);
    }
    syncFace();
  }

  function handleKeyDown(event) {
    // 终局后棋盘完全锁定：方向键光标也不再移动
    if (engine.isLocked()) return;
    const cols = engine.state.cols;
    switch (event.key) {
      case 'ArrowLeft':
        moveCursor(-1);
        break;
      case 'ArrowRight':
        moveCursor(1);
        break;
      case 'ArrowUp':
        moveCursor(-cols);
        break;
      case 'ArrowDown':
        moveCursor(cols);
        break;
      case 'Home':
        renderer.setCursor(0);
        break;
      case 'End':
        renderer.setCursor(engine.state.rows * cols - 1);
        break;
      case ' ':
      case 'Enter':
        activateCursor();
        break;
      case 'f':
      case 'F': {
        const cursor = renderer.getCursor();
        if (cursor !== null && !engine.isLocked()) markAt(cursor);
        break;
      }
      default:
        return;
    }
    event.preventDefault();
  }

  function handleDocumentMouseUp(event) {
    if (!leftDown && !rightDown && !middleDown) return;
    if (renderer.indexFromTarget(event.target) === null) {
      if (event.button === 0) leftDown = false;
      else if (event.button === 2) rightDown = false;
      else if (event.button === 1) middleDown = false;
      clearPress();
      syncFace();
    }
  }

  function resetPress() {
    clearPress();
    leftDown = false;
    rightDown = false;
    middleDown = false;
    rightDragMarked.clear();
    syncFace();
  }

  board.addEventListener('mousedown', handleMouseDown);
  board.addEventListener('mousemove', handleMouseMove);
  board.addEventListener('mouseup', handleMouseUp);
  board.addEventListener('dblclick', handleDoubleClick);
  board.addEventListener('contextmenu', handleContextMenu);
  board.addEventListener('keydown', handleKeyDown);
  document.addEventListener('mouseup', handleDocumentMouseUp);

  return {
    destroy() {
      board.removeEventListener('mousedown', handleMouseDown);
      board.removeEventListener('mousemove', handleMouseMove);
      board.removeEventListener('mouseup', handleMouseUp);
      board.removeEventListener('dblclick', handleDoubleClick);
      board.removeEventListener('contextmenu', handleContextMenu);
      board.removeEventListener('keydown', handleKeyDown);
      document.removeEventListener('mouseup', handleDocumentMouseUp);
    },
    syncFace,
    resetPress,
    /** 供测试与外部程序化调用：模拟一次完整左键点击。 */
    simulateClick(index) {
      openAt(index);
      syncFace();
    },
  };
}
