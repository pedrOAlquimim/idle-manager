import type { Locator, Page } from 'playwright-core';
import { afterEach, describe, expect, test } from 'vitest';
import { accountId } from '../../src/shared/types';
import { account, dataWith, launchApp } from './helpers';
import type { TestApp } from './helpers';

let running: TestApp | undefined;

afterEach(async () => {
  await running?.close();
  running = undefined;
});

async function start(...accounts: ReturnType<typeof account>[]): Promise<{ app: TestApp; page: Page; panel: Locator }> {
  const app = await launchApp({ data: dataWith(...accounts) });
  running = app;
  const page = await app.ui();
  return { app, page, panel: page.getByRole('complementary', { name: 'Detalhes da conta' }) };
}

const isDetached = async (app: TestApp, id: string): Promise<boolean> => (await app.accountView(id)).detached;

async function detachAndWait(app: TestApp, panel: Locator, id: string): Promise<void> {
  await panel.getByRole('button', { name: 'Destacar' }).click();
  await app.waitFor(() => isDetached(app, id), 5000);
}

// Four accounts use all four nicks of the game; a fifth nick blocks the account that tries it.
async function signInFour(app: TestApp): Promise<void> {
  await app.waitForStatus('d', 'login', 20000);
  for (const [id, nick] of [['a', 'Ash'], ['b', 'Misty'], ['c', 'Brock'], ['d', 'Gary']] as const) {
    await app.inPage(id, `signIn('${nick}')`);
    await app.waitForStatus(id, 'connected');
  }
}

async function blockAccountA(app: TestApp): Promise<void> {
  await app.inPage('a', `signOut(); signIn('Oak')`);
  await app.waitForStatus('a', 'blocked');
}

describe('detach', () => {
  test('detach moves the view without reloading the page', async () => {
    const { app, panel } = await start(account('a'));
    await app.waitForStatus('a', 'login');
    await app.inPage('a', 'window.__alive = 1; null');

    await detachAndWait(app, panel, 'a');
    expect(await app.inPage('a', 'window.__alive')).toBe(1);

    const state = await app.detachedState('a');
    expect(state.windows).toBe(2);
    expect(state.inOwnWindow).toBe(true);
    expect(state.zoom).toBe(1);
    expect(state.bounds).toEqual({ x: 0, y: 0, width: state.content?.width, height: state.content?.height });
    expect((await app.accountView('a')).status).toBe('login');
  });

  test('the screen shows Destacada em janela and Trazer de volta', async () => {
    const { app, page, panel } = await start(account('a'));
    await app.waitForStatus('a', 'login');
    await detachAndWait(app, panel, 'a');

    const tile = page.locator('[data-account="a"]');
    await tile.getByText('Destacada em janela').waitFor();
    await panel.getByRole('button', { name: 'Trazer' }).waitFor();

    await tile.getByRole('button', { name: 'Trazer de volta' }).click();
    await app.waitFor(async () => !(await isDetached(app, 'a')), 5000);
    expect((await app.detachedState('a')).windows).toBe(1);
    await tile.getByText('Destacada em janela').waitFor({ state: 'detached' });
    await panel.getByRole('button', { name: 'Destacar' }).waitFor();
  });

  test('closing the detached window brings the account back, in place and without reloading', async () => {
    const { app, page, panel } = await start(account('a'));
    await app.waitForStatus('a', 'login');
    await app.inPage('a', 'window.__alive = 1; null');
    await detachAndWait(app, panel, 'a');

    await app.closeDetached('a');
    await app.waitFor(async () => !(await isDetached(app, 'a')), 5000);
    expect(await app.inPage('a', 'window.__alive')).toBe(1);

    const area = await page.locator('[data-account="a"] .game').evaluate((element) => {
      const rect = element.getBoundingClientRect();
      return { x: Math.round(rect.x), y: Math.round(rect.y), width: Math.round(rect.width), height: Math.round(rect.height) };
    });
    await app.waitFor(async () => {
      const placed = await app.viewBounds('a');
      return placed !== null && placed.visible && JSON.stringify(placed.bounds) === JSON.stringify(area);
    }, 5000);
    expect((await app.accountView('a')).history.map((event) => event.text)).toEqual(['Trazida de volta', 'Destacada em janela']);
  });

  test('quitting with a detached account exits cleanly', async () => {
    const { app, panel } = await start(account('a'), account('b'));
    await app.waitForStatus('a', 'login');
    await detachAndWait(app, panel, 'a');
    await app.quitApp();
    expect(await app.exited(8000)).toBe(true);
    expect(app.mainProcessErrors()).toEqual([]);
  });

  test('a detached account is still supervised', async () => {
    const { app, panel } = await start(account('a'));
    await app.waitForStatus('a', 'login');
    await app.inPage('a', 'window.__alive = 1; null');
    await detachAndWait(app, panel, 'a');

    await app.crash('a');
    await app.waitForStatus('a', 'reloading');
    await app.waitForStatus('a', 'login', 20000);
    expect(await app.inPage('a', 'typeof window.__alive')).toBe('undefined');
    expect(await isDetached(app, 'a')).toBe(true);
    expect((await app.detachedState('a')).inOwnWindow).toBe(true);
  });

  test('disabling a detached account closes its window', async () => {
    const { app, page, panel } = await start(account('a'));
    await app.waitForStatus('a', 'login');
    await detachAndWait(app, panel, 'a');

    await app.execute({ type: 'disable', accountId: accountId('a') });
    await app.waitForStatus('a', 'off');
    expect(await isDetached(app, 'a')).toBe(false);
    expect((await app.detachedState('a')).windows).toBe(1);
    await page.locator('[data-account="a"]').getByText('Conta desligada').waitFor();
  });

  test('a blocked detached account comes back, so its action is visible', async () => {
    const { app, page, panel } = await start(...['a', 'b', 'c', 'd'].map((id) => account(id)));
    await signInFour(app);
    await detachAndWait(app, panel, 'a');

    await blockAccountA(app);
    await app.waitFor(async () => !(await isDetached(app, 'a')), 5000);
    expect((await app.detachedState('a')).windows).toBe(1);
    await page.locator('[data-account="a"]').getByRole('button', { name: 'Voltar ao login' }).waitFor();
  });

  test('a blocked account cannot be detached', async () => {
    const { app, panel } = await start(...['a', 'b', 'c', 'd'].map((id) => account(id)));
    await signInFour(app);
    await blockAccountA(app);

    expect(await panel.getByRole('button', { name: 'Destacar' }).isDisabled()).toBe(true);
    await app.execute({ type: 'detach', accountId: accountId('a') });
    expect(await isDetached(app, 'a')).toBe(false);
    expect((await app.detachedState('a')).windows).toBe(1);
  });

  test('an account without a page cannot be detached', async () => {
    const { app } = await start(account('a', { enabled: false }));
    await app.execute({ type: 'detach', accountId: accountId('a') });
    expect(await isDetached(app, 'a')).toBe(false);
    expect((await app.detachedState('a')).windows).toBe(1);
  });
});
