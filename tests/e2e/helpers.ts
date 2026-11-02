import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { createServer } from 'node:http';
import type { Server } from 'node:http';
import { createRequire } from 'node:module';
import type { AddressInfo } from 'node:net';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { expect } from 'vitest';
import { _electron } from 'playwright-core';
import type { ElectronApplication, Page } from 'playwright-core';
import type { AccountManager } from '../../src/main/account-manager';
import { INITIAL_DATA } from '../../src/shared/schemas';
import { accountId, gameId } from '../../src/shared/types';
import { CHANNELS } from '../../src/shared/ipc';
import type { ManagerCommand } from '../../src/shared/ipc';
import type { AccountId, AccountStatus, AccountView, AppData, AppView, Rect, StoredAccount, NewGameError, NewGameInput } from '../../src/shared/types';

interface TestHook {
  manager: AccountManager;
  openedUrls: string[];
  notifications: { title: string; body: string }[];
  power: { active: boolean };
  quit(): void;
}


const PROJECT_ROOT = join(import.meta.dirname, '..', '..');
const FAKE_GAME = readFileSync(join(import.meta.dirname, 'fake-game.html'));

// Every app this run started that has not been closed yet, so none can outlive the run.
const running = new Map<number, string>();
const CLOSE_TIMEOUT_MS = 10000;

export function killLeftovers(): void {
  for (const [pid, testName] of running) {
    console.error(`e2e: the app of "${testName}" was still running at the end of the file; killing pid ${pid}`);
    try {
      process.kill(pid, 'SIGKILL');
    } catch {
      // Already gone.
    }
  }
  running.clear();
}

export const account = (id: string, partial: Partial<StoredAccount> = {}): StoredAccount => ({
  id: accountId(id),
  gameId: gameId('pokeidle'),
  name: id,
  enabled: true,
  muted: true,
  nick: null,
  ...partial,
});

export const dataWith = (...accounts: StoredAccount[]): AppData => ({
  ...INITIAL_DATA,
  games: [{ id: gameId('pokeidle'), name: 'PokeIdle', startUrl: 'https://pokeidle.io/app' }],
  accounts,
  preferences: { ...INITIAL_DATA.preferences, selectedId: accounts[0]?.id ?? null },
});

export interface ScreenPlacement {
  bounds: Rect;
  visible: boolean;
}

type KeyModifier = 'control' | 'shift' | 'alt';

export interface DetachedState {
  windows: number;
  inOwnWindow: boolean;
  bounds: Rect | null;
  content: Rect | null;
  zoom: number | null;
}

export interface OtherSite {
  url: string;
  port: number;
  close(): void;
}

// A second site, on its own loopback address: the app must take it for another host.
export async function serveOtherSite(): Promise<OtherSite> {
  const server = createServer((_request, response) => {
    response.setHeader('content-type', 'text/html');
    response.end('<!doctype html><title>Outro jogo</title><h1>Outro jogo</h1>');
  });
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.2', resolve));
  const { port } = server.address() as AddressInfo;
  return {
    url: `http://127.0.0.2:${port}/`,
    port,
    close() {
      server.closeAllConnections();
      server.close();
    },
  };
}

export interface TestApp {
  app: ElectronApplication;
  createGame(input: NewGameInput): Promise<NewGameError | null>;
  dataDir: string;
  gamePort: number;
  hideWindow(): Promise<void>;
  windowVisible(): Promise<boolean>;
  windowCount(): Promise<number>;
  quitApp(): Promise<void>;
  notifications(): Promise<{ title: string; body: string }[]>;
  powerActive(): Promise<boolean>;
  emitResume(): Promise<number>;
  detachedState(id: string): Promise<DetachedState>;
  closeDetached(id: string): Promise<void>;
  mainProcessErrors(): string[];
  ui(): Promise<Page>;
  viewBounds(id: string): Promise<ScreenPlacement | null>;
  pressInWindow(key: string, modifiers?: KeyModifier[]): Promise<void>;
  pressInView(id: string, key: string, modifiers?: KeyModifier[]): Promise<void>;
  closeWindow(): Promise<void>;
  resizeWindow(width: number, height: number): Promise<void>;
  exited(timeoutMs: number): Promise<boolean>;
  view(): Promise<AppView>;
  accountView(id: string): Promise<AccountView>;
  execute(command: ManagerCommand): Promise<void>;
  isMuted(id: string): Promise<boolean | null>;
  enableAll(game: string): Promise<void>;
  disableAll(game: string): Promise<void>;
  requestRename(id: string): Promise<void>;
  removeAccount(id: string): Promise<void>;
  openedUrls(): Promise<string[]>;
  hasPage(id: string): Promise<boolean>;
  inPage<T>(id: string, script: string): Promise<T>;
  crash(id: string): Promise<void>;
  focus(id: string): Promise<void>;
  clickAt(id: string, x: number, y: number): Promise<void>;
  waitForStatus(id: string, status: AccountStatus, timeoutMs?: number): Promise<void>;
  waitFor(check: () => Promise<boolean>, timeoutMs?: number): Promise<void>;
  storedData(): AppData;
  close(): Promise<void>;
}

async function serveFakeGame(port = 0): Promise<Server> {
  const server = createServer((request, response) => {
    if (request.url === '/redirect') {
      response.writeHead(302, { location: 'https://example.com/' });
      response.end();
      return;
    }
    if (request.url === '/file.bin') {
      response.setHeader('content-type', 'application/octet-stream');
      response.setHeader('content-disposition', 'attachment; filename="file.bin"');
      response.end('not a real program');
      return;
    }
    response.setHeader('content-type', 'text/html');
    response.end(FAKE_GAME);
  });
  await new Promise<void>((resolve) => server.listen(port, '127.0.0.1', resolve));
  return server;
}

// `dataDir` reopens a folder the caller owns, and `port` keeps the game's origin, whose storage holds the login.
export async function launchApp(options: { data?: AppData; dataDir?: string; port?: number } = {}): Promise<TestApp> {
  const server = await serveFakeGame(options.port);
  const { port } = server.address() as AddressInfo;
  const dataDir = options.dataDir ?? mkdtempSync(join(tmpdir(), 'idlemanager-e2e-'));
  if (options.data !== undefined) writeFileSync(join(dataDir, 'data.json'), JSON.stringify(options.data));

  const electronBinary = createRequire(import.meta.url)('electron') as unknown as string;
  const app = await _electron.launch({
    executablePath: electronBinary,
    args: [PROJECT_ROOT],
    cwd: PROJECT_ROOT,
    env: {
      ...process.env,
      IDLEMANAGER_DATA_DIR: dataDir,
      IDLEMANAGER_GAME_URL: `http://127.0.0.1:${port}/`,
      IDLEMANAGER_TEST: '1',
    },
  });

  const view = (): Promise<AppView> =>
    app.evaluate(() => (globalThis as unknown as { idleManagerTest: TestHook }).idleManagerTest.manager.view());

  const pid = app.process().pid;
  const testName = expect.getState().currentTestName ?? 'unknown test';
  if (pid !== undefined) running.set(pid, testName);

  const errors: string[] = [];
  app.process().stderr?.on('data', (chunk: Buffer) => {
    for (const line of String(chunk).split('\n')) {
      if (/Uncaught|UnhandledPromiseRejection|TypeError|ReferenceError|Object has been destroyed/.test(line)) errors.push(line);
    }
  });

  const exit = new Promise<void>((resolve) => {
    app.process().once('exit', () => resolve());
  });

  const testApp: TestApp = {
    app,
    view,
    mainProcessErrors: () => errors,
    dataDir,
    gamePort: port,
    createGame: async (input) => (await testApp.ui()).evaluate((value) => window.idleManager.createGame(value), input),
    hideWindow: () =>
      app.evaluate(({ BrowserWindow }) => {
        BrowserWindow.getAllWindows()[0]?.hide();
      }),
    windowVisible: () => app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0]?.isVisible() ?? false),
    windowCount: () => app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows().length),
    quitApp: () =>
      app.evaluate(() => {
        (globalThis as unknown as { idleManagerTest: TestHook }).idleManagerTest.quit();
      }),
    notifications: () =>
      app.evaluate(() => [...(globalThis as unknown as { idleManagerTest: TestHook }).idleManagerTest.notifications]),
    powerActive: () =>
      app.evaluate(() => (globalThis as unknown as { idleManagerTest: TestHook }).idleManagerTest.power.active),
    emitResume: () =>
      app.evaluate(({ powerMonitor }) => {
        const manager = (globalThis as unknown as { idleManagerTest: TestHook }).idleManagerTest.manager;
        const original = manager.onResume.bind(manager);
        let calls = 0;
        manager.onResume = () => {
          calls += 1;
          original();
        };
        powerMonitor.emit('resume');
        manager.onResume = original;
        return calls;
      }),
    detachedState: (id) =>
      app.evaluate(({ BaseWindow, BrowserWindow }, target) => {
        const test = (globalThis as unknown as { idleManagerTest: TestHook }).idleManagerTest;
        const contents = test.manager.webContentsOf(target as AccountId);
        const windows = BaseWindow.getAllWindows();
        const own = windows.find(
          (win) => !(win instanceof BrowserWindow) && win.contentView.children.some((child) => (child as { webContents?: unknown }).webContents === contents),
        );
        const view = own?.contentView.children.find((child) => (child as { webContents?: unknown }).webContents === contents);
        return {
          windows: windows.length,
          inOwnWindow: own !== undefined,
          bounds: view?.getBounds() ?? null,
          content: own?.getContentBounds() ?? null,
          zoom: contents?.getZoomFactor() ?? null,
        };
      }, id),
    closeDetached: (id) =>
      app.evaluate(({ BaseWindow, BrowserWindow }, target) => {
        const test = (globalThis as unknown as { idleManagerTest: TestHook }).idleManagerTest;
        const contents = test.manager.webContentsOf(target as AccountId);
        const own = BaseWindow.getAllWindows().find(
          (win) => !(win instanceof BrowserWindow) && win.contentView.children.some((child) => (child as { webContents?: unknown }).webContents === contents),
        );
        own?.close();
      }, id),
    async ui() {
      const deadline = Date.now() + 5000;
      while (Date.now() < deadline) {
        const page = app.windows().find((candidate) => candidate.url().endsWith('/renderer/index.html'));
        if (page !== undefined) {
          await page.locator('.app').waitFor({ timeout: 5000 });
          return page;
        }
        await new Promise((resolve) => setTimeout(resolve, 50));
      }
      throw new Error('the interface page never appeared');
    },
    viewBounds: (id) =>
      app.evaluate(({ BrowserWindow }, target) => {
        const test = (globalThis as unknown as { idleManagerTest: TestHook }).idleManagerTest;
        const contents = test.manager.webContentsOf(target as AccountId);
        const children = BrowserWindow.getAllWindows()[0]?.contentView.children ?? [];
        const view = children.find((child) => (child as { webContents?: unknown }).webContents === contents);
        return view === undefined || contents === null ? null : { bounds: view.getBounds(), visible: view.getVisible() };
      }, id),
    pressInWindow: (key, modifiers = []) =>
      app.evaluate(
        ({ BrowserWindow }, { keyCode, held }) => {
          const contents = BrowserWindow.getAllWindows()[0]?.webContents;
          contents?.focus();
          contents?.sendInputEvent({ type: 'keyDown', keyCode, modifiers: held });
          contents?.sendInputEvent({ type: 'keyUp', keyCode, modifiers: held });
        },
        { keyCode: key, held: modifiers },
      ),
    pressInView: (id, key, modifiers = []) =>
      app.evaluate(
        (_electron, { target, keyCode, held }) => {
          const test = (globalThis as unknown as { idleManagerTest: TestHook }).idleManagerTest;
          const contents = test.manager.webContentsOf(target as AccountId);
          contents?.focus();
          contents?.sendInputEvent({ type: 'keyDown', keyCode, modifiers: held });
          contents?.sendInputEvent({ type: 'keyUp', keyCode, modifiers: held });
        },
        { target: id, keyCode: key, held: modifiers },
      ),
    closeWindow: () =>
      app.evaluate(({ BrowserWindow }) => {
        BrowserWindow.getAllWindows()[0]?.close();
      }),
    resizeWindow: (width, height) =>
      app.evaluate(
        ({ BrowserWindow }, size) => {
          BrowserWindow.getAllWindows()[0]?.setSize(size.width, size.height);
        },
        { width, height },
      ),
    exited: (timeoutMs) =>
      Promise.race([
        exit.then(() => true),
        new Promise<boolean>((resolve) => setTimeout(() => resolve(false), timeoutMs)),
      ]),
    async accountView(id) {
      const found = (await view()).accounts.find((candidate) => candidate.id === id);
      if (found === undefined) throw new Error(`no account ${id}`);
      return found;
    },
    execute: (command) =>
      app.evaluate((_electron, payload) => {
        (globalThis as unknown as { idleManagerTest: TestHook }).idleManagerTest.manager.execute(payload);
      }, command),
    isMuted: (id) =>
      app.evaluate(
        (_electron, target) =>
          (globalThis as unknown as { idleManagerTest: TestHook }).idleManagerTest.manager
            .webContentsOf(target as AccountId)
            ?.isAudioMuted() ?? null,
        id,
      ),
    enableAll: (game) =>
      app.evaluate((_electron, target) => {
        (globalThis as unknown as { idleManagerTest: TestHook }).idleManagerTest.manager.enableAll(target as never);
      }, game),
    disableAll: (game) =>
      app.evaluate((_electron, target) => {
        (globalThis as unknown as { idleManagerTest: TestHook }).idleManagerTest.manager.disableAll(target as never);
      }, game),
    requestRename: (id) =>
      app.evaluate(
        ({ BrowserWindow }, { channel, target }) => {
          BrowserWindow.getAllWindows()[0]?.webContents.send(channel, target);
        },
        { channel: CHANNELS.renameRequest, target: id },
      ),
    removeAccount: (id) =>
      app.evaluate(async (_electron, target) => {
        const test = (globalThis as unknown as { idleManagerTest: TestHook }).idleManagerTest;
        await test.manager.removeAccount(target as AccountId);
      }, id),
    openedUrls: () =>
      app.evaluate(() => [...(globalThis as unknown as { idleManagerTest: TestHook }).idleManagerTest.openedUrls]),
    hasPage: (id) =>
      app.evaluate(
        (_electron, target) =>
          (globalThis as unknown as { idleManagerTest: TestHook }).idleManagerTest.manager.webContentsOf(target as AccountId) !== null,
        id,
      ),
    inPage: <T>(id: string, script: string): Promise<T> =>
      app.evaluate(
        (_electron, { target, code }) => {
          const test = (globalThis as unknown as { idleManagerTest: TestHook }).idleManagerTest;
          const contents = test.manager.webContentsOf(target as AccountId);
          if (contents === null) throw new Error(`no page for ${target}`);
          return contents.executeJavaScript(code) as Promise<T>;
        },
        { target: id, code: script },
      ),
    crash: (id) =>
      app.evaluate((_electron, target) => {
        const test = (globalThis as unknown as { idleManagerTest: TestHook }).idleManagerTest;
        test.manager.webContentsOf(target as AccountId)?.forcefullyCrashRenderer();
      }, id),
    focus: (id) =>
      app.evaluate((_electron, target) => {
        const test = (globalThis as unknown as { idleManagerTest: TestHook }).idleManagerTest;
        test.manager.webContentsOf(target as AccountId)?.focus();
      }, id),
    clickAt: (id, x, y) =>
      app.evaluate(
        (_electron, { target, left, top }) => {
          const test = (globalThis as unknown as { idleManagerTest: TestHook }).idleManagerTest;
          const contents = test.manager.webContentsOf(target as AccountId);
          contents?.sendInputEvent({ type: 'mouseDown', x: left, y: top, button: 'left', clickCount: 1 });
          contents?.sendInputEvent({ type: 'mouseUp', x: left, y: top, button: 'left', clickCount: 1 });
        },
        { target: id, left: x, top: y },
      ),
    async waitFor(check, timeoutMs = 30000) {
      const deadline = Date.now() + timeoutMs;
      for (;;) {
        if (await check()) return;
        if (Date.now() > deadline) throw new Error('condition not met in time');
        await new Promise((resolve) => setTimeout(resolve, 100));
      }
    },
    async waitForStatus(id, status, timeoutMs = 30000) {
      let last: AccountStatus | undefined;
      try {
        await testApp.waitFor(async () => {
          last = (await testApp.accountView(id)).status;
          return last === status;
        }, timeoutMs);
      } catch (error) {
        throw new Error(`account ${id} stayed "${last}", expected "${status}": ${String(error)}`, { cause: error });
      }
    },
    storedData: () => JSON.parse(readFileSync(join(dataDir, 'data.json'), 'utf8')) as AppData,
    async close() {
      const closed = await Promise.race([
        app.close().then(() => true, () => true),
        new Promise<boolean>((resolve) => setTimeout(() => resolve(false), CLOSE_TIMEOUT_MS)),
      ]);
      if (!closed && pid !== undefined) {
        console.error(`e2e: the app of "${testName}" did not close in ${CLOSE_TIMEOUT_MS / 1000} s; killing pid ${pid}`);
        try {
          process.kill(pid, 'SIGKILL');
        } catch {
          // Already gone.
        }
      }
      if (pid !== undefined) running.delete(pid);
      server.closeAllConnections();
      server.close();
      if (options.dataDir === undefined) rmSync(dataDir, { recursive: true, force: true });
    },
  };
  return testApp;
}

