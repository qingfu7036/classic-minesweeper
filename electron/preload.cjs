/**
 * preload：以最小权限向渲染进程暴露桌面能力。
 * 只提供具名方法，绝不暴露 ipcRenderer 本身或任何 Node.js API。
 */
'use strict';

const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('desktop', {
  isDesktop: true,
  platform: process.platform,

  /** 最小化窗口。 */
  minimize: () => ipcRenderer.invoke('window:minimize'),
  /** 切换最大化 / 还原。 */
  toggleMaximize: () => ipcRenderer.invoke('window:toggle-maximize'),
  /** 关闭窗口（应用随之退出）。 */
  closeWindow: () => ipcRenderer.invoke('window:close'),
  /** 请求把窗口调整到指定内容尺寸（会被工作区大小裁剪）。 */
  fitWindow: (width, height) => ipcRenderer.invoke('window:fit-content', { width, height }),
  /** 只读的应用与运行时信息。 */
  getAppInfo: () => ipcRenderer.invoke('app:info'),

  /** 订阅窗口最大化状态（返回取消订阅函数）。 */
  onWindowState: (handler) => {
    if (typeof handler !== 'function') return () => {};
    const listener = (_event, state) => handler(state);
    ipcRenderer.on('window:state', listener);
    return () => ipcRenderer.removeListener('window:state', listener);
  },
});
