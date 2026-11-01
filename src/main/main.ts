import { join } from 'node:path';
import { app, BrowserWindow, Notification, shell } from 'electron';
import { GAMES } from '../games/catalog';
import { AccountManager } from './account-manager';
import { Repository } from './repository';

const dataDirectory = process.env.IDLEMANAGER_DATA_DIR;
if (dataDirectory) app.setPath('userData', dataDirectory);

const testing = process.env.IDLEMANAGER_TEST === '1';

function start(): void {
  const window = new BrowserWindow({ width: 1280, height: 800, title: 'IdleManager', backgroundColor: '#0a0c12' });
  // The window's own page holds the interface from Task 9 on; until then it only has to exist.
  void window.loadURL('about:blank');
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
    onChange: () => undefined,
  });
  if (testing) (globalThis as unknown as Record<string, unknown>).idleManagerTest = { manager, openedUrls };
  app.on('before-quit', () => manager.dispose());
  manager.openEnabled();
}

void app.whenReady().then(start);
app.on('window-all-closed', () => app.quit());
