/**
 * 极简 DOM 构建工具，避免在各 UI 模块里散落 createElement 噪音。
 */

/**
 * @param {string} tag 例如 'div'、'button.btn.btn--primary'
 * @param {object} [props] 属性；`dataset` 用于 data-*，`on` 用于事件，`text` 设置文本
 * @param {Array<Node|string>} [children]
 */
export function el(tag, props = {}, children = []) {
  const [name, ...classes] = tag.split('.');
  const node = document.createElement(name || 'div');
  if (classes.length > 0) node.className = classes.join(' ');

  for (const [key, value] of Object.entries(props)) {
    if (value === undefined || value === null || value === false) continue;
    if (key === 'text') {
      node.textContent = String(value);
    } else if (key === 'html') {
      node.innerHTML = value;
    } else if (key === 'dataset') {
      for (const [dataKey, dataValue] of Object.entries(value)) {
        if (dataValue === undefined || dataValue === null) continue;
        node.dataset[dataKey] = String(dataValue);
      }
    } else if (key === 'on') {
      for (const [eventName, handler] of Object.entries(value)) {
        node.addEventListener(eventName, handler);
      }
    } else if (key === 'style' && typeof value === 'object') {
      for (const [styleKey, styleValue] of Object.entries(value)) {
        node.style.setProperty(styleKey, String(styleValue));
      }
    } else if (value === true) {
      node.setAttribute(key, '');
    } else {
      node.setAttribute(key, String(value));
    }
  }

  for (const child of [].concat(children)) {
    if (child === null || child === undefined) continue;
    node.append(typeof child === 'string' ? document.createTextNode(child) : child);
  }
  return node;
}

export function clear(node) {
  while (node.firstChild) node.removeChild(node.firstChild);
  return node;
}
