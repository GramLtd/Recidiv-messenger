// Small, explicit bridge for the web app: unread badge, desktop notifications, update status.
const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('recidivist', {
  desktop: true,
  platform: process.platform,
  setBadge: (n) => ipcRenderer.send('badge', Number(n) || 0),
  checkUpdates: () => ipcRenderer.invoke('updates:check'),
  onUpdate: (cb) => {
    const h = (_e, info) => cb(info);
    ipcRenderer.on('updates:status', h);
    return () => ipcRenderer.removeListener('updates:status', h);
  },
  version: () => ipcRenderer.invoke('app:version'),
});
