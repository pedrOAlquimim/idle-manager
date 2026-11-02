import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { Page } from 'playwright-core';
import { afterEach, describe, expect, test } from 'vitest';
import { gameId } from '../../src/shared/types';
import type { StoredAccount } from '../../src/shared/types';
import { account, dataWith, launchApp, serveOtherSite } from './helpers';
import type { OtherSite, TestApp } from './helpers';

let running: TestApp | undefined;
let site: OtherSite | undefined;
const scratch: string[] = [];

afterEach(async () => {
  await running?.close();
  running = undefined;
  site?.close();
  site = undefined;
  for (const directory of scratch.splice(0)) rmSync(directory, { recursive: true, force: true });
});

async function start(...accounts: StoredAccount[]): Promise<{ app: TestApp; page: Page; other: OtherSite }> {
  site = await serveOtherSite();
  const app = await launchApp({ data: dataWith(...accounts) });
  running = app;
  return { app, page: await app.ui(), other: site };
}

const group = (other: OtherSite) => ({ name: 'Outro', url: other.url, accountName: 'Principal' });

describe('a group of another site', () => {
  test('opens the site and reads aberta', async () => {
    const { app, page, other } = await start();
    expect(await app.createGame(group(other))).toBeNull();
    await app.waitForStatus('principal', 'connected', 15000);
    await page.locator('[data-account="principal"]').getByText('aberta').waitFor();
    await page.getByText('Tudo certo').waitFor();

    const view = await app.view();
    expect(view.accounts[0]?.host).toBe('127.0.0.2');
    expect(view.preferences.selectedId).toBe('principal');
    expect(view.groups[1]).toMatchObject({ name: 'Outro', host: '127.0.0.2', dot: '#a78bfa', limit: null });
    expect(view.accounts[0]?.history.map((event) => event.text)).toContain('Grupo Outro criado');
  });

  test('keeps the accounts of the group apart', async () => {
    const { app, other } = await start();
    await app.createGame(group(other));
    await app.execute({ type: 'add-account', gameId: gameId('outro'), name: 'Alt 1' });
    await app.waitForStatus('principal', 'connected', 15000);
    await app.waitForStatus('alt-1', 'connected', 20000);

    await app.inPage('principal', `localStorage.setItem('mark', 'one'); null`);
    expect(await app.inPage('principal', `localStorage.getItem('mark')`)).toBe('one');
    expect(await app.inPage('alt-1', `localStorage.getItem('mark')`)).toBeNull();
  });

  test('runs next to the accounts of another group', async () => {
    const { app, other } = await start(account('a'));
    await app.waitForStatus('a', 'login');
    await app.createGame(group(other));
    await app.waitForStatus('principal', 'connected', 20000);
    await app.waitFor(async () => (await app.viewBounds('principal'))?.visible === true, 5000);
    expect((await app.viewBounds('a'))?.visible).toBe(false);

    await app.execute({ type: 'select', accountId: (await app.view()).accounts[0]?.id ?? ('' as never) });
    await app.waitFor(async () => (await app.viewBounds('a'))?.visible === true, 5000);
    expect((await app.viewBounds('principal'))?.visible).toBe(false);
    expect(await app.hasPage('a')).toBe(true);
    expect(await app.hasPage('principal')).toBe(true);
  });

  test('keeps its own http pages inside the account', async () => {
    const { app, other } = await start();
    await app.createGame(group(other));
    await app.waitForStatus('principal', 'connected', 15000);
    await app.inPage('principal', `location.href = '/segunda-pagina'; null`);
    await app.waitFor(async () => (await app.inPage('principal', 'location.pathname')) === '/segunda-pagina', 5000);
    expect(await app.openedUrls()).toEqual([]);
  });

  test('sends the focus layout back to the grid', async () => {
    const { app, other } = await start(account('a'));
    await app.execute({ type: 'set-layout', layout: 'focus' });
    await app.createGame(group(other));
    expect((await app.view()).preferences.layout).toBe('grid');
  });

  test('survives a restart', async () => {
    site = await serveOtherSite();
    const dataDir = mkdtempSync(join(tmpdir(), 'idlemanager-groups-'));
    scratch.push(dataDir);
    const first = await launchApp({ data: dataWith(), dataDir });
    running = first;
    await first.createGame(group(site));
    await first.waitForStatus('principal', 'connected', 15000);
    await first.quitApp();
    expect(await first.exited(8000)).toBe(true);
    await first.close();

    running = await launchApp({ dataDir });
    await running.waitForStatus('principal', 'connected', 15000);
    expect((await running.view()).groups.map((candidate) => candidate.name)).toEqual(['PokeIdle', 'Outro']);
  });

  test('never reads aberta while its site does not answer', async () => {
    const { app, other } = await start();
    other.close();
    await app.createGame(group(other));
    await app.waitForStatus('principal', 'reloading', 15000);
    for (let check = 0; check < 6; check += 1) {
      expect((await app.accountView('principal')).status).not.toBe('connected');
      await new Promise((resolve) => setTimeout(resolve, 500));
    }
  });

  test('blocks suspension while an account is open', async () => {
    const { app, other } = await start();
    await app.createGame(group(other));
    await app.waitForStatus('principal', 'connected', 15000);
    await app.waitFor(() => app.powerActive(), 3000);
  });

  test('has no limit of accounts', async () => {
    const { app, other } = await start();
    await app.createGame(group(other));
    for (const name of ['Alt 1', 'Alt 2', 'Alt 3', 'Alt 4']) {
      await app.execute({ type: 'add-account', gameId: gameId('outro'), name });
    }
    const view = await app.view();
    expect(view.accounts).toHaveLength(5);
    expect(view.groups[1]?.limit).toBeNull();
  });

  test('is refused with the reason when the site already has a group', async () => {
    const { app, other } = await start();
    expect(await app.createGame(group(other))).toBeNull();
    expect(await app.createGame({ ...group(other), name: 'De novo' })).toBe('duplicate-site');
    expect((await app.view()).groups).toHaveLength(2);
  });
});
