import { afterEach, describe, expect, test } from 'vitest';
import { accountId } from '../../src/shared/types';
import { account, dataWith, launchApp } from './helpers';
import type { TestApp } from './helpers';

let running: TestApp | undefined;

afterEach(async () => {
  await running?.close();
  running = undefined;
});

async function start(...accounts: ReturnType<typeof account>[]): Promise<TestApp> {
  running = await launchApp({ data: dataWith(...accounts) });
  return running;
}

describe('usage samples', () => {
  test('enabled account receives memory and CPU samples every 2s', async () => {
    const app = await start(account('a'));
    await app.waitFor(async () => (await app.accountView('a')).memoryMb.length >= 2, 15000);

    const view = await app.view();
    const sampled = view.accounts[0];
    expect(sampled).toBeDefined();
    expect(sampled?.memoryMb.length).toBeLessThanOrEqual(30);
    for (const memory of sampled?.memoryMb ?? []) {
      expect(memory).toBeGreaterThan(10);
      expect(memory).toBeLessThan(4000);
    }
    expect(sampled?.cpu).toHaveLength(sampled?.memoryMb.length ?? -1);
    for (const cpu of sampled?.cpu ?? []) expect(cpu).toBeGreaterThanOrEqual(0);
    expect(view.groups[0]?.memoryMb).toBeCloseTo(sampled?.memoryMb.at(-1) ?? Number.NaN, 5);
  });

  test('disabled account receives no samples, and turning one off clears its series', async () => {
    const app = await start(account('a', { enabled: false }), account('b'));
    await app.waitFor(async () => (await app.accountView('b')).memoryMb.length >= 2, 15000);
    expect((await app.accountView('a')).memoryMb).toEqual([]);
    expect((await app.accountView('a')).cpu).toEqual([]);

    await app.execute({ type: 'disable', accountId: accountId('b') });
    expect((await app.accountView('b')).memoryMb).toEqual([]);
    expect((await app.accountView('b')).cpu).toEqual([]);
  });

  test('ramFraction stays between 0 and 1 and the totals cover every process', async () => {
    const app = await start(account('a'));
    await app.waitFor(async () => (await app.view()).totalMemoryMb > 0, 15000);
    await app.waitFor(async () => (await app.accountView('a')).memoryMb.length >= 1, 15000);

    const view = await app.view();
    expect(view.ramFraction).toBeGreaterThan(0);
    expect(view.ramFraction).toBeLessThanOrEqual(1);
    expect(view.totalCpu).toBeGreaterThanOrEqual(0);
    expect(view.totalMemoryMb).toBeGreaterThanOrEqual(view.accounts[0]?.memoryMb.at(-1) ?? Number.POSITIVE_INFINITY);
  });
});

describe('history', () => {
  test('actions create the design events', async () => {
    const app = await start(account('a'));
    const id = accountId('a');
    const history = async (): Promise<string[]> => (await app.accountView('a')).history.map((event) => event.text);
    await app.waitForStatus('a', 'login');

    await app.execute({ type: 'toggle-sound', accountId: id });
    await app.execute({ type: 'toggle-sound', accountId: id });
    await app.execute({ type: 'go-home', accountId: id });
    await app.waitForStatus('a', 'login');

    await app.inPage('a', 'window.mark = 1; null');
    await app.execute({ type: 'reload', accountId: id });
    await app.waitFor(async () => (await app.inPage<string>('a', `typeof window.mark + ' ' + typeof window.startDownload`)) === 'undefined function');

    await app.inPage('a', 'startDownload()');
    await app.waitFor(async () => (await history()).includes('Download bloqueado'), 10000);

    await app.execute({ type: 'disable', accountId: id });
    await app.execute({ type: 'reload', accountId: id });
    await app.execute({ type: 'go-home', accountId: id });
    await app.execute({ type: 'enable', accountId: id });

    expect(await history()).toEqual([
      'Ligada',
      'Desligada',
      'Download bloqueado',
      'Recarregada',
      'Voltou ao início',
      'Som desligado',
      'Som ligado',
    ]);
  });

  test('events carry the account, a growing id and a time', async () => {
    const app = await start(account('a'));
    await app.waitForStatus('a', 'login');
    const before = Date.now();
    await app.execute({ type: 'toggle-sound', accountId: accountId('a') });
    await app.execute({ type: 'toggle-sound', accountId: accountId('a') });

    const events = (await app.accountView('a')).history;
    expect(events).toHaveLength(2);
    expect(events.map((event) => event.accountId)).toEqual(['a', 'a']);
    expect(events[0]?.id).toBeGreaterThan(events[1]?.id ?? Number.POSITIVE_INFINITY);
    for (const event of events) {
      expect(event.at).toBeGreaterThanOrEqual(before);
      expect(event.at).toBeLessThanOrEqual(Date.now());
    }
  });

  test('adding an account records it', async () => {
    const app = await start(account('a'));
    await app.execute({ type: 'add-account', gameId: (await app.view()).groups[0]?.gameId ?? ('' as never), name: 'Alt 1' });
    const added = (await app.view()).accounts.find((candidate) => candidate.name === 'Alt 1');
    expect(added?.history.map((event) => event.text)).toEqual(['Conta adicionada']);
  });
});
