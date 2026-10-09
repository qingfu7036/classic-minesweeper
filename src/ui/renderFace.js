/**
 * 笑脸按钮渲染：只负责把状态映射到视觉，不参与任何游戏规则判断。
 */
const FACE_LABELS = {
  smile: '新游戏',
  oh: '松手快速开格',
  dead: '失败，点击重开',
  win: '胜利，点击重开',
};

export const FACE = {
  SMILE: 'smile',
  OH: 'oh',
  DEAD: 'dead',
  WIN: 'win',
};

export function createFaceRenderer(button) {
  let current = FACE.SMILE;

  function set(next) {
    const value = FACE_LABELS[next] ? next : FACE.SMILE;
    if (value === current && button.dataset.face) return current;
    current = value;
    button.dataset.face = value;
    button.title = FACE_LABELS[value];
    button.setAttribute('aria-label', FACE_LABELS[value]);
    return current;
  }

  function setPressed(pressed) {
    if (pressed) button.dataset.pressed = 'true';
    else delete button.dataset.pressed;
  }

  // 创建时立即同步一次 DOM，保证初始外观与内部状态一致。
  set(FACE.SMILE);

  return {
    set,
    setPressed,
    get() {
      return current;
    },
    labels: FACE_LABELS,
  };
}
