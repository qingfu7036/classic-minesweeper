/**
 * 轻量提示浮层（成就解锁、一般信息提示）。
 * 只负责展示，不改变游戏状态。
 */
import { el } from './dom.js';

export function createNotifier({ container, now = () => Date.now() } = {}) {
  const live = [];

  function remove(entry) {
    const index = live.indexOf(entry);
    if (index === -1) return;
    live.splice(index, 1);
    entry.element.classList.add('toast--leaving');
    const cleanup = () => entry.element.remove();
    if (entry.timer) clearTimeout(entry.timer);
    setTimeout(cleanup, 180);
  }

  /**
   * @param {{title:string, text?:string, kind?:'info'|'achievement', duration?:number}} options
   */
  function toast({ title, text = '', kind = 'info', duration = 3400 }) {
    const element = el(`div.toast.toast--${kind}`, { role: 'status' }, [
      el('span.toast__icon', { 'aria-hidden': 'true' }),
      el('div.toast__body', {}, [
        el('div.toast__title', { text: title }),
        text ? el('div.toast__text', { text }) : null,
      ]),
    ]);
    const entry = { element, timer: null, createdAt: now() };
    container.appendChild(element);
    if (duration > 0) {
      entry.timer = setTimeout(() => remove(entry), duration);
    }
    live.push(entry);
    return {
      dismiss: () => remove(entry),
      element,
    };
  }

  function achievement(def) {
    return toast({
      title: `成就解锁：${def.name}`,
      text: def.description,
      kind: 'achievement',
      duration: 5200,
    });
  }

  return {
    toast,
    achievement,
    clear() {
      for (const entry of [...live]) remove(entry);
    },
    get count() {
      return live.length;
    },
  };
}
