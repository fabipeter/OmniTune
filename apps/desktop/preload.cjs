const { contextBridge, ipcRenderer } = require('electron');

// Narrow, explicit bridge: the web app detects the desktop shell via `window.omnitune`.
contextBridge.exposeInMainWorld('omnitune', {
  isDesktop: true,
  platform: process.platform, // 'darwin' | 'win32'
  /** Subscribe to native media keys / menu shortcuts. Returns an unsubscribe function. */
  onMedia(callback) {
    const handler = (_e, action) => callback(action);
    ipcRenderer.on('omnitune:media', handler);
    return () => ipcRenderer.removeListener('omnitune:media', handler);
  },
  /** Tell the tray/menu what is playing. */
  setNowPlaying(info) {
    ipcRenderer.send('omnitune:now-playing', { title: String(info?.title ?? ''), playing: !!info?.playing });
  },
});
