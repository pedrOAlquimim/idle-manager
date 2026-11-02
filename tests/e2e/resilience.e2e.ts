import type { Page } from 'playwright-core';
import { afterEach, describe, expect, test } from 'vitest';
import { accountId, gameId } from '../../src/shared/types';
import type { StoredAccount } from '../../src/shared/types';
import { account, dataWith, launchApp } from './helpers';
import type { TestApp } from './helpers';

let running: TestApp | undefined;

afterEach(async () => {
  await running?.close();
  running = undefined;
});

async function start(...accounts: StoredAccount[]): Promise<{ app: TestApp; page: Page }> {
  const app = await launchApp({ data: dataWith(...accounts) });
  running = app;
  return { app, page: await app.ui() };
}

const CLOSE_ITSELF = 'setTimeout(() => window.close(), 0); null';
const HANG = 'setTimeout(() => { for (;;) {} }, 0); null';
const HOLD_UNLOAD = `addEventListener('beforeunload', (event) => { event.preventDefault(); event.returnValue = ''; }); null`;

describe('a page that closes itself', () => {
  test('comes back like a crash', async () => {
    const { app } = await start(account('a'));
    await app.waitForStatus('a', 'login');
    await app.inPage('a', CLOSE_ITSELF);
    await app.waitForStatus('a', 'reloading');
    expect(await app.hasPage('a')).toBe(false);
    await app.waitForStatus('a', 'login', 15000);
    expect(await app.hasPage('a')).toBe(true);
    expect(app.mainProcessErrors()).toEqual([]);
  });

  test('leaves the other accounts working', async () => {
    const { app, page } = await start(account('a'), account('b'));
    await app.waitForStatus('a', 'login');
    await app.waitForStatus('b', 'login', 15000);
    await app.execute({ type: 'select', accountId: accountId('b') });
    await app.waitFor(async () => (await app.viewBounds('b'))?.visible === true, 3000);

    await app.inPage('a', CLOSE_ITSELF);
    await app.waitFor(async () => !(await app.hasPage('a')), 3000);
    await page.getByRole('button', { name: 'Novo grupo de jogo' }).first().click();
    await app.waitFor(async () => (await app.viewBounds('b'))?.visible === false, 3000);
    expect(app.mainProcessErrors()).toEqual([]);
  });

  test('can still be turned off and removed', async () => {
    const { app } = await start(account('a'), account('b'));
    await app.waitForStatus('a', 'login');
    await app.waitForStatus('b', 'login', 15000);
    await app.inPage('a', CLOSE_ITSELF);
    await app.inPage('b', CLOSE_ITSELF);
    await app.waitFor(async () => !(await app.hasPage('a')) && !(await app.hasPage('b')), 3000);

    await app.execute({ type: 'disable', accountId: accountId('a') });
    expect((await app.accountView('a')).status).toBe('off');
    await app.removeAccount('b');
    expect((await app.view()).accounts.map((candidate) => candidate.id)).toEqual(['a']);
    expect(app.mainProcessErrors()).toEqual([]);
  });

  test('in a detached window returns to the main window', async () => {
    const { app } = await start(account('a'));
    await app.waitForStatus('a', 'login');
    await app.execute({ type: 'detach', accountId: accountId('a') });
    await app.waitFor(async () => (await app.accountView('a')).detached, 5000);

    await app.inPage('a', CLOSE_ITSELF);
    await app.waitFor(async () => !(await app.accountView('a')).detached, 5000);
    expect((await app.detachedState('a')).windows).toBe(1);
    await app.waitForStatus('a', 'login', 15000);
    expect(app.mainProcessErrors()).toEqual([]);
  });

  test('does not get in the way of quitting', async () => {
    const { app } = await start(account('a'));
    await app.waitForStatus('a', 'login');
    await app.inPage('a', CLOSE_ITSELF);
    await app.waitFor(async () => !(await app.hasPage('a')), 3000);
    await app.quitApp();
    expect(await app.exited(8000)).toBe(true);
    expect(app.mainProcessErrors()).toEqual([]);
  });
});

describe('a page that stops answering', () => {
  test('is restarted, because a reload would wait for it forever', async () => {
    const { app } = await start(account('a'));
    await app.waitForStatus('a', 'login');
    await app.inPage('a', 'window.__alive = 1; null');
    await app.inPage('a', HANG);
    await app.reportUnresponsive('a');
    await app.waitForStatus('a', 'reloading');
    await app.waitForStatus('a', 'login', 15000);
    expect(await app.inPage('a', 'typeof window.__alive')).toBe('undefined');
    expect((await app.accountView('a')).attempts).toBe(1);
  });
});

describe('a page that holds its unload', () => {
  const held = async (app: TestApp): Promise<void> => {
    await app.waitForStatus('a', 'login');
    await app.inPage('a', `window.__alive = 1; ${HOLD_UNLOAD}`);
    await app.clickAt('a', 400, 300);
    await new Promise((resolve) => setTimeout(resolve, 300));
  };

  test('still reloads', async () => {
    const { app } = await start(account('a'));
    await held(app);
    await app.execute({ type: 'reload', accountId: accountId('a') });
    await app.waitFor(async () => (await app.inPage('a', 'typeof window.__alive')) === 'undefined', 5000);
  });

  test('still goes back to the start', async () => {
    const { app } = await start(account('a'));
    await held(app);
    await app.execute({ type: 'go-home', accountId: accountId('a') });
    await app.waitFor(async () => (await app.inPage('a', 'typeof window.__alive')) === 'undefined', 5000);
  });

  test('is closed when its nick is blocked', async () => {
    const { app } = await start(...['a', 'b', 'c', 'd'].map((id) => account(id)));
    await app.waitForStatus('d', 'login', 20000);
    for (const [id, nick] of [['a', 'Ash'], ['b', 'Misty'], ['c', 'Brock'], ['d', 'Gary']] as const) {
      await app.inPage(id, `signIn('${nick}')`);
      await app.waitForStatus(id, 'connected');
    }
    await app.inPage('a', HOLD_UNLOAD);
    await app.clickAt('a', 400, 300);
    await new Promise((resolve) => setTimeout(resolve, 300));
    await app.inPage('a', `signOut(); signIn('Oak')`);
    await app.waitForStatus('a', 'blocked');
    await app.waitFor(async () => (await app.pageUrl('a')) === 'about:blank', 5000);
  });
});

describe('the open queue', () => {
  test('an account waiting its turn for over a minute opens once, on time', { timeout: 100000 }, async () => {
    const { app } = await start();
    await app.delayNextOpen(70000);
    await app.execute({ type: 'add-account', gameId: gameId('pokeidle'), name: 'Alt 1' });
    await new Promise((resolve) => setTimeout(resolve, 66000));
    expect(await app.hasPage('alt-1')).toBe(false);
    expect((await app.accountView('alt-1')).attempts).toBe(0);
    expect((await app.accountView('alt-1')).status).toBe('loading');
  });
});

describe('the channels of the interface', () => {
  test('answer only the interface', async () => {
    const { app } = await start(account('a'));
    await app.execute({ type: 'set-layout', layout: 'focus' });
    const outcome = await app.fromAnotherPage();
    expect(outcome).toEqual({ view: 'refused', game: 'refused' });
    const view = await app.view();
    expect(view.preferences.sidebarOpen).toBe(true);
    expect(view.preferences.layout).toBe('focus');
    expect(view.groups).toHaveLength(1);
  });
});

describe('the window', () => {
  test('has no application menu', async () => {
    const { app } = await start();
    expect(await app.menuState()).toEqual({ menu: false, visible: false });
  });

  test('pasting still works inside a game', async () => {
    const { app } = await start(account('a'));
    await app.waitForStatus('a', 'login');
    await app.inPage('a', `const input = document.createElement('input'); input.id = 'chat'; document.body.append(input); input.focus(); null`);
    const before = await app.clipboard();
    try {
      await app.clipboard('texto colado');
      await app.pressInView('a', 'v', ['control']);
      await app.waitFor(async () => (await app.inPage('a', `document.getElementById('chat').value`)) === 'texto colado', 3000);
    } finally {
      await app.clipboard(before);
    }
  });

  test('a reload of the interface with a modal open brings the views back', async () => {
    const { app, page } = await start(account('a'));
    await app.waitForStatus('a', 'login');
    await page.getByRole('button', { name: 'Novo grupo de jogo' }).first().click();
    await app.waitFor(async () => (await app.viewBounds('a'))?.visible === false, 3000);
    await page.reload();
    await app.waitFor(async () => (await app.viewBounds('a'))?.visible === true, 5000);
  });

  test('a crash of the interface brings it back', async () => {
    const { app } = await start(account('a'));
    await app.waitForStatus('a', 'login');
    await app.crashInterface();
    await app.waitFor(() => app.interfaceRendered(), 8000);
    expect((await app.accountView('a')).status).toBe('login');
  });
});

describe('what a page may ask for', () => {
  test('nothing reads as granted beyond what the app allows', async () => {
    const { app } = await start(account('a'));
    await app.waitForStatus('a', 'login');
    expect(await app.inPage('a', 'Notification.permission')).toBe('denied');
    expect(await app.inPage('a', `navigator.permissions.query({ name: 'geolocation' }).then((result) => result.state)`)).not.toBe('granted');
    expect(await app.inPage('a', `navigator.permissions.query({ name: 'notifications' }).then((result) => result.state)`)).not.toBe('granted');
    expect(await app.inPage('a', 'document.fullscreenEnabled')).toBe(true);
  });
});

describe('an error in the main process', () => {
  test('is logged and leaves the app running, with no box on the screen', async () => {
    const { app } = await start(account('a'));
    await app.waitForStatus('a', 'login');
    expect(await app.throwInMain('boom')).toBe(0);
    expect(await app.exited(1000)).toBe(false);
    await app.waitFor(async () => app.mainProcessErrors().some((line) => line.includes('boom')), 2000);
  });
});
