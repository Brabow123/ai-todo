const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('xd', {
  act: async (name, ...args) => {
    const r = await ipcRenderer.invoke('act', name, ...args);
    if (r && r.__error) { const e = new Error(r.__error); e.kind = r.kind; throw e; }
    return r;
  },
  on: (ch, fn) => ipcRenderer.on(ch, (_e, v) => fn(v)),
});
