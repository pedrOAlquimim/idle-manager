import { afterEach, describe, expect, test } from 'vitest';
import { gameId, accountId } from '../../src/shared/types';
import { account, dataWith, launchApp } from './helpers';
import type { TestApp } from './helpers';

let running: TestApp | undefined;

async function start(...ids: string[]): Promise<TestApp> {
  running = await launchApp({ data: dataWith(...ids.map((id) => account(id))) });
  return running;
}

afterEach(async () => {
  await running?.close();
  running = undefined;
});

const SCREEN = { x: 0, y: 0, width: 600, height: 400 };

async function showOnScreen(app: TestApp, id: string): Promise<void> {
  await app.execute({ type: 'screens', screens: [{ accountId: accountId(id), rect: SCREEN }] });
}

describe('opening', () => {
  test('opens only enabled accounts, 5s apart', async () => {
    const app = await launchApp({
      data: dataWith(account('a'), account('off', { enabled: false }), account('b')),
    });
    running = app;
    await app.waitFor(() => app.hasPage('a'));
    const openedAt = Date.now();
    expect(await app.hasPage('b')).toBe(false);
    await app.waitFor(() => app.hasPage('b'), 8000);
    expect(Date.now() - openedAt).toBeGreaterThan(3500);
    expect(await app.hasPage('off')).toBe(false);
    expect((await app.accountView('off')).status).toBe('off');
  });

  test('disabling during the open interval cancels the load', async () => {
    const app = await start('a', 'b');
    await app.waitFor(() => app.hasPage('a'));
    await app.execute({ type: 'disable', accountId: accountId('b') });
    await new Promise((resolve) => setTimeout(resolve, 6500));
    expect(await app.hasPage('b')).toBe(false);
    expect((await app.accountView('b')).status).toBe('off');
    expect(app.storedData().accounts.find((stored) => stored.id === 'b')?.enabled).toBe(false);
  });

  test('disabling unloads the page and enabling brings it back', async () => {
    const app = await start('a');
    await app.waitForStatus('a', 'login');
    await app.execute({ type: 'disable', accountId: accountId('a') });
    expect(await app.hasPage('a')).toBe(false);
    expect((await app.accountView('a')).status).toBe('off');
    await app.execute({ type: 'enable', accountId: accountId('a') });
    await app.waitForStatus('a', 'login');
    expect(await app.hasPage('a')).toBe(true);
  });
});

describe('isolation and supervision', () => {
  test('a session does not leak to another account', async () => {
    const app = await start('a', 'b');
    await app.waitForStatus('a', 'login');
    await app.waitForStatus('b', 'login', 15000);
    await app.inPage('a', `signIn('Ash')`);
    await app.waitForStatus('a', 'connected');
    expect(await app.inPage('b', `localStorage.getItem('sessao')`)).toBeNull();
    expect((await app.accountView('b')).status).toBe('login');
  });

  test('a crash reloads only that account', async () => {
    const app = await start('a', 'b');
    await app.waitForStatus('a', 'login');
    await app.waitForStatus('b', 'login', 15000);
    await app.inPage('a', `signIn('Ash')`);
    await app.inPage('b', `signIn('Misty'); window.mark = 'still here'`);
    await app.waitForStatus('a', 'connected');
    await app.waitForStatus('b', 'connected');

    await app.crash('a');
    await app.waitForStatus('a', 'reloading');
    await app.waitForStatus('a', 'connected', 20000);
    expect(await app.inPage('b', `window.mark`)).toBe('still here');
    expect((await app.accountView('b')).status).toBe('connected');
  });

  test('taken session does not reload', async () => {
    const app = await start('a');
    await app.waitForStatus('a', 'login');
    await app.inPage('a', `signIn('Ash'); window.mark = 'still here'; takeSession()`);
    await app.waitForStatus('a', 'notice');
    expect((await app.accountView('a')).message).toBe('Conta aberta em outro lugar');
    await new Promise((resolve) => setTimeout(resolve, 6000));
    expect(await app.inPage('a', `window.mark`)).toBe('still here');
  });
});

describe('nick limit', () => {
  test('fifth nick blocks the account and removes the session', async () => {
    const app = await start('a', 'b', 'c', 'd');
    await app.waitFor(() => app.hasPage('d'), 20000);
    await app.waitForStatus('d', 'login');
    const nicks = ['Ash', 'Misty', 'Brock', 'Gary'];
    for (const [index, id] of ['a', 'b', 'c', 'd'].entries()) {
      await app.inPage(id, `signIn('${nicks[index]}')`);
      await app.waitForStatus(id, 'connected');
    }

    await app.inPage('a', `signOut(); signIn('Oak')`);
    await app.waitForStatus('a', 'blocked');
    await app.waitFor(async () => (await app.inPage<string>('a', 'location.href')) === 'about:blank');
    expect((await app.accountView('b')).status).toBe('connected');
    expect(app.storedData().nicks['pokeidle']).toEqual(nicks);

    await app.execute({ type: 'back-to-login', accountId: accountId('a') });
    await app.waitForStatus('a', 'login');
    expect(await app.inPage('a', `localStorage.getItem('sessao')`)).toBeNull();
  });

  test('switching between known nicks is allowed', async () => {
    const app = await start('a', 'b');
    await app.waitForStatus('a', 'login');
    await app.waitForStatus('b', 'login', 15000);
    await app.inPage('a', `signIn('Ash')`);
    await app.waitForStatus('a', 'connected');
    await app.inPage('b', `signIn('Misty')`);
    await app.waitForStatus('b', 'connected');
    await app.inPage('a', `signOut(); signIn('Misty')`);
    await new Promise((resolve) => setTimeout(resolve, 2500));
    expect((await app.accountView('a')).status).toBe('connected');
    expect(app.storedData().accounts.find((stored) => stored.id === 'a')?.nick).toBe('Misty');
  });
});

describe('account management', () => {
  test('removing an account erases its local session', async () => {
    const app = await start('a');
    await app.waitForStatus('a', 'login');
    await app.inPage('a', `signIn('Ash')`);
    await app.waitForStatus('a', 'connected');
    await app.waitFor(async () => app.storedData().nicks['pokeidle']?.length === 1);

    await app.removeAccount('a');
    expect((await app.view()).accounts).toEqual([]);
    expect(app.storedData().nicks).toEqual({});

    await app.execute({ type: 'add-account', gameId: gameId('pokeidle'), name: 'a' });
    await app.waitForStatus('a', 'login');
    expect(await app.inPage('a', `localStorage.getItem('sessao')`)).toBeNull();
  });

  test('adding beyond the limit is rejected', async () => {
    const app = await launchApp({ data: dataWith(...['a', 'b', 'c', 'd'].map((id) => account(id, { enabled: false }))) });
    running = app;
    await app.execute({ type: 'add-account', gameId: gameId('pokeidle'), name: 'e' });
    expect((await app.view()).accounts).toHaveLength(4);
    expect((await app.view()).groups[0]?.limit).toBe(4);
  });

  test('clicking a view selects the account, and opening one does not', async () => {
    const app = await start('a', 'b');
    await app.waitForStatus('a', 'login');
    await app.waitForStatus('b', 'login', 15000);
    await app.execute({
      type: 'screens',
      screens: [
        { accountId: accountId('a'), rect: SCREEN },
        { accountId: accountId('b'), rect: { ...SCREEN, x: 600 } },
      ],
    });
    expect((await app.view()).preferences.selectedId).toBe('a');
    await app.clickAt('b', 400, 300);
    await app.waitFor(async () => (await app.view()).preferences.selectedId === 'b', 3000);
  });
});

describe('leaving the game', () => {
  test('a page-initiated download is cancelled', async () => {
    const app = await start('a');
    await app.waitForStatus('a', 'login');
    await app.app.evaluate(({ webContents }) => {
      const state = { seen: 0, cancelled: 0 };
      (globalThis as unknown as { downloads: typeof state }).downloads = state;
      for (const contents of webContents.getAllWebContents()) {
        contents.session.on('will-download', (event) => {
          state.seen += 1;
          if (event.defaultPrevented) state.cancelled += 1;
        });
      }
    });
    await app.inPage('a', `startDownload()`);
    await app.waitFor(
      () => app.app.evaluate(() => (globalThis as unknown as { downloads: { seen: number } }).downloads.seen === 1),
      5000,
    );
    const downloads = await app.app.evaluate(() => (globalThis as unknown as { downloads: object }).downloads);
    expect(downloads).toEqual({ seen: 1, cancelled: 1 });
  });

  test('window.open without user input opens nothing', async () => {
    const app = await start('a');
    await app.waitForStatus('a', 'login');
    await app.inPage('a', `window.open('https://example.com/'); null`);
    await new Promise((resolve) => setTimeout(resolve, 500));
    expect(await app.openedUrls()).toEqual([]);
  });

  test('redirect to an external host without user input is cancelled', async () => {
    const app = await start('a');
    await app.waitForStatus('a', 'login');
    await app.inPage('a', `location.href = 'https://example.com/'; null`);
    await new Promise((resolve) => setTimeout(resolve, 1000));
    expect(await app.openedUrls()).toEqual([]);
    expect(await app.inPage('a', 'location.hostname')).toBe('127.0.0.1');
  });

  test('clicking an external link opens the default browser', async () => {
    const app = await start('a');
    await app.waitForStatus('a', 'login');
    await showOnScreen(app, 'a');
    await app.focus('a');
    await app.clickAt('a', 40, 40);
    await app.waitFor(async () => (await app.openedUrls()).length > 0, 5000);
    expect(await app.openedUrls()).toEqual(['https://example.com/']);

    await app.inPage('a', `window.open('https://example.com/second'); null`);
    await new Promise((resolve) => setTimeout(resolve, 300));
    expect(await app.openedUrls()).toEqual(['https://example.com/']);
  });

  test('a server redirect from the game host to an external host is cancelled', async () => {
    const app = await start('a');
    await app.waitForStatus('a', 'login');
    await app.inPage('a', `location.href = '/redirect'; null`);
    await new Promise((resolve) => setTimeout(resolve, 1000));
    expect(await app.openedUrls()).toEqual([]);
    expect(await app.inPage('a', 'location.hostname')).toBe('127.0.0.1');
  });

  test('input on one account does not allow external links on another', async () => {
    const app = await start('a', 'b');
    await app.waitForStatus('a', 'login');
    await app.waitForStatus('b', 'login', 15000);
    await showOnScreen(app, 'a');
    await app.focus('a');
    await app.clickAt('a', 400, 300);
    await new Promise((resolve) => setTimeout(resolve, 200));
    await app.inPage('b', `window.open('https://example.com/'); null`);
    await new Promise((resolve) => setTimeout(resolve, 500));
    expect(await app.openedUrls()).toEqual([]);
  });
});
