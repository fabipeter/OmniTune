// OmniTune desktop shell (macOS + Windows). Wraps the web app in Electron and adds
// native integrations: media keys, tray controls, window chrome, single instance.
const { app, BrowserWindow, Menu, Tray, globalShortcut, ipcMain, nativeImage, shell, nativeTheme } = require('electron');
const path = require('node:path');

const isMac = process.platform === 'darwin';

/** Allow only loopback http://localhost:<port> for dev mode. */
function parseSafeDevUrl(raw) {
  if (!raw) return null;
  try {
    const u = new URL(raw);
    if (u.protocol === 'http:' && (u.hostname === 'localhost' || u.hostname === '127.0.0.1')) {
      return u.toString();
    }
  } catch {
    /* ignore invalid URL */
  }
  return null;
}

/** Allow only https:// or http:// when opening external links in the OS browser. */
function safeOpenExternal(rawUrl) {
  try {
    const u = new URL(rawUrl);
    if (u.protocol === 'https:' || u.protocol === 'http:') {
      void shell.openExternal(u.toString());
    }
  } catch {
    /* ignore invalid URL */
  }
}

const DEV_URL = parseSafeDevUrl(process.env.OMNITUNE_DEV_URL);
const DEV_ORIGIN = DEV_URL ? new URL(DEV_URL).origin : null;

let win = null;
let tray = null;
let quitting = false;
let nowPlaying = { title: 'OmniTune', playing: false };

if (!app.requestSingleInstanceLock()) {
  app.quit();
}
app.on('second-instance', () => {
  if (win) {
    if (win.isMinimized()) win.restore();
    win.show();
    win.focus();
  }
});

function send(action) {
  if (win && !win.isDestroyed()) win.webContents.send('omnitune:media', action);
}

function isInternalNavigation(rawUrl) {
  try {
    const u = new URL(rawUrl);
    if (DEV_ORIGIN) return u.origin === DEV_ORIGIN;
    if (u.protocol === 'file:') {
      const distRoot = path.resolve(__dirname, 'web-dist');
      const target = path.resolve(decodeURIComponent(u.pathname));
      return target.startsWith(distRoot);
    }
    return false;
  } catch {
    return false;
  }
}

function createWindow() {
  nativeTheme.themeSource = 'dark';
  win = new BrowserWindow({
    width: 1360,
    height: 860,
    minWidth: 900,
    minHeight: 620,
    backgroundColor: '#070D1B',
    title: 'OmniTune',
    show: false,
    ...(isMac
      ? { titleBarStyle: 'hiddenInset', trafficLightPosition: { x: 16, y: 16 } }
      : { titleBarStyle: 'hidden', titleBarOverlay: { color: '#070D1B', symbolColor: '#F4F7FF', height: 40 } }),
    webPreferences: {
      preload: path.join(__dirname, 'preload.cjs'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      webSecurity: true,
      allowRunningInsecureContent: false,
      autoplayPolicy: 'no-user-gesture-required',
    },
  });

  win.once('ready-to-show', () => win.show());

  if (DEV_URL) win.loadURL(DEV_URL);
  else win.loadFile(path.join(__dirname, 'web-dist', 'index.html'));

  // External links open in the default browser (https/http only), never inside the app.
  win.webContents.setWindowOpenHandler(({ url }) => {
    safeOpenExternal(url);
    return { action: 'deny' };
  });
  win.webContents.on('will-navigate', (e, url) => {
    if (!isInternalNavigation(url)) {
      e.preventDefault();
      safeOpenExternal(url);
    }
  });

  // Closing the window on macOS keeps music playing in the background.
  win.on('close', (e) => {
    if (!quitting && isMac) {
      e.preventDefault();
      win.hide();
    }
  });
}

function buildTrayMenu() {
  return Menu.buildFromTemplate([
    { label: nowPlaying.title, enabled: false },
    { type: 'separator' },
    { label: nowPlaying.playing ? 'Pause' : 'Play', click: () => send('toggle') },
    { label: 'Next', click: () => send('next') },
    { label: 'Previous', click: () => send('previous') },
    { type: 'separator' },
    { label: 'Show OmniTune', click: () => { win.show(); win.focus(); } },
    { label: 'Quit', click: () => { quitting = true; app.quit(); } },
  ]);
}

function createTray() {
  const icon = nativeImage.createFromPath(path.join(__dirname, 'build', isMac ? 'trayTemplate.png' : 'tray.png'));
  tray = new Tray(icon.isEmpty() ? nativeImage.createEmpty() : icon);
  tray.setToolTip('OmniTune');
  tray.setContextMenu(buildTrayMenu());
  tray.on('click', () => {
    if (!isMac) {
      win.show();
      win.focus();
    }
  });
}

function buildAppMenu() {
  const template = [
    ...(isMac ? [{ role: 'appMenu' }] : []),
    { role: 'fileMenu' },
    { role: 'editMenu' },
    {
      label: 'Playback',
      submenu: [
        { label: 'Play / Pause', accelerator: 'Space', registerAccelerator: false, click: () => send('toggle') },
        { label: 'Next', accelerator: 'CmdOrCtrl+Right', click: () => send('next') },
        { label: 'Previous', accelerator: 'CmdOrCtrl+Left', click: () => send('previous') },
        { label: 'Volume Up', accelerator: 'CmdOrCtrl+Up', click: () => send('volume-up') },
        { label: 'Volume Down', accelerator: 'CmdOrCtrl+Down', click: () => send('volume-down') },
        { label: 'Shuffle', accelerator: 'CmdOrCtrl+S', click: () => send('shuffle') },
        { label: 'Repeat', accelerator: 'CmdOrCtrl+R', click: () => send('repeat') },
      ],
    },
    { role: 'viewMenu' },
    { role: 'windowMenu' },
  ];
  Menu.setApplicationMenu(Menu.buildFromTemplate(template));
}

app.whenReady().then(() => {
  createWindow();
  buildAppMenu();
  createTray();

  const keys = { MediaPlayPause: 'toggle', MediaNextTrack: 'next', MediaPreviousTrack: 'previous', MediaStop: 'pause' };
  for (const [accel, action] of Object.entries(keys)) globalShortcut.register(accel, () => send(action));

  app.on('activate', () => {
    if (!win || win.isDestroyed()) createWindow();
    else win.show();
  });
});

ipcMain.on('omnitune:now-playing', (event, info) => {
  if (!win || event.sender !== win.webContents) return;
  const safeTitle = String(info?.title ?? 'OmniTune').slice(0, 120);
  nowPlaying = { title: safeTitle, playing: !!info?.playing };
  if (tray) {
    tray.setContextMenu(buildTrayMenu());
    tray.setToolTip(nowPlaying.title);
  }
  if (!win.isDestroyed()) win.setTitle(nowPlaying.playing ? nowPlaying.title : 'OmniTune');
});

app.on('before-quit', () => {
  quitting = true;
});
app.on('will-quit', () => globalShortcut.unregisterAll());
app.on('window-all-closed', () => {
  if (!isMac) app.quit();
});
