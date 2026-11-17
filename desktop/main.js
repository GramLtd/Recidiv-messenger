// Recidivist desktop client: the same web app (web/dist built with `vite --mode app`),
// served from a custom app:// protocol so BrowserRouter and absolute asset paths keep working.
const { app, BrowserWindow, Menu, net, protocol, session, shell } = require('electron');
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
  });

  app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') app.quit();
  });
}
