import { join } from 'node:path';
import { app, BrowserWindow, dialog, Notification, powerMonitor, powerSaveBlocker, shell } from 'electron';
import { GAMES } from '../games/catalog';
import { CHANNELS } from '../shared/ipc';
import { AccountManager } from './account-manager';
import { registerIpc } from './ipc';
import { PowerGuard } from './power';
import { Repository } from './repository';
import { hasSystemdInhibit, SleepInhibitor } from './sleep-inhibitor';
import { createTray } from './tray';

const dataDirectory = process.env.IDLEMANAGER_DATA_DIR;
if (dataDirectory) app.setPath('userData', dataDirectory);

const testing = process.env.IDLEMANAGER_TEST === '1';

// The lock is keyed by the data folder, so a second launch finds the first one and only asks it to show itself.
const isFirstInstance = app.requestSingleInstanceLock();
if (!isFirstInstance) app.quit();

// The saved data is not readable: starting over would forget the known nicks and switch off the account
// limit, so the app does not start. The file is left exactly as it was.
function refuseToStart(file: string, error: unknown): void {
  console.error(`IdleManager did not start: the data file ${file} could not be read. ${String(error)}`);
  if (!testing) {
    dialog.showErrorBox(
      'IdleManager não pôde iniciar',
      `Os dados salvos em ${file} estão corrompidos ou incompletos.\n\nO IdleManager não vai abrir para não apagar nada. Corrija ou renomeie o arquivo e abra de novo.`,
    );
  }
  app.exit(1);
}

function createWindow(): BrowserWindow {
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
  return window;
}

function start(): void {
  const dataFile = join(app.getPath('userData'), 'data.json');
  const repository = new Repository(dataFile);
  try {
    repository.read();
  } catch (error) {
    refuseToStart(dataFile, error);
    return;
  }

  const window = createWindow();
  const openedUrls: string[] = [];
  const notifications: { title: string; body: string }[] = [];
  // The sleep-only blocker where systemd is there; otherwise Electron's, which may also keep the screen awake.
  const guard = new PowerGuard(hasSystemdInhibit() ? new SleepInhibitor() : powerSaveBlocker);
  let quitting = false;

  const manager = new AccountManager({
    window,
    repository,
    games: GAMES,
    // Tests record the notification instead of showing it, so they never pop up on a real desktop.
    notify: (title, body) => {
      if (testing) notifications.push({ title, body });
      else new Notification({ title, body }).show();
    },
    openExternal: (url) => {
      if (testing) openedUrls.push(url);
      else void shell.openExternal(url);
    },
    onChange: (view) => {
      guard.update(view.accounts.some((account) => account.status === 'connected'));
      if (!window.isDestroyed()) window.webContents.send(CHANNELS.view, view);
    },
  });
  registerIpc(manager, window);

  const show = (): void => {
    if (window.isMinimized()) window.restore();
    window.show();
    window.focus();
  };
  const quit = (): void => {
    quitting = true;
    app.quit();
  };

  // The close button hides the window: the accounts keep running. Only the tray menu quits for real.
  window.on('close', (event) => {
    if (quitting) return;
    event.preventDefault();
    window.hide();
  });
  app.on('second-instance', show);
  app.on('before-quit', () => {
    quitting = true;
    manager.dispose();
    guard.dispose();
  });
  powerMonitor.on('resume', () => manager.onResume());

  // A tray icon per test run would flicker in the real desktop panel: tests cover the menu on its own.
  if (!testing) createTray(show, quit);
  if (testing) (globalThis as unknown as Record<string, unknown>).idleManagerTest = { manager, openedUrls, notifications, power: guard, quit };

  void window.loadFile(join(__dirname, 'renderer', 'index.html'));
  manager.openEnabled();
}

if (isFirstInstance) void app.whenReady().then(start);
