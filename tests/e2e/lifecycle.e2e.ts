import { spawn } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, test } from 'vitest';
import { INITIAL_DATA } from '../../src/shared/schemas';
import { account, dataWith, launchApp } from './helpers';
import type { TestApp } from './helpers';

let running: TestApp | undefined;
const scratch: string[] = [];

afterEach(async () => {
  await running?.close();
  running = undefined;
  for (const directory of scratch.splice(0)) rmSync(directory, { recursive: true, force: true });
});

const PROJECT_ROOT = join(import.meta.dirname, '..', '..');

// A plain child process, not Playwright: these are apps that are expected to exit by themselves.
function runApp(dataDir: string, timeoutMs = 20000): Promise<{ code: number | null; stderr: string; timedOut: boolean }> {
  const electron = createRequire(import.meta.url)('electron') as unknown as string;
  return new Promise((resolve) => {
    const child = spawn(electron, [PROJECT_ROOT], {
      cwd: PROJECT_ROOT,
      env: { ...process.env, IDLEMANAGER_DATA_DIR: dataDir, IDLEMANAGER_TEST: '1' },
      stdio: ['ignore', 'ignore', 'pipe'],
    });
    let stderr = '';
    child.stderr.on('data', (chunk: Buffer) => {
      stderr += String(chunk);
    });
    const timer = setTimeout(() => {
      child.kill('SIGKILL');
      resolve({ code: null, stderr, timedOut: true });
    }, timeoutMs);
    child.on('exit', (code) => {
      clearTimeout(timer);
      resolve({ code, stderr, timedOut: false });
    });
  });
}

async function start(data = dataWith(account('a'))): Promise<TestApp> {
  running = await launchApp({ data });
  return running;
}

describe('single instance and the window', () => {
  test('a second launch exits and shows the existing window', async () => {
    const app = await start();
    await app.waitForStatus('a', 'login');
    await app.hideWindow();
    expect(await app.windowVisible()).toBe(false);

    const second = await runApp(app.dataDir);
    expect(second.timedOut).toBe(false);
    expect(second.code).toBe(0);
    await app.waitFor(() => app.windowVisible(), 5000);
    expect(await app.windowCount()).toBe(1);
  });

  test('closing the window hides it and accounts stay alive', async () => {
    const app = await start();
    await app.waitForStatus('a', 'login');
    await app.closeWindow();
    await app.waitFor(async () => !(await app.windowVisible()), 3000);
    expect(await app.windowCount()).toBe(1);

    expect(await app.exited(1500)).toBe(false);
    expect(await app.hasPage('a')).toBe(true);
    await app.inPage('a', `signIn('Ash')`);
    await app.waitForStatus('a', 'connected');
  });

  test('quitting ends the app even when the window is hidden', async () => {
    const app = await start();
    await app.waitForStatus('a', 'login');
    await app.closeWindow();
    await app.waitFor(async () => !(await app.windowVisible()), 3000);
    await app.quitApp();
    expect(await app.exited(8000)).toBe(true);
    expect(app.mainProcessErrors()).toEqual([]);
  });
});

describe('startup with unreadable data', () => {
  test('corrupted data.json shows an error and opens no accounts', async () => {
    const dataDir = mkdtempSync(join(tmpdir(), 'idlemanager-corrupt-'));
    scratch.push(dataDir);
    const file = join(dataDir, 'data.json');
    writeFileSync(file, '{"version":1,"accounts":[{"broken"');

    const result = await runApp(dataDir);
    expect(result.timedOut).toBe(false);
    expect(result.code).toBe(1);
    expect(result.stderr).toContain('data.json');
    expect(readFileSync(file, 'utf8')).toBe('{"version":1,"accounts":[{"broken"');
  });

  test('valid JSON of the wrong shape is refused the same way', async () => {
    const dataDir = mkdtempSync(join(tmpdir(), 'idlemanager-corrupt-'));
    scratch.push(dataDir);
    writeFileSync(join(dataDir, 'data.json'), JSON.stringify({ ...INITIAL_DATA, version: 3 }));
    const result = await runApp(dataDir);
    expect(result.code).toBe(1);
  });
});

describe('notifications', () => {
  test('a game notice notifies with the account name', async () => {
    const app = await start(dataWith(account('a', { name: 'Principal' })));
    await app.waitForStatus('a', 'login');
    await app.inPage('a', `signIn('Ash'); takeSession()`);
    await app.waitForStatus('a', 'notice');
    await app.waitFor(async () => (await app.notifications()).length > 0, 3000);
    expect(await app.notifications()).toEqual([{ title: 'Conta aberta em outro lugar', body: 'Principal' }]);
  });

  test('disabled notifications do not call notify', async () => {
    const quiet = dataWith(account('a'));
    quiet.preferences.notifications = false;
    const app = await start(quiet);
    await app.waitForStatus('a', 'login');
    await app.inPage('a', `signIn('Ash'); takeSession()`);
    await app.waitForStatus('a', 'notice');
    await new Promise((resolve) => setTimeout(resolve, 1500));
    expect(await app.notifications()).toEqual([]);
  });
});

describe('power', () => {
  test('the suspension block follows the connected accounts', async () => {
    const app = await start();
    await app.waitForStatus('a', 'login');
    expect(await app.powerActive()).toBe(false);

    await app.inPage('a', `signIn('Ash')`);
    await app.waitForStatus('a', 'connected');
    await app.waitFor(() => app.powerActive(), 3000);

    await app.inPage('a', `signOut()`);
    await app.waitFor(async () => !(await app.powerActive()), 3000);
  });

  test('waking from suspension tells the account manager', async () => {
    const app = await start();
    await app.waitForStatus('a', 'login');
    expect(await app.emitResume()).toBe(1);
  });
});
