'use strict';
// Bridge between the page and the main process. Everything the page can do natively is listed here.
const { contextBridge, ipcRenderer } = require('electron');

function listen(channel, cb) {
  const handler = (_e, payload) => cb(payload);
  ipcRenderer.on(channel, handler);
  return () => ipcRenderer.off(channel, handler);
}

contextBridge.exposeInMainWorld('jungey', {
  info: () => ipcRenderer.invoke('app:info'),
  rec: {
    begin: (id, ext) => ipcRenderer.invoke('rec:begin', { id, ext }),
    chunk: (id, buf) => ipcRenderer.invoke('rec:chunk', id, buf),
    finish: (id, meta) => ipcRenderer.invoke('rec:finish', { id, meta }),
    abort: (id) => ipcRenderer.invoke('rec:abort', id),
  },
  projects: {
    list: () => ipcRenderer.invoke('projects:list'),
    put: (project) => ipcRenderer.invoke('projects:put', project),
    remove: (id) => ipcRenderer.invoke('projects:delete', id),
  },
  videos: {
    list: () => ipcRenderer.invoke('videos:list'),
    rename: (id, title) => ipcRenderer.invoke('videos:rename', id, title),
    remove: (id) => ipcRenderer.invoke('videos:delete', id),
    reveal: (id) => ipcRenderer.invoke('videos:reveal', id),
    openFolder: () => ipcRenderer.invoke('videos:openFolder'),
    saveCopy: (id) => ipcRenderer.invoke('videos:saveCopy', id),
    trim: (args) => ipcRenderer.invoke('videos:trim', args),
  },
  worldBank: (args) => ipcRenderer.invoke('data:worldbank', args),
  onProgress: (cb) => listen('job:progress', cb),
  onPickSource: (cb) => listen('screen:pick', cb),
  pickSource: (id) => ipcRenderer.send('screen:picked', id),
  onShortcut: (cb) => listen('shortcut', cb),
});
