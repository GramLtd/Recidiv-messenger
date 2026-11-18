// Recidivist desktop client: the same web app (web/dist built with `vite --mode app`),
// served from a custom app:// protocol so BrowserRouter and absolute asset paths keep working.
const { app, BrowserWindow, Menu, net, protocol, session, shell, ipcMain, dialog, nativeImage } = require('electron');
const path = require('node:path');
const fs = require('node:fs');
const { pathToFileURL } = require('node:url');

const SCHEME = 'app';
const HOST = 'recidivist';
const START_URL = `${SCHEME}://${HOST}/`;
const WEB_ROOT = path.join(__dirname, 'web-dist');
const ICON = path.join(__dirname, 'build', 'icon.png');

protocol.registerSchemesAsPrivileged([
  { scheme: SCHEME, privileges: { standard: true, secure: true, supportFetchAPI: true, corsEnabled: true, stream: true } },
]);

if (!app.requestSingleInstanceLock()) {
  app.quit();
} else {
  let win = null;

  app.on('second-instance', () => {
    if (!win) return;
    if (win.isMinimized()) win.restore();
    win.show();
    win.focus();
  });

  const isInternal = (url) => url.startsWith(`${SCHEME}://${HOST}`);
  const openExternal = (url) => {
    if (/^(https?|mailto|tg|ton):/i.test(url)) shell.openExternal(url);
  };

  function serve(request) {
    const { pathname } = new URL(request.url);
    const rel = decodeURIComponent(pathname);
    let file = path.normalize(path.join(WEB_ROOT, rel));
    if (file !== WEB_ROOT && !file.startsWith(WEB_ROOT + path.sep)) return new Response('Forbidden', { status: 403 });
    // SPA fallback: unknown routes (/@user, /join/…, /admin) get index.html
    if (!fs.existsSync(file) || fs.statSync(file).isDirectory()) {
      if (path.extname(rel)) return new Response('Not found', { status: 404 });
      file = path.join(WEB_ROOT, 'index.html');
    }
    return net.fetch(pathToFileURL(file).toString());
  }

  function createWindow() {
    win = new BrowserWindow({
      width: 1200,
      height: 800,
      minWidth: 380,
      minHeight: 560,
      title: 'Recidivist',
      backgroundColor: '#000000',
      icon: ICON,
      autoHideMenuBar: true,
      show: false,
      webPreferences: {
        contextIsolation: true,
        nodeIntegration: false,
        sandbox: true,
        spellcheck: true,
        preload: path.join(__dirname, 'preload.js'),
      },
    });

    win.once('ready-to-show', () => win.show());
    // keep the app title instead of whatever the page sets
    win.on('page-title-updated', (e) => e.preventDefault());

    // target=_blank / window.open → system browser
    win.webContents.setWindowOpenHandler(({ url }) => {
      if (!isInternal(url)) openExternal(url);
      return { action: 'deny' };
    });
    win.webContents.on('will-navigate', (e, url) => {
      if (!isInternal(url)) {
        e.preventDefault();
        openExternal(url);
      }
    });

    win.webContents.on('before-input-event', (_e, input) => {
      const devtools = input.type === 'keyDown' && (input.key === 'F12' || ((input.control || input.meta) && input.shift && input.key.toLowerCase() === 'i'));
      if (devtools) win.webContents.toggleDevTools();
    });

    win.on('closed', () => { win = null; });
    win.loadURL(START_URL);
  }

  app.whenReady().then(() => {
    protocol.handle(SCHEME, serve);

    // microphone / camera (voice messages, avatars), notifications, clipboard
    const allowed = new Set(['media', 'notifications', 'clipboard-read', 'clipboard-sanitized-write', 'fullscreen', 'mediaKeySystem']);
    session.defaultSession.setPermissionRequestHandler((_wc, permission, cb) => cb(allowed.has(permission)));
    session.defaultSession.setPermissionCheckHandler((_wc, permission) => allowed.has(permission));

    if (process.platform === 'darwin') {
      Menu.setApplicationMenu(Menu.buildFromTemplate([
        { role: 'appMenu' }, { role: 'editMenu' }, { role: 'viewMenu' }, { role: 'windowMenu' },
      ]));
    } else {
      Menu.setApplicationMenu(null);
    }

    createWindow();
    app.on('activate', () => { if (!BrowserWindow.getAllWindows().length) createWindow(); });

    ipcMain.on('badge', (_e, n) => setBadge(n));
    ipcMain.handle('app:version', () => app.getVersion());
    ipcMain.handle('updates:check', () => checkUpdates(true));
    if (app.isPackaged) {
      setTimeout(() => checkUpdates(false), 8000);
      setInterval(() => checkUpdates(false), 3 * 60 * 60 * 1000);
    }
  });

  // ---------- unread badge (dock on macOS / Linux launchers, overlay icon on the Windows taskbar) ----------
  function setBadge(n) {
    try {
      if (process.platform === 'win32') {
        if (!win) return;
        if (!n) { win.setOverlayIcon(null, ''); return; }
        const label = n > 99 ? '99+' : String(n);
        const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="32" height="32"><circle cx="16" cy="16" r="16" fill="#ff2d3d"/><text x="16" y="21.5" font-family="Segoe UI,Arial" font-size="${label.length > 2 ? 12 : 16}" font-weight="700" fill="#fff" text-anchor="middle">${label}</text></svg>`;
        win.setOverlayIcon(nativeImage.createFromDataURL(`data:image/svg+xml;base64,${Buffer.from(svg).toString('base64')}`), `${label} непрочитанных`);
      } else {
        app.setBadgeCount(n);
      }
    } catch {}
  }

  // ---------- auto-update ----------
  // Installers live in the public GitHub release "latest". The Windows installer (NSIS) and the Linux AppImage
  // update themselves; the portable .exe and the unsigned macOS app can't be replaced in place, so they get a
  // "new version — download" prompt instead.
  const FEED = 'https://github.com/GramLtd/Recidiv-messenger/releases/download/latest';
  const DOWNLOAD_PAGE = 'https://github.com/GramLtd/Recidiv-messenger/releases/tag/latest';
  const canSelfUpdate = () => (process.platform === 'win32' && !process.env.PORTABLE_EXECUTABLE_DIR) || (process.platform === 'linux' && !!process.env.APPIMAGE);
  let updater = null;
  let prompted = false;
  const status = (info) => win?.webContents.send('updates:status', info);
  const newer = (a, b) => {
    const pa = String(a).split('.').map(Number); const pb = String(b).split('.').map(Number);
    for (let i = 0; i < 3; i++) { if ((pa[i] || 0) !== (pb[i] || 0)) return (pa[i] || 0) > (pb[i] || 0); }
    return false;
  };

  async function checkUpdates(manual) {
    if (!app.isPackaged) return { state: 'dev' };
    try {
      if (canSelfUpdate()) {
        if (!updater) {
          ({ autoUpdater: updater } = require('electron-updater'));
          updater.setFeedURL({ provider: 'generic', url: FEED });
          updater.autoDownload = true;
          updater.autoInstallOnAppQuit = true;
          updater.on('update-available', (i) => status({ state: 'downloading', version: i.version }));
          updater.on('download-progress', (p) => status({ state: 'downloading', percent: Math.round(p.percent) }));
          updater.on('update-not-available', () => status({ state: 'latest' }));
          updater.on('error', (e) => status({ state: 'error', message: String(e?.message || e) }));
          updater.on('update-downloaded', async (i) => {
            status({ state: 'ready', version: i.version });
            if (prompted) return;
            prompted = true;
            const r = await dialog.showMessageBox(win, { type: 'info', buttons: ['Перезапустить', 'Позже'], defaultId: 0, cancelId: 1, title: 'Обновление Recidivist', message: `Версия ${i.version} загружена`, detail: 'Перезапустите программу, чтобы установить обновление. Иначе оно установится при следующем закрытии.' });
            if (r.response === 0) updater.quitAndInstall();
          });
        }
        const r = await updater.checkForUpdates();
        return { state: r?.updateInfo && newer(r.updateInfo.version, app.getVersion()) ? 'downloading' : 'latest', version: r?.updateInfo?.version };
      }
      // manual path: read the feed's version and offer the download page
      // every platform is built from the same CI run, so any feed file carries the current version
      const files = [process.platform === 'darwin' ? 'latest-mac.yml' : process.platform === 'linux' ? 'latest-linux.yml' : 'latest.yml', 'latest.yml'];
      let version = null;
      for (const f of files) {
        const res = await net.fetch(`${FEED}/${f}`).catch(() => null);
        if (res?.ok) { version = ((await res.text()).match(/^version:\s*(.+)$/m) || [])[1]?.trim(); if (version) break; }
      }
      if (!version) throw new Error('нет данных об обновлении');
      if (version && newer(version, app.getVersion())) {
        status({ state: 'available', version });
        if (!prompted || manual) {
          prompted = true;
          const r = await dialog.showMessageBox(win, { type: 'info', buttons: ['Скачать', 'Позже'], defaultId: 0, cancelId: 1, title: 'Обновление Recidivist', message: `Доступна версия ${version}`, detail: `У вас ${app.getVersion()}. Скачайте новую версию и установите её поверх текущей.` });
          if (r.response === 0) shell.openExternal(DOWNLOAD_PAGE);
        }
        return { state: 'available', version };
      }
      status({ state: 'latest' });
      return { state: 'latest', version: app.getVersion() };
    } catch (e) {
      status({ state: 'error', message: String(e?.message || e) });
      return { state: 'error', message: String(e?.message || e) };
    }
  }

  app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') app.quit();
  });
}
