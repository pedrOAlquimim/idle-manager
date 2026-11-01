import { join } from 'node:path';
import { app, BrowserWindow, Notification, shell } from 'electron';
import { GAMES } from '../games/catalog';
import { CHANNELS } from '../shared/ipc';
import { AccountManager } from './account-manager';
import { registerIpc } from './ipc';
import { Repository } from './repository';

const dataDirectory = process.env.IDLEMANAGER_DATA_DIR;
if (dataDirectory) app.setPath('userData', dataDirectory);

const testing = process.env.IDLEMANAGER_TEST === '1';

function start(): void {
  const window = new BrowserWindow({
    width: 1280,
    height: 800,
    minWidth: 1000,
    minHeight: 640,
    title: 'IdleManager',
    backgroundColor: '#0a0c12',
    webPreferences: {
      preload: join(__dirname, 'ui-preload.js'),
      sandbox: true,
      contextIsolation: true,
      nodeIntegration: false,
    },
  });
  // The interface is a local page: nothing dropped on it or linked from it may replace it.
  window.webContents.on('will-navigate', (event) => event.preventDefault());
  const openedUrls: string[] = [];
  const manager = new AccountManager({
    window,
    repository: new Repository(join(app.getPath('userData'), 'data.json')),
    games: GAMES,
    notify: (title, body) => new Notification({ title, body }).show(),
    openExternal: (url) => {
      if (testing) openedUrls.push(url);
      else void shell.openExternal(url);
    },
    onChange: (view) => {
      if (!window.isDestroyed()) window.webContents.send(CHANNELS.view, view);
    },
  });
  registerIpc(manager, window);
  if (testing) (globalThis as unknown as Record<string, unknown>).idleManagerTest = { manager, openedUrls };
  app.on('before-quit', () => manager.dispose());
  void window.loadFile(join(__dirname, 'renderer', 'index.html'));
  manager.openEnabled();
}

void app.whenReady().then(start);
app.on('window-all-closed', () => app.quit());
