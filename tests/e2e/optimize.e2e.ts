import type { Page } from 'playwright-core';
import { afterEach, describe, expect, test } from 'vitest';
import { accountId } from '../../src/shared/types';
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

const HOUR = 3_600_000;
const historyOf = async (app: TestApp, id: string): Promise<string[]> =>
  (await app.accountView(id)).history.map((event) => event.text);
const optimizedEntry = (texts: readonly string[], auto = false): string | undefined =>
  texts.find((text) => (auto ? /^Otimizada sozinha( · liberou \d+ MB)?$/ : /^Otimizada( · liberou \d+ MB)?$/).test(text));
const waitForEntry = (app: TestApp, id: string, auto = false): Promise<void> =>
  app.waitFor(async () => optimizedEntry(await historyOf(app, id), auto) !== undefined, 20000);
const optimize = (app: TestApp, id: string): Promise<void> => app.execute({ type: 'optimize', accountId: accountId(id) });
const setHours = (app: TestApp, id: string, hours: number | null, scope: 'account' | 'group' = 'account'): Promise<void> =>
  app.execute({ type: 'set-auto-optimize', accountId: accountId(id), hours, scope });

describe('optimize', () => {
  test('swaps the page process and keeps the login', async () => {
    const { app } = await start(account('a'));
    await app.waitForStatus('a', 'login');
    await app.inPage('a', `signIn('Ash')`);
    await app.waitForStatus('a', 'connected');
    await app.inPage('a', 'window.__alive = 1; null');
    await app.waitFor(async () => (await app.accountView('a')).memoryMb.length > 0, 5000);
    const before = await app.pageProcess('a');

    await optimize(app, 'a');
    await waitForEntry(app, 'a');
    await app.waitForStatus('a', 'connected', 15000);
    expect(await app.pageProcess('a')).not.toBe(before);
    expect(await app.inPage('a', 'typeof window.__alive')).toBe('undefined');
    expect(optimizedEntry(await historyOf(app, 'a'))).toMatch(/^Otimizada · liberou \d+ MB$/);
    expect((await app.accountView('a')).attempts).toBe(0);
  });

  test('leaves the other accounts and the detached window alone', async () => {
    const { app } = await start(account('a'), account('b'));
    await app.waitForStatus('a', 'login');
    await app.waitForStatus('b', 'login', 15000);
    await app.execute({ type: 'detach', accountId: accountId('a') });
    await app.waitFor(async () => (await app.accountView('a')).detached, 5000);
    const other = await app.pageProcess('b');

    await optimize(app, 'a');
    await waitForEntry(app, 'a');
    expect(await app.pageProcess('b')).toBe(other);
    expect((await app.accountView('a')).detached).toBe(true);
  });

  test('does nothing to an account without a page', async () => {
    const { app } = await start(account('a', { enabled: false }));
    await optimize(app, 'a');
    await new Promise((resolve) => setTimeout(resolve, 1500));
    expect((await app.accountView('a')).status).toBe('off');
    expect(await historyOf(app, 'a')).toEqual([]);
  });

  test('does nothing to an account that is reloading after a crash', async () => {
    const { app } = await start(account('a'));
    await app.waitForStatus('a', 'login');
    await app.crash('a');
    await app.waitForStatus('a', 'reloading');
    await optimize(app, 'a');
    await app.waitForStatus('a', 'login', 15000);
    await new Promise((resolve) => setTimeout(resolve, 3000));
    expect((await historyOf(app, 'a')).filter((text) => text.startsWith('Otimizada'))).toEqual([]);
  });

  test('pressed twice restarts once', async () => {
    const { app } = await start(account('a'));
    await app.waitForStatus('a', 'login');
    await optimize(app, 'a');
    await optimize(app, 'a');
    await waitForEntry(app, 'a');
    await new Promise((resolve) => setTimeout(resolve, 3000));
    expect((await historyOf(app, 'a')).filter((text) => text.startsWith('Otimizada'))).toHaveLength(1);
  });

  test('turning the account off during an optimization leaves no trace', async () => {
    const { app } = await start(account('a'));
    await app.waitForStatus('a', 'login');
    await optimize(app, 'a');
    await app.execute({ type: 'disable', accountId: accountId('a') });
    await new Promise((resolve) => setTimeout(resolve, 4000));
    expect((await app.accountView('a')).status).toBe('off');
    expect(await app.hasPage('a')).toBe(false);
    expect((await historyOf(app, 'a')).filter((text) => text.startsWith('Otimizada'))).toEqual([]);

    await app.execute({ type: 'enable', accountId: accountId('a') });
    await app.waitForStatus('a', 'login', 15000);
    await new Promise((resolve) => setTimeout(resolve, 3000));
    expect((await historyOf(app, 'a')).filter((text) => text.startsWith('Otimizada'))).toEqual([]);
  });
});

describe('the automatic optimization', () => {
  test('set-auto-optimize changes this account or the whole group', async () => {
    const { app } = await start(account('a'), account('b'));
    await setHours(app, 'a', 6);
    expect(app.storedData().accounts.map((stored) => stored.autoOptimizeHours)).toEqual([6, null]);
    await setHours(app, 'b', 12, 'group');
    expect(app.storedData().accounts.map((stored) => stored.autoOptimizeHours)).toEqual([12, 12]);
    await setHours(app, 'a', 0);
    expect(app.storedData().accounts.map((stored) => stored.autoOptimizeHours)).toEqual([12, 12]);
    await setHours(app, 'a', null);
    expect(app.storedData().accounts.map((stored) => stored.autoOptimizeHours)).toEqual([null, 12]);
  });

  test('runs when its time comes', async () => {
    const { app } = await start(account('a'));
    await app.waitForStatus('a', 'login');
    await setHours(app, 'a', 1);
    const view = await app.accountView('a');
    expect(view.optimizeDueAt).not.toBeNull();
    const before = await app.pageProcess('a');
    await app.ageAccount('a', 61 * 60_000);
    await waitForEntry(app, 'a', true);
    expect(await app.pageProcess('a')).not.toBe(before);
    // The clock starts over with the new process, so it does not go again a minute later.
    await app.waitForStatus('a', 'login', 15000);
    expect((await app.accountView('a')).optimizeDueAt ?? 0).toBeGreaterThan(Date.now() + 59 * 60_000);
  });

  test('waits while the account is in use', async () => {
    const { app } = await start(account('a'));
    await app.waitForStatus('a', 'login');
    await setHours(app, 'a', 1);
    await app.clickAt('a', 400, 300);
    const before = await app.pageProcess('a');
    await app.ageAccount('a', 61 * 60_000);
    await new Promise((resolve) => setTimeout(resolve, 3000));
    expect(await app.pageProcess('a')).toBe(before);
    expect((await app.accountView('a')).optimizeWaiting).toBe(true);
  });

  test('four accounts due at once optimize a minute apart', { timeout: 90000 }, async () => {
    const ids = ['a', 'b', 'c', 'd'];
    const { app } = await start(...ids.map((id) => account(id)));
    await app.waitForStatus('d', 'login', 25000);
    await setHours(app, 'a', 1, 'group');
    const before = await Promise.all(ids.map((id) => app.pageProcess(id)));
    for (const id of ids) await app.ageAccount(id, 3 * HOUR);
    const changed = async (): Promise<number> => {
      const now = await Promise.all(ids.map((id) => app.pageProcess(id)));
      return now.filter((pid, index) => pid !== before[index]).length;
    };
    await app.waitFor(async () => (await changed()) === 1, 15000);
    await new Promise((resolve) => setTimeout(resolve, 3000));
    expect(await changed()).toBe(1);
    await app.allowNextAutoOptimization();
    await app.waitFor(async () => (await changed()) === 2, 15000);
    await new Promise((resolve) => setTimeout(resolve, 3000));
    expect(await changed()).toBe(2);
  });

  test('under an open modal keeps the views hidden', async () => {
    const { app } = await start(account('a'));
    await app.waitForStatus('a', 'login');
    await setHours(app, 'a', 1);
    await app.execute({ type: 'set-modal-open', open: true });
    await app.ageAccount('a', 61 * 60_000);
    await waitForEntry(app, 'a', true);
    expect((await app.viewBounds('a'))?.visible).toBe(false);
    await app.execute({ type: 'set-modal-open', open: false });
    await app.waitFor(async () => (await app.viewBounds('a'))?.visible === true, 3000);
  });
});
